import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, PlaneGeometry,
  InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, Color } from '../engine/index.js';
import { G } from '../engine/render/Frame.js';
import { standard } from '../materials/Materials.js';
import { Texture } from '../engine/gpu/Texture.js';
import { PORT, PORT_EDGES, PORT_NODES, roadPosition, portIslandHeight } from './PortRoadGraph.js';
import { JUNCTION_TRIM, junctionBoundary, triangulateRoadBoundary } from './PortRoadJunction.js';
import { PORT_VEHICLE_FOOTPRINTS, PortTraffic, portVehicleOverlap, portVehicleBarrierOverlap, vehicleMotionBlocked } from './PortTraffic.js';
import { loadPortGatehouse } from './PortGatehouseAsset.js';
import { createPortVehicleCandidate } from './PortVehicleAsset.js';
import { steeringFromPoses, steerPortWheels, spinPortWheels } from './PortWheelRig.js';
import { PortCargoScene } from './PortCargoScene.js';
import { portMasonry } from './PortMasonry.js';
import { partitionPortDetails } from './PortDetailBatches.js';

const material = (name, color, roughness = .92) => {
  const result = standard({ name, color, roughness });
  result.underwaterLighting = 'none';
  result.localLightsCheap = true;
  return result;
};
const SURFACES = {
  asphalt: material('Bracken Quay patched asphalt', 0x343b3c),
  asphaltPatch: material('Bracken Quay asphalt repair', 0x293033),
  concrete: material('Bracken Quay weathered concrete', 0x777d79),
  line: material('Bracken Quay worn lane paint', 0xc7bd98),
  steel: material('Bracken Quay oxidised steel', 0x596368),
  dark: material('Bracken Quay dark industrial steel', 0x333c3e),
  yellow: material('Bracken Quay safety yellow', 0xc39a41),
  red: material('Bracken Quay port red', 0x8c4038),
  blue: material('Bracken Quay container blue', 0x405e6b),
  rust: material('Bracken Quay rust', 0x75544a),
  glass: material('Bracken Quay vehicle glazing', 0x334d58, .35),
  lamp: material('Bracken Quay sodium lamp', 0xe0bd70),
  workLamp: material('Bracken depot work-light diffuser', 0xd3d5cf),
  gravel: material('Bracken Quay brownfield gravel', 0x68675d),
  faded: material('Bracken Quay faded industrial paint', 0xa5a095),
  oil: material('Bracken Quay oil and tyre staining', 0x242b2b),
  concreteDark: material('Bracken Quay stained concrete', 0x5b625f),
};
const box = (parent, name, w, h, d, x, y, z, surface, yaw = 0) => {
  const mesh = new Mesh(new BoxGeometry(w, h, d), surface);
  mesh.name = name; mesh.position.set(x, y, z); mesh.rotation.y = yaw;
  mesh.castShadow = h > .35; mesh.receiveShadow = true; parent.add(mesh); return mesh;
};
const post = (parent, name, x, z, height, radius, surface) => {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, height, 7), surface);
  mesh.name = name; mesh.position.set(x, PORT.roadY + height / 2, z);
  mesh.castShadow = true; parent.add(mesh); return mesh;
};
const PORT_SIGN_LABELS = Object.freeze({
  gate: 'PORT ENTRANCE', west: 'WEST YARD', north: 'NORTH STORES',
  depot: 'MAINTENANCE', east: 'EAST QUAY', quay: 'WORKING QUAY',
  checkpoint: 'CHECKPOINT', circle: 'FREIGHT ROUTE', service: 'UTILITIES',
});
function portSignFace(parent, title, x, y, z, yaw = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#263d4a'; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#e6e4d5'; ctx.fillRect(18, 20, 476, 6);
  ctx.textAlign = 'center'; ctx.fillStyle = '#f5f1df';
  ctx.font = 'bold 53px sans-serif'; ctx.fillText(title, 256, 121, 475);
  ctx.fillStyle = '#d6bf73'; ctx.font = 'bold 30px sans-serif';
  ctx.fillText('BRACKEN SOUND · PORT', 256, 190, 475);
  const texture = new Texture({ label: `Bracken route sign ${title}`, width: 512,
    height: 256, data: ctx.getImageData(0, 0, 512, 256).data });
  const face = standard({ name: `Bracken route lettering ${title}`, color: 0xffffff,
    roughness: .82, textures: { signInk: texture },
    surface: 'let ink=textureSample(signInk,smpAnisoClamp,vec2f(in.uv.x,1.0-in.uv.y)).rgb;s.albedo=ink;' });
  face.underwaterLighting = 'none'; face.localLightsCheap = true;
  const mesh = new Mesh(new PlaneGeometry(2.35, .77), face);
  mesh.name = `Bracken Sound signed direction ${title}`;
  mesh.position.set(x, y, z); mesh.rotation.y = yaw; parent.add(mesh);
}
const TURN_APRON = JUNCTION_TRIM;
function junctionFootprint(node) {
  const { boundary } = junctionBoundary(node, PORT_EDGES, PORT_NODES);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(
    boundary.flatMap(p => [p.x, 0, p.z]), 3));
  const indices = triangulateRoadBoundary(boundary);
  // X/Z counterclockwise has -Y normal; reverse every triangle for the top.
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function junctionKerbs(node) {
  const { kerbs } = junctionBoundary(node, PORT_EDGES, PORT_NODES);
  const positions = [], indices = [];
  const quad = (a, b, c, d) => {
    const n = positions.length / 3; positions.push(...a, ...b, ...c, ...d);
    indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
  };
  for (let arm = 0; arm < kerbs.length; arm += 12) {
    const points = [kerbs[arm][0], ...kerbs.slice(arm, arm + 12).map(pair => pair[1])];
    const outside = points.map((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      return { x: p.x + dz / length * .18, z: p.z - dx / length * .18 };
    });
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = outside[i], c = points[i + 1], d = outside[i + 1];
      quad([a.x,.12,a.z], [b.x,.12,b.z], [c.x,.12,c.z], [d.x,.12,d.z]);
      quad([a.x,0,a.z], [a.x,.12,a.z], [c.x,0,c.z], [c.x,.12,c.z]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}

// Engineering proxy only. Release gate requires a sourced, visually inspected
// and optimised realistic vehicle family; these primitives are not final art.
export function createPortVehicleProxy(kind = 'car', paint = SURFACES.blue) {
  const root = new Group(); root.name = `Bracken Quay ${kind}`;
  const length = kind === 'van' ? 5.3 : kind === 'utility' ? 4.9 : 4.2;
  const height = kind === 'van' ? 2.1 : 1.55;
  box(root, `${kind} chassis`, 1.83, .42, length, 0, .78, 0, SURFACES.dark);
  box(root, `${kind} body`, 1.78, .52, length * .91, 0, 1.07, 0, paint);
  box(root, `${kind} cab`, 1.59, height - 1.01, length * (kind === 'van' ? .69 : .48), 0, 1.25 + (height - 1.01) / 2,
    kind === 'van' ? -.35 : -.16, SURFACES.glass);
  box(root, `${kind} front lamps`, 1.48, .12, .08, 0, .92, length * .46, SURFACES.lamp);
  box(root, `${kind} rear lamps`, 1.48, .12, .08, 0, .92, -length * .46, SURFACES.red);
  const wheels = [];
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const wheel = new Mesh(new CylinderGeometry(.37, .37, .23, 10), SURFACES.dark);
    wheel.name = `${kind} wheel ${side}:${end}`;
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * .91, .42, end * length * .31);
    root.add(wheel); wheels.push(wheel);
  }
  root.userData.wheels = wheels;
  return root;
}

