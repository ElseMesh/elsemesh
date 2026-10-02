import test from 'node:test';
import assert from 'node:assert/strict';
import {driveCommand,reviewRoute} from '../src/core/PortDriveReview.js';
test('review feeds forward/left/right/brake inputs without modifying pose',()=>{
    const pose={x:0,z:0,yaw:0};
    assert.deepEqual(driveCommand(pose,0,{x:0,z:30}).keys,['KeyW']);
    assert.ok(driveCommand(pose,0,{x:30,z:0}).keys.includes('KeyD'));
    assert.ok(driveCommand(pose,0,{x:-30,z:0}).keys.includes('KeyA'));
    assert.ok(driveCommand(pose,10,{x:0,z:5}).keys.includes('Space'));
    assert.deepEqual(pose,{x:0,z:0,yaw:0});
    assert.deepEqual(driveCommand(pose,0,{x:0,z:-12}).keys,['KeyS']);
});
test('three route cycles include entrance, industrial area, depot, quay, and original parking',()=>{
    const route=reviewRoute();
    for(let i=1;i<=3;i++) {
        const labels=route.filter(p=>p.label.startsWith(`loop${i}:`)).map(p=>p.label);
        for(const segment of ['checkpoint-gate','circle-warehouse','service-depot','east-quay','return-to-start'])
            assert.ok(labels.some(l=>l.includes(segment)),segment);
    }
    assert.deepEqual([route.at(-1).x,route.at(-1).z],[700,480]);
});
