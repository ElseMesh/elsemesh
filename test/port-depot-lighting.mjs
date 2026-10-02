import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalLights} from '../src/materials/LocalLights.js';
import {Vector3,Color} from '../src/engine/index.js';
import {G} from '../src/engine/render/Frame.js';

test('powered interior lamps work in daylight; disabled lamps and ordinary streetlights do not',()=>{
  const previous=G.night.value;
  try {
    G.night.value=0;
    const lights=new LocalLights(),camera={position:new Vector3()};
    const add=options=>lights.add({position:new Vector3(),color:new Color(1,1,1),intensity:25,range:12,...options});
    add({kind:'streetlight'});
    const work=add({kind:'depot',alwaysOn:true,enabled:false});
    lights.update(camera,.016);assert.equal(lights.active,0);
    work.enabled=true;lights.update(camera,.016);assert.equal(lights.active,1);
    lights.enabled=false;lights.update(camera,.016);assert.equal(lights.active,0);
    lights.enabled=true;lights.strength=0;lights.update(camera,.016);assert.equal(lights.active,0);
    lights.strength=1;G.night.value=1;lights.update(camera,.016);assert.equal(lights.active,2);
  } finally {G.night.value=previous;}
});
