import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatePortGraphics} from '../src/core/PortGraphicsIsolation.js';
test('diagnostics restore exact update references, visibility and tree arrays',()=>{
  const update=()=>{},trees=[{}];
  const app={kaiju:{update,model:{group:{visible:true},meshes:[{frustumCulled:true}]},wake:[{visible:false}],pressureWake:[{visible:true}]},thirdIsland:{trees},fourthIsland:{trees},portIsland:{traffic:{update},trafficMeshes:[{visible:true},{visible:false}]}};
  for(const variant of ['baseline','no-kaiju','no-distant-tree-animation','no-ai-traffic','legacy-kaiju-culling']){
    const restore=isolatePortGraphics(app,variant);
    if(variant==='no-kaiju')assert.equal(app.kaiju.model.group.visible,false);
    if(variant==='no-distant-tree-animation')assert.equal(app.thirdIsland.trees.length,0);
    if(variant==='no-ai-traffic')assert.equal(app.portIsland.trafficMeshes[0].visible,false);
    if(variant==='legacy-kaiju-culling')assert.equal(app.kaiju.model.meshes[0].frustumCulled,false);
    restore();
    assert.equal(app.kaiju.update,update);assert.equal(app.kaiju.model.group.visible,true);
    assert.equal(app.kaiju.model.meshes[0].frustumCulled,true);
    assert.equal(app.kaiju.wake[0].visible,false);assert.equal(app.kaiju.pressureWake[0].visible,true);
    assert.equal(app.thirdIsland.trees,trees);assert.equal(app.fourthIsland.trees,trees);
    assert.equal(app.portIsland.traffic.update,update);assert.deepEqual(app.portIsland.trafficMeshes.map(m=>m.visible),[true,false]);
  }
});
