// Small GLB path for the gatehouse and bounded ivy trial.
// Preserve legacy gatehouse materials; textured primitives use the audited PBR loader.
import { BufferAttribute, BufferGeometry, Group, Mesh } from '../engine/index.js';
import { loadGLB } from '../engine/loaders/GLTF.js';
import { standard } from '../materials/Materials.js';
import { createVehicleMaterial } from './PortVehicleMaterial.js';

const ASSET = (import.meta.env?.BASE_URL || '/') + 'models/port/bracken-gatehouse.glb';

function floats(attribute) {
  if (attribute.array instanceof Float32Array) return attribute.array;
  const out = new Float32Array(attribute.array.length);
  const divisor = attribute.normalized ? ({ Int8Array:127, Uint8Array:255, Int16Array:32767, Uint16Array:65535 }[attribute.array.constructor.name] || 1) : 1;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, attribute.array[i] / divisor);
  return out;
}

export async function loadPortGatehouse(asset = ASSET) {
  const gltf = await loadGLB(asset);
  const root = new Group();
  const nodes = gltf.nodes.map(node => {
    const object = new Group();
    object.name = node.name;
    object.position.set(...node.t);
    object.quaternion.set(node.r[0], node.r[1], node.r[2], node.r[3]);
    object.scale.set(...node.s);
    return object;
  });
  const materials = new Map();
  const textureCache = new Map();
  for (let i = 0; i < gltf.nodes.length; i++) {
    const node = gltf.nodes[i];
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh]) {
      if (primitive.mode !== 4) continue;
      const geometry = new BufferGeometry(), attrs = primitive.attributes;
      geometry.setAttribute('position', new BufferAttribute(floats(attrs.POSITION), 3));
      if (attrs.NORMAL) geometry.setAttribute('normal', new BufferAttribute(floats(attrs.NORMAL), 3));
      if (attrs.TEXCOORD_0) geometry.setAttribute('uv', new BufferAttribute(floats(attrs.TEXCOORD_0), 2));
      if (primitive.indices) geometry.setIndex(new BufferAttribute(primitive.indices, 1));
      geometry.computeBoundingSphere();
      let material = materials.get(primitive.material);
      if (!material) {
        const source = gltf.materials[primitive.material] || {};
        const pbr = source.pbrMetallicRoughness || {};
        const color = pbr.baseColorFactor || [1, 1, 1, 1];
        material = pbr.baseColorTexture ? await createVehicleMaterial(gltf, primitive.material, textureCache) : standard({
          name: `Bracken gatehouse · ${source.name || primitive.material}`,
          color: (Math.round(color[0] * 255) << 16) | (Math.round(color[1] * 255) << 8) | Math.round(color[2] * 255),
          roughness: pbr.roughnessFactor ?? 1,
          metalness: pbr.metallicFactor ?? 0,
          side: source.doubleSided ? 'double' : 'front',
        });
        material.underwaterLighting = 'none';
        material.localLightsCheap = true;
        materials.set(primitive.material, material);
      }
      const mesh = new Mesh(geometry, material);
      mesh.name = node.name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      nodes[i].add(mesh);
    }
    for (const child of node.children) nodes[i].add(nodes[child]);
  }
  for (const index of gltf.roots) root.add(nodes[index]);
  if (asset === ASSET) root.userData.sourceSha256 = '5790c83aa43ac623e9b07077c843714b16af4ac328957448622a2d81a4251cc5';
  return root;
}
