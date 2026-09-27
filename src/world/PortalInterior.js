import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Vector3, Color, Euler, Quaternion, Matrix4, mergeGeometries } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { Texture } from '../engine/gpu/Texture.js';
import { buildRecipe } from './PortalInteriorRecipe.js';

const shapeGeometry = (shape, size) => {
  if (shape === 'cylinder') return new CylinderGeometry(size[0] * .5, size[0] * .5, size[1], 16);
  if (shape === 'sphere') return new SphereGeometry(.5, 16, 10);
  if (shape === 'torus') return new TorusGeometry(size[0] * .5, size[1] * .5, 12, 24);
  return new BoxGeometry(size[0], size[1], size[2]);
};

// Deterministic world-space detail keeps the merged batches small while retaining
// credible metre scale. The warm term is intentionally material-scoped: the global
// local-light pass is night-gated, so this restrained diffuse approximation preserves
// daytime task-light pools without changing the island sun or clock.
const portalSurface = (name, lights, origin) => {
  const fill = lights.map((light, i) => {
    const p = light.position.map((v, axis) => v + [origin.x, origin.y, origin.z][axis]);
    const c = new Color(light.color);
    return `let lp${i}=vec3f(${p[0]},${p[1]},${p[2]}); let lv${i}=lp${i}-in.P; let ld${i}=length(lv${i}); let la${i}=max(0.0,1.0-ld${i}/${light.range}); warm+=vec3f(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})*max(0.0,dot(in.N,normalize(lv${i})))*la${i}*la${i}*${(light.intensity * .018).toFixed(4)};`;
  }).join('');
  let detail = '';
  if (name === 'brick' || name === 'brickDark') detail = `let course=floor(in.P.y/.08); let q=vec2f(in.P.x+select(0.0,.125,i32(course)%2==1),in.P.y); let cell=fract(q/vec2f(.25,.08)); let joint=min(min(cell.x,1.0-cell.x)*.25,min(cell.y,1.0-cell.y)*.08); let grain=fract(sin(dot(floor(q/vec2f(.25,.08)),vec2f(12.9898,78.233)))*43758.5453); let mortar=1.0-smoothstep(.009,.014,joint); s.albedo=mix(s.albedo*(.76+grain*.28),vec3f(.105,.095,.085),mortar); s.roughness=mix(.92,1.0,mortar);`;
  else if (name === 'concrete' || name === 'concreteDark') detail = `let n=fract(sin(dot(floor(in.P.xz*3.0),vec2f(12.9898,78.233)))*43758.5453); let damp=smoothstep(.72,.96,fract(sin(dot(floor(in.P.xz*.55),vec2f(41.7,17.3)))*951.135)); s.albedo*=.82+n*.22-damp*.12; s.roughness=.82+n*.16-damp*.14;`;
  else if (name === 'steel' || name === 'rust' || name === 'black') detail = `let scratch=smoothstep(.94,.985,fract(sin(dot(floor(in.P.xy*vec2f(7.0,45.0)),vec2f(19.19,73.31)))*3157.7)); s.albedo*=1.0-scratch*.28; s.roughness+=scratch*.18;`;
  else if (name === 'wood') detail = `let grain=.5+.5*sin((in.P.x+sin(in.P.z*2.3)*.12)*38.0); s.albedo*=.84+grain*.2; s.roughness=.6+grain*.12;`;
  else if (name === 'fabric' || name === 'charcoal' || name === 'rug' || name === 'rugLight') detail = `let weave=.5+.5*sin(in.P.x*95.0)*sin(in.P.z*91.0); s.albedo*=.9+weave*.1; s.roughness=.94+weave*.05;`;
  return `${detail} var warm=vec3f(0.0); ${fill} s.emissive+=warm;`;
};

export class PortalInterior {
  constructor(app) {
    this.app = app;
    this.recipe = buildRecipe();
    this.origin = new Vector3(300, 18, 300);
    this.group = new Group();
    this.group.name = 'Island 3 warehouse portal interior';
    this.group.position.copy(this.origin);
    this.group.visible = false;
    app.scene.add(this.group);
    this.materials = {};
    for (const [name, spec] of Object.entries(this.recipe.materials)) {
      this.materials[name] = standard({
        name: `Portal ${name}`, color: spec.color, roughness: spec.roughness, metalness: spec.metalness,
        emissive: spec.emissive || 0, emissiveIntensity: spec.emissive ? 0.35 : 0,
        transparent: !!spec.transparent, opacity: spec.opacity ?? 1, depthWrite: spec.depthWrite ?? true,
        underwaterLighting: 'none', localLightsCheap: true,
        surface: portalSurface(name, this.recipe.lights || [], this.origin)
      });
    }
    this.localLightSources = (this.recipe.lights || []).map((light, index) => this.app.localLights.add({
      position: new Vector3(this.origin.x + light.position[0], this.origin.y + light.position[1], this.origin.z + light.position[2]),
      color: new Color(light.color), intensity: light.intensity, range: light.range, kind: 0,
      phase: index / Math.max(1, this.recipe.lights.length), enabled: false
    }));
    this.interiorColliders = [];
    this.buildGeometry();
    this.setInteriorCollidersEnabled(false);
    this.buildExteriorPortal();
    this.inside = false;
    this.cooldown = 0;
    this.returnState = null;
  }

