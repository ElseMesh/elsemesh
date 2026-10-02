import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Group } from '../src/engine/scene/Group.js';
import { rigPortWheels, steeringFromPoses, steerPortWheels, spinPortWheels } from '../src/world/PortWheelRig.js';

for (const file of ['mmc-sedan-trial.glb', 'mmc-sedan-ai68.glb', 'estate-lod1.glb', 'panel-van-lod1.glb', 'compact-lod1.glb']) {
  test(`${file}: actual exported hubs preserve transforms and steer only front axle`, () => {
    const data = fs.readFileSync(new URL(`../public/models/port/${file}`, import.meta.url));
    const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)));
    const vehicle = new Group();
    const nodes = json.nodes.map(n => {
      const node = new Group(); node.name = n.name;
      node.position.set(...(n.translation || [0,0,0]));
      node.quaternion.set(...(n.rotation || [0,0,0,1]));
      node.scale.set(...(n.scale || [1,1,1]));
      vehicle.add(node); return node;
    });
    vehicle.updateMatrixWorld(true);
    const before = nodes.map(n => [...n.matrixWorld.elements]);
    Object.assign(vehicle.userData, rigPortWheels(nodes, file.startsWith('mmc')));
    vehicle.updateMatrixWorld(true);
    nodes.forEach((n,i) => n.matrixWorld.elements.forEach((x,j) => assert.ok(Math.abs(x-before[i][j]) < 1e-6)));
    assert.equal(vehicle.userData.wheels.length, 4);
    assert.equal(vehicle.userData.steering.length, 2);
    assert.ok(vehicle.userData.wheelbase > 2.5 && vehicle.userData.wheelbase < 3.2);
    for (const angle of [-.45, .45, 0]) {
      steerPortWheels(vehicle, angle, 1);
      spinPortWheels(vehicle, 1);
      for (const p of vehicle.userData.steering) assert.ok(Math.abs(p.rotation.y-angle) < 1e-9);
      for (const wheel of vehicle.userData.wheels) {
        if (!vehicle.userData.steering.includes(wheel.parent)) assert.equal(wheel.parent.rotation.y, 0);
        assert.notEqual(wheel.rotation[vehicle.userData.wheelAxis], 0);
      }
    }
  });
}
test('route curvature handles left/right, straight, stopped and wrapped headings', () => {
  assert.ok(steeringFromPoses({x:0,z:0,yaw:0},{x:0,z:1,yaw:.1},3) > 0);
  assert.ok(steeringFromPoses({x:0,z:0,yaw:0},{x:0,z:1,yaw:-.1},3) < 0);
  assert.equal(steeringFromPoses({x:0,z:0,yaw:0},{x:0,z:1,yaw:0},3),0);
  assert.equal(steeringFromPoses({x:0,z:0,yaw:0},{x:0,z:0,yaw:0},3),null);
  assert.ok(Math.abs(steeringFromPoses({x:0,z:0,yaw:Math.PI-.01},{x:0,z:1,yaw:-Math.PI+.01},3)) < .1);
});