export class PortIslandSystem {
  constructor(app) {
    this.app = app;
    if(app.thirdIsland?.portalInterior) {
      SURFACES.brick=portMasonry(app.thirdIsland.portalInterior,'brick',0xc7bbae);
      SURFACES.concrete=portMasonry(app.thirdIsland.portalInterior,'concrete',0xb8bcb6);
      SURFACES.concreteDark=portMasonry(app.thirdIsland.portalInterior,'concrete',0x91988e);
      SURFACES.asphalt=portMasonry(app.thirdIsland.portalInterior,'asphalt',0x50585e);
      SURFACES.asphaltPatch=portMasonry(app.thirdIsland.portalInterior,'asphalt',0x353c42);
    } else SURFACES.brick=SURFACES.rust;
    this.group = new Group(); this.group.name = 'Bracken Quay — working North Sea port';
    this.traffic = new PortTraffic(6);
    this.trafficMeshes = [];
    this.parkedMeshes = [];
    this.playerCar = createPortVehicleProxy('car', SURFACES.red);
    this.playerCar.position.set(PORT.x - 60, PORT.roadY, PORT.z + 55);
    this.playerCar.rotation.y = -.5;
    this.group.add(this.playerCar);
    this.driving = false; this.speed = 0; this.steer = 0; this.time = 0;
    this.depotPower = false; this.solids = []; this.barrierSegments = [];
    this.portLights = [];
    this.depotWorkLights = [];
    this.headlights = [-.7, .7].map(side => app.localLights?.add({
      position: new Vector3(), dir: new Vector3(0, -.07, 1), color: new Color(1, .93, .78),
      intensity: 90, range: 35, cosInner: .98, cosOuter: .8,
      kind: 'vehicle-headlight', enabled: false, side })).filter(Boolean);
    this.build();
    app.scene.add(this.group);
    // Isolated trial only: existing material-batched GLB export/import path.
    this.ivyGroup = new Group();
    this.ivyGroup.name = 'Reversible ivy trial';
    this.ivyGroup.visible = false;
    this.group.add(this.ivyGroup);
    this.ivyReady = Promise.all(['building', 'fence'].map(kind =>
      loadPortGatehouse((import.meta.env?.BASE_URL || '/') + `models/port/ivy-trial/${kind}-ivy.glb`)
        .then(model => {
          if (kind === 'building') model.position.set(PORT.x - 111, PORT.roadY, PORT.z - 86.5);
          else {
            // Gatehouse source x=-8.72, y=-3.3 -> game after -PI/2 rotation.
            model.position.set(PORT.x - 93.3, PORT.roadY + .07, PORT.z - 16.57);
          }
          this.ivyGroup.add(model);
          return model;
        }))).catch(error => { this.ivyError = error; console.error('Ivy trial load failed', error); });
    this.cargoScene = new PortCargoScene(this.group);
    this.cargoVehicleReady = this.cargoScene.loadVehicle();
    this.vehicleAssetsReady = this.loadVehicleCandidates();
    this.gatehouseReady = loadPortGatehouse().then(model => {
      model.name = 'Bracken Quay physically produced checkpoint candidate';
      model.position.set(PORT.x - 90, PORT.roadY + .07, PORT.z - 7.85);
      model.rotation.y = -Math.PI / 2;
      this.group.add(model);
      this.gatehouseModel = model;
      return model;
    }).catch(error => {
      this.gatehouseError = error;
      console.error('Bracken Quay checkpoint asset failed to load', error);
    });
  }

  addSolid(x, z, width, depth, tag) {
    this.solids.push({ x, z, width, depth, tag });
    this.app.colliders.addBox(new Vector3(x, PORT.roadY + 2, z),
      new Vector3(width / 2, 2, depth / 2), 0, { solid: true, tag });
  }

  addVehicleBarrier(x, z, length, yaw, tag) {
    const halfX = Math.cos(yaw) * length / 2;
    const halfZ = -Math.sin(yaw) * length / 2;
    this.barrierSegments.push({ ax: x - halfX, az: z - halfZ,
      bx: x + halfX, bz: z + halfZ, tag });
  }

  async loadVehicleCandidates() {
    const originals = [this.playerCar, ...this.trafficMeshes, ...this.parkedMeshes];
    const kinds = ['car', ...this.traffic.cars.map(car => car.kind),
      ...this.parkedMeshes.map(mesh => mesh.userData.portKind)];
    const colors = [0xb8c1c6, 0xced5d6, 0xe9e9e3, 0x8f9da3, 0xc5c2b6,
      0x767c7e, 0xa3abb0, 0xd8d2c7, 0xe8e7dc, 0x83919b];
    try {
      const candidates = await Promise.all(kinds.map((kind, i) =>
        createPortVehicleCandidate(kind, colors[i % colors.length], i === 0 ? 0 : 1)));
      for (let i = 0; i < originals.length; i++) {
        const previous = originals[i], replacement = candidates[i];
        replacement.position.copy(previous.position);
        replacement.rotation.y = previous.rotation.y;
        this.group.remove(previous); this.group.add(replacement);
      }
      this.playerCar = candidates[0];
      this.trafficMeshes = candidates.slice(1, 1 + this.traffic.cars.length);
      this.parkedMeshes = candidates.slice(1 + this.traffic.cars.length);
      this.vehicleAssetStatus = 'MMC_CPU_TRIAL_PLAYER_UNQUALIFIED_AI';
      return candidates;
    } catch (error) {
      this.vehicleAssetStatus = 'PROXY_FALLBACK';
      this.vehicleAssetError = error;
      console.error('Bracken Quay provisional vehicle load failed', error);
      return null;
    }
  }

  build() {
    this.buildRoads(); this.buildPort(); this.buildDepot(); this.buildFurniture(); this.buildArtDetail();
    for (const car of this.traffic.cars) {
      const paint = [SURFACES.blue, SURFACES.concrete, SURFACES.yellow, SURFACES.rust][car.id % 4];
      const mesh = createPortVehicleProxy(car.kind, paint);
      this.group.add(mesh); this.trafficMeshes.push(mesh);
    }
    // Static workday occupancy without simulation cost.
    for (const [x, z, yaw, kind] of [[-89, 49, .2, 'van'], [72, 91, 1.55, 'utility'], [104, -44, 2.8, 'car']]) {
      const parked = createPortVehicleProxy(kind, SURFACES.rust);
      parked.name += ' parked'; parked.position.set(PORT.x + x, PORT.roadY, PORT.z + z);
      parked.rotation.y = yaw; parked.userData.portKind = kind;
      this.group.add(parked); this.parkedMeshes.push(parked);
    }
  }

