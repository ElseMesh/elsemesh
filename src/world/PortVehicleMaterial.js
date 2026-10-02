import { Color } from '../engine/math/index.js';
import { decodeImage } from '../engine/loaders/GLTF.js';
import { Texture } from '../engine/gpu/Texture.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';
import { physical } from '../materials/Materials.js';

async function imageTexture(image, srgb) {
  const pixels = await decodeImage(image.bytes, image.mimeType);
  const texture = new Texture({ label: 'port-vehicle-pbr', width: pixels.width,
    height: pixels.height, format: srgb ? 'rgba8unorm-srgb' : 'rgba8unorm',
    data: pixels.data, mips: true, usage: ['sample', 'copyDst'], sampler: 'anisoRepeat' });
  texture.getGPU(); generateMipmaps(texture); return texture;
}

// Fail unsupported texture semantics rather than silently degrading source art.
export async function createVehicleMaterial(gltf, index, cache, decode = imageTexture) {
  const item = gltf.materials[index] || {}, pbr = item.pbrMetallicRoughness || {};
  const maps = [ ['albedo', pbr.baseColorTexture, true],
    ['orm', pbr.metallicRoughnessTexture, false], ['normal', item.normalTexture, false],
    ['ao', item.occlusionTexture, false], ['emission', item.emissiveTexture, true] ];
  const textures = {}, samplers = {}, code = [];
  for (const [name, info, srgb] of maps) {
    if (!info) continue;
    if ((info.texCoord ?? 0) !== 0 || info.extensions?.KHR_texture_transform)
      throw Error(`unsupported_vehicle_texture_coordinates:${item.name}:${name}`);
    const ref = gltf.textures[info.index], image = gltf.images[ref?.source];
    if (!image) throw Error(`missing_vehicle_texture:${item.name}:${name}`);
    const sampler = gltf.json?.samplers?.[ref.sampler];
    const wrapS = sampler?.wrapS ?? 10497, wrapT = sampler?.wrapT ?? 10497;
    if (wrapS !== wrapT || ![10497, 33071].includes(wrapS))
      throw Error(`unsupported_vehicle_texture_wrap:${item.name}:${name}`);
    samplers[name] = wrapS === 33071 ? 'smpAnisoClamp' : 'smpAnisoRepeat';
    const key = `${ref.source}:${srgb}`;
    if (!cache.has(key)) cache.set(key, Promise.resolve(decode(image, srgb)));
    textures[`vehicle_${name}`] = await cache.get(key);
  }
  if (textures.vehicle_albedo) code.push('let bc=textureSample(vehicle_albedo,smpAnisoRepeat,in.uv);s.albedo*=bc.rgb;s.alpha*=bc.a;');
  if (textures.vehicle_orm) code.push('let mr=textureSample(vehicle_orm,smpAnisoRepeat,in.uv);s.roughness*=mr.g;s.metalness*=mr.b;');
  if (textures.vehicle_normal) code.push('var nm=textureSample(vehicle_normal,smpAnisoRepeat,in.uv).xyz*2.0-1.0;nm=vec3f(nm.xy*mat.normalScale,nm.z);s.normal=perturbNormalByMap(in.P,in.N,in.uv,nm);');
  if (textures.vehicle_ao) code.push('s.ao*=mix(1.0,textureSample(vehicle_ao,smpAnisoRepeat,in.uv).r,mat.aoStrength);');
  if (textures.vehicle_emission) code.push('s.emissive*=textureSample(vehicle_emission,smpAnisoRepeat,in.uv).rgb;');
  const base = pbr.baseColorFactor || [1, 1, 1, 1], emission = item.emissiveFactor || [0, 0, 0];
  const extensions = item.extensions || {}, coat = extensions.KHR_materials_clearcoat || {};
  const specular = extensions.KHR_materials_specular || {}, tint = specular.specularColorFactor || [1, 1, 1];
  if (specular.specularTexture || specular.specularColorTexture || tint.some(v => v !== tint[0]))
    throw Error(`unsupported_vehicle_specular_colour:${item.name}`);
  if (coat.clearcoatTexture || coat.clearcoatRoughnessTexture || coat.clearcoatNormalTexture)
    throw Error(`unsupported_vehicle_clearcoat_texture:${item.name}`);
  const material = physical({ name: `Port vehicle · ${item.name || index}`,
    clearcoat: coat.clearcoatFactor ?? 0, clearcoatRoughness: coat.clearcoatRoughnessFactor ?? 0,
    ior: extensions.KHR_materials_ior?.ior ?? 1.5,
    specularIntensity: (specular.specularFactor ?? 1) * tint[0],
    color: new Color(...base.slice(0, 3)), opacity: base[3] ?? 1,
    roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1,
    emissive: new Color(...emission), transparent: item.alphaMode === 'BLEND',
    depthWrite: item.alphaMode !== 'BLEND', alphaTest: item.alphaMode === 'MASK' ? (item.alphaCutoff ?? .5) : 0,
    side: item.doubleSided ? 'double' : 'front', textures,
    surface: code.join('\n').replace(/textureSample\(vehicle_(\w+),smpAnisoRepeat/g,
      (_, name) => `textureSample(vehicle_${name},${samplers[name]}`),
    uniforms: { normalScale: ['f32', item.normalTexture?.scale ?? 1],
      aoStrength: ['f32', item.occlusionTexture?.strength ?? 1] } });
  material.underwaterLighting = 'none'; material.localLightsCheap = true;
  return material;
}
