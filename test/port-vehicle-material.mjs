import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleMaterial } from '../src/world/PortVehicleMaterial.js';

const fixture = () => ({ json: {}, images: [{ bytes: new Uint8Array([1]), mimeType: 'image/png' }],
  textures: [{ source: 0 }], materials: [{ name: 'paint',
    pbrMetallicRoughness: { baseColorFactor: [.2,.3,.4,.6], metallicFactor: .7, roughnessFactor: .35,
      baseColorTexture: {index:0}, metallicRoughnessTexture: {index:0} },
    normalTexture: {index:0,scale:.8}, occlusionTexture:{index:0,strength:.4},
    emissiveTexture:{index:0}, emissiveFactor:[.1,.2,.3], alphaMode:'BLEND' }] });
test('vehicle PBR maps keep colour spaces, channels, factors, alpha and shared decoding', async () => {
  const calls=[], cache=new Map(), decode=async(image,srgb)=>{calls.push(srgb);return {isTexture:true};};
  const material=await createVehicleMaterial(fixture(),0,cache,decode);
  assert.deepEqual(calls,[true,false]);
  assert.equal(Object.keys(material.bindings).length,5);
  assert.equal(material.roughness,.35); assert.equal(material.metalness,.7);
  assert.equal(material.opacity,.6); assert.equal(material.transparent,true); assert.equal(material.depthWrite,false);
  assert.equal(material.uniforms.normalScale.value,.8); assert.equal(material.uniforms.aoStrength.value,.4);
  assert.match(material.surface,/s.roughness\*=mr.g;s.metalness\*=mr.b/);
  assert.match(material.surface,/perturbNormalByMap/);
  await createVehicleMaterial(fixture(),0,cache,decode); assert.equal(calls.length,2);
});
test('missing texture and unsupported UV semantics fail explicitly',async()=>{
  const model=fixture(); model.images=[];
  await assert.rejects(createVehicleMaterial(model,0,new Map()),/missing_vehicle_texture/);
  const uv=fixture(); uv.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord=1;
  await assert.rejects(createVehicleMaterial(uv,0,new Map()),/unsupported_vehicle_texture_coordinates/);
});
test('untextured default material remains valid and opaque',async()=>{
  const m=await createVehicleMaterial({materials:[]},undefined,new Map());
  assert.equal(m.transparent,false); assert.equal(m.opacity,1); assert.equal(m.metalness,1);
});
test('clamped grille textures retain edge sampling instead of wrapping',async()=>{
  const f=fixture(); f.json.samplers=[{wrapS:33071,wrapT:33071}]; f.textures[0].sampler=0;
  const m=await createVehicleMaterial(f,0,new Map(),async()=>({isTexture:true}));
  assert.match(m.surface,/vehicle_albedo,smpAnisoClamp/);
  assert.doesNotMatch(m.surface,/smpAnisoRepeat/);
});
test('clearcoat and index of refraction survive material admission',async()=>{
  const f=fixture(); f.materials[0].extensions={KHR_materials_clearcoat:{clearcoatFactor:.45,clearcoatRoughnessFactor:.24},KHR_materials_ior:{ior:1.45}};
  const m=await createVehicleMaterial(f,0,new Map(),async()=>({isTexture:true}));
  assert.equal(m.clearcoat,.45); assert.equal(m.clearcoatRoughness,.24); assert.equal(m.ior,1.45);
});
