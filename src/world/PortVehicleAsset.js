// Single MMC player trial and rejected historical AI derivatives. Neither
// rendering nor prior GPU provenance grants final visual or licence admission.
import { BufferAttribute, BufferGeometry, Group, Mesh } from '../engine/index.js';
import { loadGLB } from '../engine/loaders/GLTF.js';
import { createVehicleMaterial } from './PortVehicleMaterial.js';
import { rigPortWheels } from './PortWheelRig.js';

const files = {
  car: ['mmc-sedan-ai68.glb', 'estate-lod1.glb'],
  van: [null, 'panel-van-lod1.glb'],
  utility: [null, 'compact-lod1.glb'],
};
const sources = new Map();

function floats(attribute) {
  if (attribute.array instanceof Float32Array) return attribute.array;
  const values = new Float32Array(attribute.array.length);
  const divisor = attribute.normalized ? ({ Int8Array: 127, Uint8Array: 255,
    Int16Array: 32767, Uint16Array: 65535 }[attribute.array.constructor.name] || 1) : 1;
  for (let i = 0; i < values.length; i++) values[i] = Math.max(-1, attribute.array[i] / divisor);
  return values;
}

async function source(kind, lod) {
  const file = files[kind]?.[lod];
  if (!file) throw Error(`unknown_port_vehicle_kind_or_lod:${kind}:${lod}`);
  if (!sources.has(file)) sources.set(file, loadGLB((import.meta.env?.BASE_URL || '/') +
    `models/port/${file}`).then(gltf => {
    const geometries = gltf.meshes.map(primitives => primitives.map(primitive => {
      if (primitive.mode !== 4) return null;
      const geometry = new BufferGeometry(), attrs = primitive.attributes;
      geometry.setAttribute('position', new BufferAttribute(floats(attrs.POSITION), 3));
      if (attrs.NORMAL) geometry.setAttribute('normal', new BufferAttribute(floats(attrs.NORMAL), 3));
      if (attrs.TEXCOORD_0) geometry.setAttribute('uv', new BufferAttribute(floats(attrs.TEXCOORD_0), 2));
      if (primitive.indices) geometry.setIndex(new BufferAttribute(primitive.indices, 1));
      geometry.computeBoundingSphere();
      return geometry;
    }));
    return { gltf, geometries, textureCache: new Map() };
  }));
  return sources.get(file);
}

export async function createPortVehicleCandidate(kind, paint = 0xd6d5ce, lod = 1) {
  const { gltf, geometries, textureCache } = await source(kind, lod);
  const root = new Group(); root.name = `Bracken Quay provisional candidate ${kind} LOD${lod}`;
  // OpenX vehicle fronts are +X; the road graph's forward axis is +Z.
  const orientation = new Group(); orientation.rotation.y = kind === 'car' && lod === 0 ? 0 : -Math.PI / 2;
  root.add(orientation);
  const materials = new Map();
  materials.set(undefined, await createVehicleMaterial(gltf, undefined, textureCache));
  for (let index = 0; index < gltf.materials.length; index++) {
    materials.set(index, await createVehicleMaterial(gltf, index, textureCache));
  }
  const nodes = gltf.nodes.map(node => {
    const object = new Group(); object.name = node.name;
    object.position.set(...node.t);
    object.quaternion.set(...node.r);
    object.scale.set(...node.s);
    return object;
  });
  for (let i = 0; i < gltf.nodes.length; i++) {
    const node = gltf.nodes[i];
    // This separate badge mesh can be omitted without cutting body geometry.
    if (node.name !== 'Branding_Static' && node.mesh !== undefined) {
      gltf.meshes[node.mesh].forEach((primitive, part) => {
        const geometry = geometries[node.mesh][part];
        if (!geometry) return;
        const mesh = new Mesh(geometry, materials.get(primitive.material));
        mesh.name = `${node.name} part ${part}`;
        mesh.castShadow = true; mesh.receiveShadow = true;
        nodes[i].add(mesh);
      });
    }
    for (const child of node.children) nodes[i].add(nodes[child]);
  }
  for (const index of gltf.roots) orientation.add(nodes[index]);
  Object.assign(root.userData, rigPortWheels(nodes, kind === 'car' && lod === 0));
  root.userData.provisionalAsset = files[kind][lod];
  if (kind === 'car' && lod === 0) {
    root.userData.lampMaterials = { head: [], tail: [] };
    for (const [index, mat] of materials) {
      mat.localLightsCheap = false;
      const name = gltf.materials[index]?.name || '';
      if (name === 'Headlight Metal') root.userData.lampMaterials.head.push(mat);
      if (name.startsWith('Glass - Red')) root.userData.lampMaterials.tail.push(mat);
    }
  }
  return root;
}