  buildRoads() {
    const Y = PORT.roadY;
    for (const edge of PORT_EDGES) {
      const a = PORT_NODES[edge.from], b = PORT_NODES[edge.to];
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      box(this.group, `${edge.roadClass} road ${edge.id}`, edge.width, .12, edge.length - 2 * TURN_APRON,
        x, Y - .02, z, SURFACES.asphalt, yaw);
      for (const side of [-1, 1]) {
        const offset = side * (edge.width / 2 + .09);
        box(this.group, `continuous kerb ${edge.id}`, .18, .12, edge.length - 2 * TURN_APRON,
          x + Math.cos(yaw) * offset, Y + .1, z - Math.sin(yaw) * offset, SURFACES.concrete, yaw);
      }
      for (let distance = TURN_APRON + 4; distance < edge.length - TURN_APRON - 3; distance += 12) {
        const pose = roadPosition(edge, distance / edge.length);
        box(this.group, `centre marking ${edge.id}`, .14, .014, 3.8, pose.x, Y + .048, pose.z, SURFACES.line, yaw);
      }
      if (edge.roadClass !== 'service' && edge.id !== 'checkpoint-gate') for (const side of [-1, 1]) {
        const edgeOffset = edge.width / 2 - .23;
        const offsetX = Math.cos(yaw) * edgeOffset * side;
        const offsetZ = -Math.sin(yaw) * edgeOffset * side;
        // Freight arterials meet without raised kerbs at their junctions.
        // Light edge paint stops before each shared node instead of crossing it.
        box(this.group, `worn edge line ${edge.id}`, .07, .012, Math.max(1, edge.length - 2 * TURN_APRON - 2),
          x + offsetX, Y + .05, z + offsetZ, SURFACES.line, yaw);
      }
    }
    for (const node of Object.values(PORT_NODES)) {
      const apron = new Mesh(junctionFootprint(node), SURFACES.asphalt);
      apron.name = `engineered curved junction ${node.id}`;
      apron.position.set(node.x, Y + .04, node.z);
      apron.receiveShadow = true; this.group.add(apron);
      const kerb = new Mesh(junctionKerbs(node), SURFACES.concrete);
      kerb.name = `curved kerb returns ${node.id}`; kerb.position.copy(apron.position);
      kerb.receiveShadow = true; this.group.add(kerb);
    }
    // Broad reclaimed hardstanding connects loading bays to the service roads.
    box(this.group, 'container yard hardstanding', 140, .1, 39, PORT.x - 15, Y - .05, PORT.z + 105, SURFACES.concrete);
    box(this.group, 'port gate apron', 50, .1, 30, PORT.x - 108, Y - .05, PORT.z + 24, SURFACES.concrete);
    // The player car starts in a marked staff/service bay, not on raw grass.
    box(this.group, 'staff parking hardstanding', 24, .08, 27,
      PORT.x - 60, Y - .025, PORT.z + 52, SURFACES.concreteDark);
    for (const x of [-69, -63, -57, -51]) box(this.group, 'staff parking bay separator',
      .12, .013, 11, PORT.x + x, Y + .022, PORT.z + 53, SURFACES.faded);
    box(this.group, 'staff parking stop line', 23, .013, .16,
      PORT.x - 60, Y + .022, PORT.z + 59, SURFACES.faded);
  }

  buildPort() {
    const Y = PORT.roadY;
    // Warehouse line, quay and container stacks use repeated original primitives.
    for (const [index, x, z, w, d] of [[1, -107, 95, 31, 21], [2, 105, 94, 34, 20]]) {
      const wx = PORT.x + x, wz = PORT.z + z;
      box(this.group, `Bracken freight shed ${index}`, w, 8.5, d, wx, Y + 4.2, wz, SURFACES.steel);
      box(this.group, `freight shed ${index} roof`, w + 1.5, .42, d + 1.5, wx, Y + 8.65, wz, SURFACES.dark);
      for (let bay = -1; bay <= 1; bay++) box(this.group, `loading door ${index}-${bay}`,
        5.1, 5.3, .12, wx + bay * w * .27, Y + 2.7, wz - d / 2 - .08, SURFACES.dark);
      for (let bay = -1; bay <= 1; bay++) {
        const bx = wx + bay * w * .27;
        box(this.group, `shed ${index} dock canopy ${bay}`, 6.6, .24, 2.1,
          bx, Y + 6.2, wz - d / 2 - 1.05, SURFACES.concreteDark);
        box(this.group, `shed ${index} dock apron ${bay}`, 5.8, .22, 3.3,
          bx, Y + .18, wz - d / 2 - 1.65, SURFACES.concreteDark);
        for (const side of [-1, 1]) box(this.group, `shed ${index} dock bumper ${bay}:${side}`,
          .24, 1.15, .28, bx + side * 2.72, Y + .75, wz - d / 2 - .25, SURFACES.dark);
      }
      for (const side of [-1, 1]) {
        box(this.group, `shed ${index} downpipe ${side}`, .16, 7.8, .18,
          wx + side * (w / 2 - .65), Y + 4, wz - d / 2 - .15, SURFACES.dark);
        box(this.group, `shed ${index} roof vent ${side}`, 2.9, .75, 1.5,
          wx + side * w * .27, Y + 9.1, wz + d * .16, SURFACES.concreteDark);
      }
      this.addSolid(wx, wz, w, d, `port-shed-${index}`);
    }
    for (let i = 0; i < 22; i++) {
      const row = Math.floor(i / 11), col = i % 11;
      const x = PORT.x - 47 + col * 10, z = PORT.z + 103 + row * 8;
      const levels = i % 4 === 0 ? 2 : 1;
      for (let level = 0; level < levels; level++) {
        const cz = z + 2.82;
        box(this.group, `freight container ${i} level ${level}`, 8.1, 2.6, 5.6,
          x, Y + 1.32 + level * 2.65, z,
          [SURFACES.blue, SURFACES.red, SURFACES.rust, SURFACES.steel][(i + level) % 4]);
        for (const side of [-1, 1]) box(this.group, `container ${i} end locking bar ${level}:${side}`,
          .055, 2.24, .06, x + side * 1.65, Y + 1.33 + level * 2.65, cz, SURFACES.faded);
      }
      this.addSolid(x, z, 8.1, 5.6, `container-${i}`);
    }
    // A gantry is the landmark visible over the shed roofline.
    const gx = PORT.x + 102, gz = PORT.z + 107;
    for (const side of [-1, 1]) post(this.group, 'quay gantry leg', gx + side * 17, gz, 22, .7, SURFACES.yellow);
    box(this.group, 'quay gantry beam', 35.8, 1.3, 1.5, gx, Y + 21.5, gz, SURFACES.yellow);
    box(this.group, 'gantry hoist', 3.5, 2.2, 3.5, gx + 4, Y + 19.7, gz, SURFACES.dark);
    this.gantry = this.group.children.at(-1);
    // The physically produced GLB supplies the gate furniture; these conservative
    // bounds cover its booth and mesh fence, but leave the traffic lane open.
    this.addSolid(PORT.x - 89.3, PORT.z - 12.9, 5.5, 4.25, 'gatehouse-booth');
    for (const side of [-1, 1]) this.addSolid(PORT.x - 90, PORT.z - 7.85 + side * 8.72,
      10, .2, 'gatehouse-fence');
    for (let i = 0; i < 14; i++) {
      const x = PORT.x - 89 + i * 15;
      box(this.group, 'quay edge barrier', 8, .65, .26, x, Y + .4, PORT.z + 116, SURFACES.yellow);
      this.addVehicleBarrier(x, PORT.z + 116, 8, 0, 'quay-edge-barrier');
    }
  }