  buildGeometry() {
    const batches = new Map();
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Euler();
    const quaternion = new Quaternion();
    const matrix = new Matrix4();
    for (const object of this.recipe.objects) {
      const geometry = shapeGeometry(object.shape, object.size);
      position.set(...object.position);
      rotation.set(...object.rotation);
      quaternion.setFromEuler(rotation);
      scale.set(1, 1, 1);
      if (object.shape === 'sphere') scale.set(...object.size);
      matrix.compose(position, quaternion, scale);
      geometry.applyMatrix4(matrix);
      if (!batches.has(object.material)) batches.set(object.material, []);
      batches.get(object.material).push(geometry);
      if (object.collider) {
        const p = object.position;
        const s = object.size;
        const center = new Vector3(this.origin.x + p[0], this.origin.y + p[1], this.origin.z + p[2]);
        const options = object.walkable ? { walkable: true, solid: true, tag: 'island3-portal' } : { solid: true, tag: 'island3-portal' };
        const record = this.app.colliders.addBox(center, new Vector3(s[0] * .5, s[1] * .5, s[2] * .5), object.rotation[1], options);
        this.interiorColliders.push({ record, solid: record.solid, walkable: record.walkable });
      }
    }
    for (const [material, geometries] of batches) {
      const mesh = new Mesh(geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false), this.materials[material]);
      mesh.name = `Portal ${material} batch (${geometries.length})`;
      this.group.add(mesh);
    }
  }

  setInteriorCollidersEnabled(enabled) {
    for (const collider of this.interiorColliders) {
      collider.record.solid = enabled ? collider.solid : false;
      collider.record.walkable = enabled ? collider.walkable : false;
    }
  }

  buildExteriorPortal() {
    const g = new Group();
    g.name = 'Signed Island 3 warehouse portal';
    const ground = this.app.player?.groundAt?.(100, 580, 30);
    this.exteriorGroundResolved = Number.isFinite(ground);
    this.exteriorGroundY = this.exteriorGroundResolved ? ground : 0;
    g.position.set(100, this.exteriorGroundY, 580);
    this.app.scene.add(g);
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#102b31'; ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#69ffe0'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, 1004, 236);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff0cd';
    ctx.font = 'bold 72px sans-serif'; ctx.fillText('WAREHOUSE LOFT', 512, 112);
    ctx.fillStyle = '#6effdf'; ctx.font = 'bold 38px sans-serif'; ctx.fillText('E TO ENTER', 512, 192);
    const texture = new Texture({ label: 'Warehouse Loft sign', width: 1024, height: 256, data: ctx.getImageData(0, 0, 1024, 256).data });
    const signMaterial = standard({ name: 'Warehouse Loft lettering', color: 0xffffff, roughness: .4, metalness: .1, textures: { warehouseSign: texture }, surface: 'let ink = textureSample(warehouseSign, smpAnisoClamp, vec2f(in.uv.x, 1.0-in.uv.y)).rgb; s.albedo=ink; s.emissive=ink*0.3;' });
    const sign = new Mesh(new BoxGeometry(4.8, 2.1, .18), signMaterial);
    sign.position.y = 2.4; g.add(sign);
    const frame = new Mesh(new TorusGeometry(1.35, .16, 10, 24), this.materials.amber);
    frame.position.set(0, 1.35, .2); g.add(frame);
    const post = new Mesh(new BoxGeometry(.18, 4, .18), this.materials.steel);
    post.position.y = 1.1; g.add(post);
    this.exterior = g;
  }

  toast(text) { this.app.ui?.ui.toast(text); }

  enter() {
    const p = this.app.player;
    if (this.inside || p.mode !== 'walk') return;
    this.returnState = { position: p.position.clone(), yaw: p.yaw };
    this.setInteriorCollidersEnabled(true);
    for (const source of this.localLightSources) source.enabled = true;
    this.inside = true;
    this.group.visible = true;
    p.position.set(this.origin.x + this.recipe.zones.arrival[0], this.origin.y + this.recipe.zones.arrival[1], this.origin.z + this.recipe.zones.arrival[2]);
    p.velocity.set(0, 0, 0);
    this.toast('Warehouse loft entered · E to return');
  }

  exit() {
    const p = this.app.player;
    this.inside = false;
    this.group.visible = false;
    for (const source of this.localLightSources) source.enabled = false;
    this.setInteriorCollidersEnabled(false);
    if (this.returnState) {
      p.position.copy(this.returnState.position);
      p.yaw = this.returnState.yaw;
    } else {
      const y = p.groundAt(100, 584, 30);
      p.position.set(100, Number.isFinite(y) ? y : 4.2, 584);
    }
    p.velocity.set(0, 0, 0);
    p.grounded = true;
    this.returnState = null;
    this.toast('Returned to Island 3');
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const p = this.app.player;
    if (!p) return;
    if (!this.exteriorGroundResolved) {
      const ground = p.groundAt?.(100, 580, 30);
      if (Number.isFinite(ground)) {
        this.exteriorGroundResolved = true;
        this.exteriorGroundY = ground;
        this.exterior.position.y = ground;
      }
    }
    if (this.cooldown > 0 || this.app.freeCam || p.mode !== 'walk') return;
    const exteriorY = p.groundAt(100, 580, 30);
    const nearOutside = !this.inside && Math.hypot(p.position.x - 100, p.position.z - 580) < 4.2 && (!Number.isFinite(exteriorY) || Math.abs(p.position.y - exteriorY) < 3);
    const nearInside = this.inside && Math.hypot(p.position.x - (this.origin.x - 4), p.position.z - this.origin.z) < 3.5;
    if (nearOutside) {
      p.prompt = { key: 'E', text: 'Enter warehouse loft' };
      if (this.app.input.hit('KeyE')) { this.enter(); this.cooldown = .8; }
    } else if (nearInside) {
      p.prompt = { key: 'E', text: 'Return to Island 3' };
      if (this.app.input.hit('KeyE')) { this.exit(); this.cooldown = .8; }
    }
  }
}
