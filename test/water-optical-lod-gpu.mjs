// Compile validation only: no benchmark or full game render.
import assert from 'node:assert/strict';
import { makeOceanScene } from './ocean-scene.mjs';
import { GPU } from '../src/engine/gpu/GPU.js';
import { Texture, RenderTarget } from '../src/engine/gpu/Texture.js';
import { ShaderModule, composeShader } from '../src/engine/gpu/Shader.js';
import { buildMeshShader } from '../src/engine/render/MeshShader.js';
import { ShoreWaves } from '../src/ocean/ShoreWaves.js';

const normalTexture = new Texture({width:1,height:1,data:new Uint8Array([128,128,0,255])});
const terrain = { normalTexture, module: new ShaderModule({
  name:'optical-lod-terrain-fixture', bindings:{terrainNormalTex:{texture:normalTexture}},
  code: /* wgsl */`
fn terrainUvOf(xz:vec2f)->vec2f{return xz/1000.0+0.5;}
fn terrainHeightAt(xz:vec2f)->f32{return -90.0;}
fn terrainNormalRockLevel(xz:vec2f,level:f32)->vec4f{
  let s=textureSampleLevel(terrainNormalTex,smpLinearClamp,terrainUvOf(xz),level);
  return vec4f(s.xy*2.0-1.0,s.zw);
}
fn terrainNormalRock(xz:vec2f)->vec4f{
  let s=textureSample(terrainNormalTex,smpLinearClamp,terrainUvOf(xz));
  return vec4f(s.xy*2.0-1.0,s.zw);
}
fn terrainSunShadowAt(p:vec3f)->f32{return 1.0;}
fn terrainShoreSample(xz:vec2f)->vec4f{return vec4f(1000.0,1.0,0.0,0.0);}
`}) };
const errors=[];
const originalError=console.error;
console.error=(...args)=>{errors.push(args.map(String).join(' '));originalError(...args);};
try {
  const s=await makeOceanScene({W:64,H:64,terrain,caustics:false,floor:false,
    extra(ctx){
      ctx.surface.shore=new ShoreWaves(terrain);
      ctx.onMaterial=(material)=>{
        const refr=new RenderTarget(4,4,{colors:['rgba16float'],depth:'depth32float'});
        material.refraction={texture:refr.texture,depthTexture:refr.depthTexture};
      };
    },
  });
  GPU.device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const material=s.waterMaterial, key=material.pipelineKey();
  const layout=[{name:'position',wgsl:'vec3f',location:0},{name:'nodeData',wgsl:'vec4f',location:1,instanced:true}];
  let firstCode;
  for(const enabled of [false,true,false]) {
    material.optimizeDistantWater=enabled;
    assert.equal(material.pipelineKey(),key);
    const source=buildMeshShader(material,layout,{kind:'main',late:true});
    const composed=composeShader({...source,stage:'render',label:'water optical LOD validation'});
    if(firstCode) assert.equal(composed.code,firstCode); else firstCode=composed.code;
    const module=GPU.device.createShaderModule({code:composed.code});
    const info=await module.getCompilationInfo();
    assert.deepEqual(info.messages.filter(m=>m.type==='error').map(m=>`${m.lineNum}: ${m.message}`),[]);
  }
  await GPU.pipelinesReady();
  assert.deepEqual(errors,[]);
  console.log('Water optical LOD: full water/shore/refraction shader compiles with switch false/true/false and identical source.');
} finally {console.error=originalError;}
process.exit(0);