  buildArtDetail() {
    const Y = PORT.roadY;
    // Art-only cuboids share one unit geometry per surface. This keeps the
    // authored detail pass from adding hundreds of individual draw calls.
    const batches = new Map();
    const at = (name, w, h, d, x, y, z, surface, yaw = 0) => {
      if (!batches.has(surface)) batches.set(surface, []);
      batches.get(surface).push({ name, w, h, d, x: PORT.x + x, y: Y + y, z: PORT.z + z, yaw });
    };
    // Road repairs and drainage are deliberately irregular rather than tiled.
    for (const [edgeId, fraction, lane, width, length] of [
      ['gate-circle', .3, -2.25, 2.2, 5.2], ['circle-warehouse', .58, 1.7, 2.4, 6.3],
      ['warehouse-east', .34, -1.8, 3.2, 7.1], ['north-depot', .63, 1.25, 2.1, 4.8],
      ['east-quay', .47, -2.2, 2.7, 5.4],
    ]) {
      const edge = PORT_EDGES.find(item => item.id === edgeId);
      const pose = roadPosition(edge, fraction, lane);
      box(this.group, `irregular road repair ${edgeId}`, width, .013, length,
        pose.x, Y + .055, pose.z, SURFACES.asphaltPatch, pose.yaw);
    }
    for (const [edgeId, fraction] of [['gate-circle', .52], ['circle-warehouse', .24],
      ['warehouse-east', .72], ['north-depot', .38], ['east-quay', .26]]) {
      const edge = PORT_EDGES.find(item => item.id === edgeId);
      const pose = roadPosition(edge, fraction, edge.width / 2 - .52);
      box(this.group, `roadside drain ${edgeId}`, .32, .014, .72,
        pose.x, Y + .052, pose.z, SURFACES.dark, pose.yaw);
    }
    // The checkpoint and freight route have readable working-day furniture.
    for (const [x, z] of [[-115, 9], [-111, 9], [-107, 9], [-103, 9], [-97, 9], [-92, 9]]) {
      post(this.group, 'checkpoint safety bollard', PORT.x + x, PORT.z + z, 1.04, .12, SURFACES.yellow);
    }
    at('checkpoint stop line', 6.8, .018, .22, -92, .06, 2, SURFACES.faded);
    at('checkpoint lane direction arrow shaft', .22, .018, 2.5, -106, .06, 1, SURFACES.faded);
    for (const side of [-1, 1]) at('checkpoint lane direction arrow head', .18, .018, 1.2,
      -106 + side * .44, .06, 2.25, SURFACES.faded, side * .62);
    const yardEdge = PORT_EDGES.find(edge => edge.id === 'warehouse-yard');
    const yardBarrier = roadPosition(yardEdge, .56, 5);
    for (const [x, z, yaw] of [[-54, 48, .2],
      [yardBarrier.x - PORT.x, yardBarrier.z - PORT.z, yardBarrier.yaw + Math.PI / 2], [88, 34, 1.4]]) {
      at('freight road crash barrier', 8, .48, .13, x, .62, z, SURFACES.steel, yaw);
      this.addVehicleBarrier(PORT.x + x, PORT.z + z, 8, yaw, 'freight-road-crash-barrier');
      for (const side of [-1, 1]) at('freight road crash barrier support', .16, .72, .18,
        x + side * 3.5, .38, z, SURFACES.dark, yaw);
    }
    // Mixed yard occupancy and working surfaces avoid a featureless hardstanding.
    for (const [x, z, w, d] of [[-122, 66, 12, 11], [-72, 105, 14, 8], [67, 109, 16, 12],
      [105, 38, 13, 17], [93, -107, 14, 11], [-19, -105, 18, 12],
      [-68, -32, 42, 33], [-105, 38, 25, 21]]) {
      at('worn hardstanding and gravel', w, .035, d, x, 0, z, SURFACES.gravel);
    }
    // An occupied contractor yard gives the road-fork foreground a purpose.
    for (const [x, z, yaw] of [[-79, -38, .05], [-66, -38, .05], [-53, -38, .05]]) {
      at('contractor yard storage container', 9.1, 2.5, 2.6, x, 1.31, z,
        x === -66 ? SURFACES.blue : SURFACES.rust, yaw);
      at('contractor yard container door seam', .06, 2.23, 2.5,
        x + 4.55, 1.31, z, SURFACES.dark, yaw);
    }
    for (const [x, z] of [[-82, -25], [-70, -25], [-57, -25]]) {
      at('contractor yard cable drum', 1.4, 1.2, 1.4, x, .68, z, SURFACES.concreteDark);
      at('contractor yard pallet', 2.4, .16, 1.7, x + 2.5, .17, z, SURFACES.rust);
    }
    for (const side of [-1, 1]) {
      const fenceZ = -32 + side * 12.4;
      for (const height of [.42, 1.12, 1.85]) at('contractor yard perimeter rail',
        41, .08, .08, -68, height, fenceZ, SURFACES.steel);
      for (let x = -88; x <= -48; x += 5) {
        at('contractor yard fence upright', .1, 2.1, .1,
          x, 1.08, fenceZ, SURFACES.steel);
      }
    }
    for (const [x, z, yaw] of [[-123, 73, .12], [-120, 89, -.24], [64, 103, 1.55], [89, 105, 1.55]]) {
      at('idle freight trailer bed', 2.65, .37, 7.6, x, 1.12, z, SURFACES.steel, yaw);
      for (const side of [-1, 1]) at('idle freight trailer wheel pair', .58, .72, .22,
        x + side * 1.18, .46, z - 2.2, SURFACES.dark, yaw);
    }
    for (const [x, z] of [[-124, 81], [-118, 97], [59, 112], [73, 112],
      [80, -109], [98, -112], [-27, -110]]) {
      at('industrial pallet stack', 2.2, .18, 1.4, x, .16, z, SURFACES.rust);
      at('mixed yard crates', 1.6, .84, 1.1, x, .67, z, SURFACES.faded);
    }
    // Quayside bollards and lighting form a second composed edge behind the yard.
    for (const x of [-72, -48, -24, 0, 24, 48, 72, 96]) {
      post(this.group, 'quayside mooring bollard', PORT.x + x, PORT.z + 117, .85, .25, SURFACES.dark);
    }
    for (const [x, z] of [[-73, 91], [82, 85], [100, -40]]) {
      post(this.group, 'high mast floodlight', PORT.x + x, PORT.z + z, 13, .18, SURFACES.steel);
      at('high mast floodlight crosshead', 2.8, .24, .28, x, 12.95, z, SURFACES.dark);
      for (const side of [-1, 1]) at('high mast floodlight housing', .9, .32, .42,
        x + side * .9, 12.75, z + .25, SURFACES.lamp);
    }
    // Brownfield zones stay sparse but are no longer uniform grass rectangles.
    for (const [x, z, yaw] of [[-10, -112, .2], [12, -115, -.35], [115, -93, .4]]) {
      at('weathered brownfield storage container', 5.4, 2.5, 2.35,
        x, 1.28, z, SURFACES.rust, yaw);
      at('brownfield container door', 4.9, 2.18, .055,
        x, 1.28, z + 1.2, SURFACES.steel, yaw);
    }
    for (const [x, z] of [[-5, -99], [28, -108], [119, -76]]) {
      at('utility compound slab', 7, .12, 6, x, .08, z, SURFACES.concreteDark);
      at('port electrical enclosure', 2.6, 2.2, 1.2, x, 1.22, z, SURFACES.steel);
      at('port electrical hazard panel', .8, .48, .06, x, 1.55, z + .64, SURFACES.yellow);
    }
    // The northwest shore is an old cargo-service precinct, not an unused
    // grass parcel. Its sheds face the outer freight road and its fenced
    // hardstandings face the water; keep the road turning envelope clear.
    for (const [name, x, z, w, d, height] of [
      ['cold-store', -59, -112, 28, 18, 7.3],
      ['net and rigging workshop', -111, -78, 19, 17, 5.6],
    ]) {
      at(`${name} occupied slab`, w + 13, .08, d + 13, x, -.005, z, SURFACES.concreteDark);
      at(`${name} masonry lower wall`, w, 1.5, d, x, .8, z, SURFACES.brick);
      at(`${name} weathered cladding`, w, height - 1.4, d,
        x, (height + 1.5) / 2, z, SURFACES.steel);
      // Two shallow roof pitches give a real ridge/eaves silhouette, with
      // closed end gables rather than a floating flat box lid.
      const half=(d+1.1)/2, rise=half*.12;
      for(const side of [-1,1]) {
        const roof=box(this.group,`${name} pitched roof ${side}`,w+1.2,.2,
          Math.hypot(half,rise),PORT.x+x,Y+height+rise/2+.12,
          PORT.z+z+side*half/2,SURFACES.dark);
        roof.rotation.x=side*Math.atan2(rise,half);
      }
      for(const side of [-1,1]) {
        const geometry=new BufferGeometry();
        geometry.setAttribute('position',new Float32BufferAttribute([
          PORT.x+x+side*w/2,Y+height,PORT.z+z-d/2,
          PORT.x+x+side*w/2,Y+height+rise,PORT.z+z,
          PORT.x+x+side*w/2,Y+height,PORT.z+z+d/2],3));
        geometry.setIndex(side<0?[0,2,1]:[0,1,2]);geometry.computeVertexNormals();
        const gable=new Mesh(geometry,SURFACES.steel);gable.name=`${name} closed gable`;this.group.add(gable);
      }
      at(`${name} north gutter`, w + 1.1, .22, .25,
        x, height + .02, z - d / 2 - .45, SURFACES.rust);
      for (const side of [-1, 1]) {
        at(`${name} downpipe`, .15, height, .17,
          x + side * (w / 2 - .8), height / 2, z + d / 2 + .16, SURFACES.dark);
        at(`${name} raised loading bumper`, 2.1, .55, .56,
          x + side * w * .25, .48, z + d / 2 + .42, SURFACES.yellow);
      }
      for (let bay = -1; bay <= 1; bay++) {
        const bayX = x + bay * w * .27;
        at(`${name} roller shutter`, 4.35, 4.35, .11,
          bayX, 2.27, z + d / 2 + .09, SURFACES.steel);
        at(`${name} shutter header`, 4.8, .43, .26,
          bayX, 4.72, z + d / 2 + .16, SURFACES.faded);
        for (let seam = 0; seam < 4; seam++) at(`${name} shutter course`, 4.2, .055, .04,
          bayX, .7 + seam * .88, z + d / 2 + .17, SURFACES.steel);
      }
      for (let rib = -3; rib <= 3; rib++) at(`${name} facade cladding rib`, .14, height - 1.6, .2,
        x + rib * w / 7, (height + 1.6) / 2, z + d / 2 + .15, SURFACES.faded);
      for(let rib=-3;rib<=3;rib++)at(`${name} rear cladding seam`,.07,height-1.6,.07,
        x+rib*w/7,(height+1.6)/2,z-d/2-.045,SURFACES.dark);
      for(const windowX of [-w*.29,0,w*.29]) {
        at(`${name} rear clerestory frame`,2.55,1.1,.12,x+windowX,height-1.2,z-d/2-.09,SURFACES.faded);
        at(`${name} rear clerestory glazing`,2.31,.86,.035,x+windowX,height-1.2,z-d/2-.17,SURFACES.glass);
        at(`${name} rear clerestory mullion`,.065,.95,.06,x+windowX,height-1.2,z-d/2-.2,SURFACES.dark);
        at(`${name} rear projecting sill`,2.7,.1,.3,x+windowX,height-1.78,z-d/2-.13,SURFACES.concreteDark);
      }
      at(`${name} extraction housing`, 2.4, 1.3, 2.2,
        x - w * .24, height + .9, z - d * .15, SURFACES.steel);
      at(`${name} service door`, 1.4, 2.4, .12,
        x + w / 2 - 1.3, 1.23, z + d / 2 + .12, SURFACES.rust);
      this.addSolid(PORT.x + x, PORT.z + z, w, d, `port-${name}`);
    }
    for (const [x, z, w, d] of [[-146, -31, 20, 25], [-118, -41, 15, 14]]) {
      at('western quayside laydown paving', w, .07, d,
        x, 0, z, SURFACES.concreteDark);
      for (const side of [-1, 1]) {
        // The smaller laydown opens toward the gate-west freight road. Its
        // former south rail cut across the live lane at the oblique junction.
        if (x === -118 && side === -1) continue;
        at('western laydown fence rail', w, .08, .08,
          x, 1.9, z + side * d / 2, SURFACES.steel);
        for (let index = -2; index <= 2; index++) at('western laydown fence post',
          .12, 2.15, .12, x + index * w / 4, 1.1,
          z + side * d / 2, SURFACES.steel);
      }
      for (let index = -1; index <= 1; index++) {
        at('precast coastal barrier stack', 3.7, .8, 1.05,
          x + index * 5, .5, z - d * .16, SURFACES.concrete);
        at('seawall repair cable drum', 1.2, 1.3, 1.2,
          x + index * 5, .72, z + d * .19, SURFACES.rust);
      }
    }
    // The water-facing edge has engineered fenders and a continuous coping;
    // these are not placed in the drivable lanes or on the sinking shoreline.
    at('quay reinforced concrete coping', 176, .68, 2.8,
      2, .4, 125, SURFACES.concreteDark);
    at('quay waterside face', 176, 2.5, .48,
      2, -.65, 126.65, SURFACES.concreteDark);
    for (let x = -78; x <= 82; x += 20) {
      at('quay rubber impact fender', 1.25, 2.7, .72,
        x, -.72, 127.05, SURFACES.dark);
      at('quay mooring ladder', .7, 2.2, .2,
        x + 4, -.46, 127.03, SURFACES.yellow);
      at('quay safety edge paint', 8, .013, .22,
        x + 9, .76, 123.8, SURFACES.yellow);
    }
    // Depot is appreciably more neglected than the operational port.
    for (const [x, z, w, d] of [[58, -117, 7, 6], [100, -118, 10, 5], [89, -86, 8, 6]]) {
      at('depot oil stained concrete', w, .014, d, x, .14, z, SURFACES.oil);
    }
    for (const [x, z] of [[61, -90], [68, -88], [91, -88]]) {
      at('depot abandoned service drum', .8, 1.2, .8, x, .7, z, SURFACES.rust);
    }
    // Coherent ground-use zones: staff parking, occupied loading courts,
    // fenced utilities and a rougher depot forecourt. These replace the
    // unexplained grass foregrounds rather than scattering isolated props.
    for (const [name, x, z, w, d, surface] of [
      ['west warehouse delivery court', -107, 61, 42, 34, SURFACES.concreteDark],
      ['east warehouse delivery court', 105, 60, 40, 37, SURFACES.concreteDark],
      ['depot service forecourt', 78, -81, 44, 22, SURFACES.gravel],
      ['power utility compound', 10, -103, 40, 29, SURFACES.gravel],
      ['northwest maintenance yard', -76, -43, 39, 29, SURFACES.concreteDark],
      ['east service-vehicle court', 124, -25, 23, 29, SURFACES.concreteDark],
      ['quay heavy-load apron', 13, 102, 130, 29, SURFACES.concreteDark],
    ]) at(name, w, .035, d, x, 0, z, surface);
    for (const [index, x, z, w, d] of [[1, -107, 95, 31, 21], [2, 105, 94, 34, 20]]) {
      // Shutter frames, brick/concrete plinths, ribs, gutters and roof plants
      // make the warehouses read as serviced freight buildings, not cubes.
      at(`shed ${index} foundation plinth`, w + 1.3, .46, d + .8,
        x, .25, z, SURFACES.concreteDark);
      for (const side of [-1, 1]) {
        at(`shed ${index} gutter ${side}`, w + 1.2, .2, .28,
          x, 8.5, z + side * (d / 2 + .55), SURFACES.dark);
        at(`shed ${index} roof parapet ${side}`, w + 1.2, .62, .28,
          x, 8.95, z + side * (d / 2 + .44), SURFACES.steel);
      }
      for (let rib = -4; rib <= 4; rib++) {
        at(`shed ${index} wall cladding rib ${rib}`, .12, 7.6, .15,
          x + rib * w / 9, 4.5, z - d / 2 - .13, SURFACES.concreteDark);
        at(`shed ${index} roof seam ${rib}`, .09, .024, d + .7,
          x + rib * w / 9, 8.91, z, SURFACES.faded);
      }
      for (let bay = -1; bay <= 1; bay++) {
        const bx = x + bay * w * .27;
        at(`shed ${index} numbered dock header ${bay}`, 4.8, .55, .14,
          bx, 6.3, z - d / 2 - .19, SURFACES.yellow);
        for (const edge of [-1, 1]) at(`shed ${index} bay guide ${bay}:${edge}`,
          .15, 5.4, .18, bx + edge * 2.65, 2.85, z - d / 2 - .2, SURFACES.faded);
        for (let seam = 0; seam < 5; seam++) at(`shed ${index} shutter seam ${bay}:${seam}`,
          4.9, .07, .04, bx, .6 + seam * .98, z - d / 2 - .19, SURFACES.steel);
      }
      at(`shed ${index} electrical service cabinet`, 1.15, 2.1, .55,
        x + w / 2 - 1.3, 1.2, z - d / 2 - .42, SURFACES.concreteDark);
      at(`shed ${index} roof extraction duct`, 9.2, .85, 1.1,
        x, 9.3, z + 2.5, SURFACES.steel);
    }
    // Corrugation and handling details keep each container legible at road
    // distance. They are batched by material with the other static art.
    for (let i = 0; i < 22; i++) {
      const row = Math.floor(i / 11), col = i % 11;
      const x = -47 + col * 10, z = 103 + row * 8;
      const levels = i % 4 === 0 ? 2 : 1;
      for (let level = 0; level < levels; level++) {
        for (let rib = -3; rib <= 3; rib++) at(`container ${i} corrugation ${level}:${rib}`,
          .065, 2.28, 5.52, x + rib * 1.05, 1.34 + level * 2.65, z,
          SURFACES.concreteDark);
        for (const end of [-1, 1]) at(`container ${i} corner casting ${level}:${end}`,
          .24, .26, .28, x + end * 3.94, .12 + level * 2.65, z + 2.65,
          SURFACES.dark);
      }
    }
    // The depot now has a visible structural rhythm, service equipment and
    // a real electrical bay around the existing working breaker. The central
    // entry-to-breaker walking route remains clear.
    for (const z of [-117, -108, -99, -92]) {
      for (const x of [63.4, 92.6]) {
        at('depot portal column', .52, 6.65, .54, x, 3.45, z, SURFACES.steel);
        at('depot column base plate', .95, .19, .95, x, .18, z, SURFACES.dark);
      }
      at('depot roof tie beam', 30, .28, .28, 78, 6.58, z, SURFACES.steel);
      at('depot roof truss lower chord', 30, .16, .16, 78, 5.85, z, SURFACES.steel);
      for (const x of [70, 78, 86]) at('depot roof truss web', .16, .75, .16,
        x, 6.2, z, SURFACES.steel);
    }
    for (const x of [68, 78, 88]) {
      at('depot front lintel', 8.5, .44, .45, x, 6.65, -90.5, SURFACES.concreteDark);
      at('depot floor maintenance lane', .12, .012, 22, x, .14, -105,
        x === 78 ? SURFACES.yellow : SURFACES.faded);
    }
    for (const z of [-114, -108, -102, -96]) {
      at('depot wall pilaster west', .32, 5.8, .48, 62.7, 3.2, z, SURFACES.concreteDark);
      at('depot wall pilaster east', .32, 5.8, .48, 93.3, 3.2, z, SURFACES.concreteDark);
    }
    for (const [x, z] of [[89, -113], [89, -105], [89, -97]]) {
      at('depot workshop bench', 3.9, .18, 1.35, x, 1.05, z, SURFACES.steel);
      at('depot workshop lower shelf', 3.6, .1, 1.2, x, .45, z, SURFACES.rust);
      for (const side of [-1, 1]) at('depot workshop bench leg', .12, 1.05, .12,
        x + side * 1.68, .55, z, SURFACES.dark);
    }
    at('depot breaker switchgear cabinet', .75, 2.25, 2.25,
      63.25, 1.45, -115, SURFACES.steel);
    // Face the usable electrical bay toward the centre aisle. The player
    // interacts from the clear floor in front of this cabinet.
    at('depot breaker yellow safety surround', .08, 1.55, 1.12,
      63.71, 1.47, -115, SURFACES.yellow);
    at('depot breaker dark control plate', .045, 1.17, .83,
      63.77, 1.47, -115, SURFACES.dark);
    at('depot breaker red isolator handle', .19, .35, .12,
      63.91, 1.57, -115, SURFACES.red);
    at('depot breaker status lamp', .09, .16, .16,
      63.82, 2.02, -114.68, SURFACES.lamp);
    // A small aisle-side local isolator faces the actual approach. Its cable
    // run leads to the wall switchgear; the interaction anchor stays clear.
    at('depot aisle isolator pedestal', .16, 1.28, .16,
      66, .78, -112, SURFACES.steel);
    at('depot aisle isolator box', .96, .78, .28,
      66, 1.53, -112, SURFACES.yellow);
    at('depot aisle isolator face', .7, .55, .03,
      66, 1.53, -112.17, SURFACES.dark);
    at('depot aisle isolator lever', .14, .32, .15,
      66, 1.54, -112.27, SURFACES.red);
    at('depot aisle isolator conduit', .12, .1, 3,
      64.5, 2.24, -112, SURFACES.steel);
    at('depot electrical conduit overhead', .18, .18, 20,
      63.1, 6.6, -105, SURFACES.steel);
    for (const z of [-114, -106, -98]) {
      at('depot suspended work lamp', 2.3, .14, .62, 78, 5.66, z, SURFACES.workLamp);
      at('depot lamp drop rod', .09, .7, .09, 78, 6.1, z, SURFACES.dark);
    }
    for (const [x, z] of [[64, -99], [66, -97], [91, -116]]) {
      at('depot spare machinery frame', 1.6, 1.25, 1.8, x, .77, z, SURFACES.rust);
      at('depot machinery top cover', 1.7, .14, 1.9, x, 1.49, z, SURFACES.steel);
    }
    // Container handling and maritime safety have clear operational zones.
    for (const x of [-57, -27, 3, 33, 63]) {
      at('quay service trench cover', 4.1, .018, .42, x, .08, 115, SURFACES.dark);
      at('quay faded loading exclusion stripe', .22, .012, 8.4,
        x + 8.5, .08, 114, SURFACES.yellow);
    }
    for (const [x, z] of [[-61, 90], [-27, 91], [13, 90], [57, 90]]) {
      at('container yard spreader rail', 8.5, .24, .22, x, 6.8, z, SURFACES.yellow);
      for (const side of [-1, 1]) at('container yard handling frame upright',
        .25, 6.6, .25, x + side * 4.15, 3.45, z, SURFACES.steel);
    }
    for (const [x, z] of [[-34, -103], [26, -99]]) {
      post(this.group, 'utility fuel and water service tank', PORT.x + x,
        PORT.z + z, 3.8, 1.45, SURFACES.steel);
      at('utility tank pipe manifold', 5.3, .22, .22, x + 3, 1.2, z, SURFACES.dark);
      at('utility isolation plinth', 4.7, .24, 4.4, x, .16, z, SURFACES.concreteDark);
    }
    // Workshop storage belongs on the rear service wall, leaving the central
    // vehicle aisle and west-side breaker access clear. Open shelving and
    // drawer cabinets replace the featureless blocks formerly on the floor.
    for(const x of [71,78,85]) {
      for(const side of [-1,1])at('depot storage rack upright',.1,3.25,.1,x+side*2.1,1.72,-117.3,SURFACES.steel);
      for(const h of [.35,1.35,2.35,3.2]) {
        at('depot storage rack shelf',4.4,.09,1.1,x,h,-117.3,SURFACES.dark);
        for(const side of [-1,1])at('depot rack shelf beam',4.45,.13,.08,x,h-.05,-117.3+side*.53,SURFACES.rust);
      }
      for(const h of [.65,1.67,2.65])for(const side of [-1,1]) {
        at('depot labelled parts carton',.9,.53,.72,x+side*1.05,h,-117.3,SURFACES.faded);
        at('depot carton packing band',.07,.54,.735,x+side*1.05,h,-117.3,SURFACES.dark);
        at('depot carton label',.24,.15,.015,x+side*1.05+.17,h,-116.932,SURFACES.line);
      }
    }
    for(const z of [-111,-102]) {
      at('depot rolling tool chest carcass',1.7,.94,.78,90,.66,z,SURFACES.red);
      at('depot tool chest worktop',1.82,.09,.87,90,1.17,z,SURFACES.dark);
      for(let drawer=0;drawer<5;drawer++) {
        at('depot tool drawer front',1.54,.14,.04,90,.31+drawer*.17,z+.41,SURFACES.steel);
        at('depot tool drawer handle',.78,.025,.045,90,.36+drawer*.17,z+.455,SURFACES.faded);
      }
      for(const side of [-1,1])at('depot tool chest caster',.16,.2,.16,90+side*.63,.16,z+.25,SURFACES.dark);
    }
    const unit = new BoxGeometry(1, 1, 1);
    const transform = new Matrix4(), position = new Vector3(), rotation = new Quaternion(),
      scale = new Vector3(), up = new Vector3(0, 1, 0);
    // The measured 64m trial did not improve end-to-end throughput. Keep it
    // development-only until a repeated, matched benchmark supports promotion.
    const legacy = !(import.meta.env?.DEV && this.app.qs?.get('detailBatches') === 'spatial');
    const detailBatches = legacy ? [...batches].map(([surface,items])=>({surface,items,cell:'legacy'})) : partitionPortDetails(batches);
    for (const {surface, cell, items} of detailBatches) {
      const mesh = new InstancedMesh(unit, surface, items.length);
      mesh.name = `Bracken authored detail · ${surface.name} · cell ${cell}`;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = !legacy;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        position.set(item.x, item.y, item.z);
        rotation.setFromAxisAngle(up, item.yaw);
        scale.set(item.w, item.h, item.d);
        transform.compose(position, rotation, scale);
        mesh.setMatrixAt(i, transform);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // Bounds include rotation, scale and all vertices, including objects
      // extending outside their assigned cell. Static detail never moves later.
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  buildDepot() {
    const Y = PORT.roadY, x = PORT.x + 78, z = PORT.z - 105;
    box(this.group, 'Old Bracken Transit depot floor', 32, .2, 29, x, Y + .02, z, SURFACES.concrete);
    box(this.group, 'depot west wall', .8, 7, 29, x - 16, Y + 3.55, z, SURFACES.brick);
    box(this.group, 'depot east wall', .8, 7, 29, x + 16, Y + 3.55, z, SURFACES.brick);
    box(this.group, 'depot rear wall', 32, 7, .8, x, Y + 3.55, z - 14.5, SURFACES.brick);
    box(this.group, 'depot front left', 10, 7, .8, x - 11, Y + 3.55, z + 14.5, SURFACES.steel);
    box(this.group, 'depot front right', 10, 7, .8, x + 11, Y + 3.55, z + 14.5, SURFACES.steel);
    box(this.group, 'depot roof', 33, .5, 30, x, Y + 7.22, z, SURFACES.dark);
    for (const [sx, sz, w, d] of [[x - 16, z, .8, 29], [x + 16, z, .8, 29], [x, z - 14.5, 32, .8],
      [x - 11, z + 14.5, 10, .8], [x + 11, z + 14.5, 10, .8]]) this.addSolid(sx, sz, w, d, 'depot-wall');
    this.breaker = { x: x - 12, z: z - 10 };
    // Aisle-side interaction anchor; the visible isolator is on the adjacent
    // west-wall cabinet rather than a box occupying the player's standing spot.
    this.depotLamp = box(this.group, 'depot state lamp', 1.1, .3, 1.1,
      x, Y + 6.6, z, SURFACES.dark);
    if(this.app.localLights)for(const dz of [-9,-1,7])this.depotWorkLights.push(this.app.localLights.add({
      position:new Vector3(x,Y+5.4,z+dz),color:new Color(1,.91,.76),
      intensity:38,range:13,kind:'depot-worklight',alwaysOn:true,enabled:false,
    }));
  }

  buildFurniture() {
    const Y = PORT.roadY;
    for (const edge of PORT_EDGES) {
      const count = Math.floor(edge.length / 33);
      for (let i = 1; i <= count; i++) {
        const pose = roadPosition(edge, i / (count + 1), edge.width / 2 + 2.6);
        post(this.group, 'port road light', pose.x, pose.z, 7.4, .13, SURFACES.steel);
        box(this.group, 'sodium light head', 1.2, .18, .5, pose.x, Y + 7.36, pose.z, SURFACES.lamp);
        this.addPortLight(pose.x, Y + 7.15, pose.z, 110, 27);
      }
    }
    // Arrival parking is a serviced space, not an unlit presentation platform.
    const px = PORT.x - 66, pz = PORT.z + 62;
    post(this.group, 'arrival parking lamp', px, pz, 7.4, .13, SURFACES.steel);
    box(this.group, 'arrival parking luminaire', 1.2, .18, .5, px, Y + 7.36, pz, SURFACES.lamp);
    this.addPortLight(px, Y + 7.15, pz, 140, 29);
    for (const [id, node] of Object.entries(PORT_NODES)) {
      if (id === 'warehouse' || id === 'yard') continue;
      const clear = (x, z) => portIslandHeight(x, z) >= 4.9 && PORT_EDGES.every(edge => {
        const a = PORT_NODES[edge.from], b = PORT_NODES[edge.to];
        const dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / edge.length ** 2));
        return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) > edge.width / 2 + 3;
      }) && !this.solids.some(s => Math.abs(x - s.x) < s.width / 2 + 2 && Math.abs(z - s.z) < s.depth / 2 + 2);
      const candidates = Array.from({ length: 24 }, (_, i) => {
        const angle = Math.PI / 4 + i * Math.PI / 12;
        return { x: node.x + Math.cos(angle) * 18, z: node.z + Math.sin(angle) * 18 };
      });
      const site = candidates.find(p => clear(p.x, p.z));
      if (!site) throw Error(`no_safe_port_sign_site:${id}`);
      post(this.group, `direction sign ${id}`, site.x, site.z, 2.9, .1, SURFACES.steel);
      box(this.group, `Bracken Sound route sign ${id}`, 2.4, .82, .12,
        site.x, Y + 2.6, site.z, SURFACES.blue);
      const label = PORT_SIGN_LABELS[id] || id.toUpperCase();
      portSignFace(this.group, label, site.x, Y + 2.6, site.z + .067);
      portSignFace(this.group, label, site.x, Y + 2.6, site.z - .067, Math.PI);
    }
    for (let i = 0; i < 10; i++) {
      const x = PORT.x + 132, z = PORT.z - 55 + i * 12;
      post(this.group, 'port perimeter fence post', x, z, 2.4, .08, SURFACES.steel);
      if (i < 9) box(this.group, 'port perimeter mesh fence', .06, 1.9, 12, x, Y + 1.1, z + 6, SURFACES.steel);
    }
  }

  addPortLight(x, y, z, intensity, range) {
    if (!this.app.localLights) return;
    this.portLights.push(this.app.localLights.add({ position: new Vector3(x, y, z),
      color: new Color(1, .78, .48), intensity, range, kind: 'industrial',
      dir: new Vector3(0, -1, 0), cosInner: .8, cosOuter: .1 }));
  }

  blocked(x, z, yaw = 0) {
    const onBerth = Math.abs(x-PORT.x)<36 && z-PORT.z>=128 && z-PORT.z<157;
    if (!onBerth && Math.hypot((x - PORT.x) / (PORT.radiusX - 10), (z - PORT.z) / (PORT.radiusZ - 10)) >= 1) return true;
    const car = PORT_VEHICLE_FOOTPRINTS.player;
    const marginX = Math.abs(Math.sin(yaw)) * car.length / 2 +
      Math.abs(Math.cos(yaw)) * car.halfWidth;
    const marginZ = Math.abs(Math.cos(yaw)) * car.length / 2 +
      Math.abs(Math.sin(yaw)) * car.halfWidth;
    if (this.solids.some(solid => Math.abs(x - solid.x) < solid.width / 2 + marginX &&
      Math.abs(z - solid.z) < solid.depth / 2 + marginZ)) return true;
    if (this.barrierSegments.some(barrier => portVehicleBarrierOverlap({ x, z, yaw }, barrier))) return true;
    return false;
  }

  update(dt) {
    this.cargoScene.update(dt);
    const app = this.app, player = app.player, input = app.input;
    const car = this.playerCar;
    const cargo=this.cargoScene;
    if(!cargo.autoStarted && cargo.vehicle && !app.freeCam &&
      Math.hypot(player.position.x-PORT.x,player.position.z-(PORT.z+145))<60){
      cargo.autoStarted=true;
      if(!cargo.sequence.running && !cargo.sequence.pose.complete)cargo.sequence.start();
    }
    if(cargo.vehicle && cargo.sequence.pose.ready && !cargo.collected && !this.driving && !app.freeCam && player.mode==='walk'){
      const nearDelivery=Math.hypot(player.position.x-(PORT.x+cargo.vehicle.position.x),player.position.z-(PORT.z+cargo.vehicle.position.z))<4.2;
      if(nearDelivery && input.hit('KeyE')){
        cargo.collected=true;
        const delivered=cargo.vehicle;
        delivered.position.x+=PORT.x;delivered.position.z+=PORT.z;
        this.group.add(delivered);this.playerCar=delivered;
        this.driving=true;this.speed=0;
        app.ui?.ui.toast('Sedan collected: WASD drive, Space brake, R recover, E exit');
        return;
      }
    }
    this.time += dt;
    const close = Math.hypot(app.camera.position.x - PORT.x, app.camera.position.z - PORT.z) < 520;
    this.group.visible = close;
    for (const light of this.portLights) light.enabled = close;
    for (const light of this.depotWorkLights) light.enabled = close && this.depotPower;
    SURFACES.workLamp.emissive.setRGB(...(this.depotPower ? [2.4,2.18,1.82] : [0,0,0]));
    for (const light of this.headlights) {
      const yaw = car.rotation.y;
      light.enabled = close && this.driving;
      light.position.set(car.position.x + Math.sin(yaw) * 2.3 + Math.cos(yaw) * light.side,
        car.position.y + .68, car.position.z + Math.cos(yaw) * 2.3 - Math.sin(yaw) * light.side);
      light.dir.set(Math.sin(yaw), -.08, Math.cos(yaw)).normalize();
    }
    const lamps = car.userData.lampMaterials;
    if (lamps) {
      const on = this.driving ? Math.max(.05, G.night.value) : 0;
      for (const mat of lamps.head) mat.emissive.setRGB(on * 2, on * 1.8, on * 1.4);
      const stop = this.driving && input.down('Space') ? 1 : on * .3;
      for (const mat of lamps.tail) mat.emissive.setRGB(stop * 2, stop * .025, stop * .01);
    }
    SURFACES.lamp.emissive.setRGB(1, .65, .22);
    SURFACES.lamp.emissiveIntensity = Math.max(0, G.night.value) * 2;
    this.traffic.update(dt, {x:car.position.x,z:car.position.z,yaw:car.rotation.y});
    if (close) for (let i = 0; i < this.traffic.cars.length; i++) {
      const state = this.traffic.cars[i], mesh = this.trafficMeshes[i];
      const previous = mesh.userData.previousRoadPose;
      steerPortWheels(mesh, steeringFromPoses(previous, state.pose, mesh.userData.wheelbase || 2.8), dt);
      if (previous) spinPortWheels(mesh, Math.hypot(state.pose.x - previous.x, state.pose.z - previous.z));
      mesh.userData.previousRoadPose = { ...state.pose };
      mesh.position.set(state.pose.x, PORT.roadY, state.pose.z);
      mesh.rotation.y = state.pose.yaw;
    }
    if (this.gantry) this.gantry.position.x = PORT.x + 102 + 3 * Math.sin(this.time * .14);
    if (!this.driving && !app.freeCam && player.mode === 'walk') {
      const nearCar = player.position.distanceTo(car.position) < 4.2;
      const nearBreaker = Math.hypot(player.position.x - this.breaker.x, player.position.z - this.breaker.z) < 2.2;
      if (nearBreaker && input.hit('KeyE')) {
        this.depotPower = !this.depotPower;
        this.depotLamp.material = this.depotPower ? SURFACES.workLamp : SURFACES.dark;
        app.ui?.ui.toast(this.depotPower ? 'Old Bracken depot backup power restored' : 'Depot backup power isolated');
      } else if (nearCar && input.hit('KeyE')) {
        this.driving = true; this.speed = 0;
        app.ui?.ui.toast('Bracken Quay car: WASD drive, Space brake, R recover, E exit');
        return;
      }
    }
    if (!this.driving) return;
    if (input.hit('KeyE')) {
      this.driving = false; this.speed = 0;
      player.position.set(car.position.x + Math.cos(car.rotation.y) * 2.7,
        PORT.roadY, car.position.z - Math.sin(car.rotation.y) * 2.7);
      player.velocity.set(0, 0, 0);
      app.ui?.ui.toast('Exited vehicle'); return;
    }
    const throttle = Number(input.down('KeyW')) - Number(input.down('KeyS'));
    const steerInput = Number(input.down('KeyD')) - Number(input.down('KeyA'));
    const braking = input.down('Space');
    const target = braking ? 0 : throttle * (throttle < 0 ? 6 : 18);
    this.speed += (target - this.speed) * Math.min(1, dt * (braking ? 5 : 1.45));
    this.steer += (steerInput - this.steer) * Math.min(1, dt * 4);
    steerPortWheels(car, Math.atan((car.userData.wheelbase || 2.8) * this.steer *
      Math.min(1 / 5.5, .85 / Math.max(.01, Math.abs(this.speed)))), dt);
    // Freight-road junctions need a low-speed turning circle of about 5.5 m.
    // The previous 11 m minimum radius forced the car across the oncoming lane
    // at the gate/circle and depot corners. Cap yaw at speed to keep it calm.
    const turn = this.steer * Math.sign(this.speed) *
      Math.min(Math.abs(this.speed) / 5.5, .85) * dt;
    const yaw = car.rotation.y + turn;
    const x = car.position.x + Math.sin(yaw) * this.speed * dt;
    const z = car.position.z + Math.cos(yaw) * this.speed * dt;
    const trafficBlock = this.traffic.cars.some(other => vehicleMotionBlocked(
      {x:car.position.x,z:car.position.z,yaw:car.rotation.y},
      { x, z, yaw }, other.pose, 'player', other.kind));
    if (!this.blocked(x, z, yaw) && !trafficBlock) {
      car.rotation.y = yaw; car.position.x = x; car.position.z = z;
      spinPortWheels(car, this.speed * dt);
    } else this.speed = 0;
    car.position.y += ((PORT.roadY + .04 * Math.sin(this.time * 8)) - car.position.y) * Math.min(1, dt * 5);
    if (input.hit('KeyR')) { car.position.set(PORT.x - 60, PORT.roadY, PORT.z + 55); car.rotation.y = -.5; this.speed = 0; }
    app.camera.position.set(car.position.x - Math.sin(car.rotation.y) * 8,
      car.position.y + 4, car.position.z - Math.cos(car.rotation.y) * 8);
    app.camera.lookAt(new Vector3(
      car.position.x + Math.sin(car.rotation.y) * 5,
      car.position.y + 1.5,
      car.position.z + Math.cos(car.rotation.y) * 5,
    ));
  }
}
