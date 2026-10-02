import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterMaterial } from '../src/ocean/WaterMaterial.js';
import { WATER_OPTICAL_LOD, waterOpticalLODWeight } from '../src/ocean/WaterOpticalLOD.js';

const deep = { enabled: true, distance: 300, depth: 90, pathLength: 140, extinction: [0.432, 0.093, 0.059] };

test('near shore, camera, visible submerged geometry and clear water retain full optics', () => {
  assert.equal(waterOpticalLODWeight(deep), 1);
  for (const change of [{enabled:false}, {debug:true}, {distance:100}, {depth:8}, {pathLength:2}, {extinction:[0.432,0.093,0.001]}]) {
    assert.equal(waterOpticalLODWeight({...deep,...change}), 0, JSON.stringify(change));
  }
});

test('distance, depth and weakest-channel attenuation transitions are continuous and monotone', () => {
  const p = WATER_OPTICAL_LOD;
  for (const [key,start,end] of [['distance',p.distanceStart,p.distanceEnd], ['depth',p.depthStart,p.depthEnd], ['pathLength',p.tauStart/0.059,p.tauEnd/0.059]]) {
    let previous = -1;
    for (let i=0;i<=100;i++) {
      const value=waterOpticalLODWeight({...deep,[key]:start+(end-start)*i/100});
      assert(value>=previous && value>=0 && value<=1);
      if(i>0) assert(value-previous<0.016, 'no step at a LOD boundary');
      previous=value;
    }
    assert(Math.abs(previous-1)<1e-12);
  }
});

test('fully simplified optics discard at most one part in a thousand of each source channel', () => {
  for (const extinction of [[0.432,0.093,0.059],[0.3,0.1,0.025],[0.02,0.3,0.08]]) {
    const pathLength=WATER_OPTICAL_LOD.tauEnd/Math.min(...extinction)+1e-6;
    assert.equal(waterOpticalLODWeight({...deep,extinction,pathLength}),1);
    for(const sigma of extinction) {
      assert(Math.exp(-sigma*pathLength)<=0.001);
      for(const muV of [0.15,0.5,1]) for(const muS of [0.1,0.5,1]) {
        assert(Math.exp(-sigma*(1+muV/muS)*pathLength)<0.001);
      }
    }
  }
});

test('runtime switch preserves pipeline identity and unsupported terrain keeps its original normal path', () => {
  const material=new WaterMaterial({surface:{},sky:{},sceneCopy:{}});
  assert.equal(material.optimizeDistantWater,true);
  const key=material.pipelineKey(), code=material.output, version=material.version;
  material.optimizeDistantWater=false;
  assert.equal(material.uniforms.optimizeDistantWater.value,0);
  material.optimizeDistantWater=true;
  assert.equal(material.uniforms.optimizeDistantWater.value,1);
  assert.equal(material.pipelineKey(),key);
  assert.equal(material.output,code);
  assert.equal(material.version,version);
  material.optimizeDistantWater=false;
  assert.equal(material.uniforms.optimizeDistantWater.value,0);
  assert.equal(material.pipelineKey(),key);
  assert(!code.includes('terrainNormalTex'), 'custom/no-terrain modules do not gain an undeclared texture dependency');
});
