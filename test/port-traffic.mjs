import assert from 'node:assert/strict';
import test from 'node:test';
import { PORT_VEHICLE_FOOTPRINTS, PortTraffic, portVehicleOverlap, portVehicleBarrierOverlap, vehicleMotionBlocked } from '../src/world/PortTraffic.js';
import { PORT_EDGES, PORT_NODES } from '../src/world/PortRoadGraph.js';

test('ambient cars stay on known graph edges across many trips', () => {
  const traffic = new PortTraffic(6);
  for (let frame = 0; frame < 12000; frame++) traffic.update(1 / 30);
  assert.ok(traffic.cars.every(car => car.trips > 0));
  for (const car of traffic.cars) {
    assert.ok(Number.isFinite(car.pose.x) && Number.isFinite(car.pose.yaw));
    assert.ok(PORT_EDGES.some(edge => edge.id === car.route[car.step].edgeId));
    assert.ok(car.fraction >= 0 && car.fraction < 1);
  }
});

test('traffic caps count and yields to a nearby obstacle', () => {
  assert.equal(new PortTraffic(100).cars.length, 12);
  const traffic = new PortTraffic(1), car = traffic.cars[0];
  const before = car.pose;
  traffic.update(.1, { x: before.x, z: before.z });
  assert.ok(car.speed < 1);
  assert.ok(Object.keys(PORT_NODES).length > 8);
});

test('lead traffic does not deadlock when the player follows behind', () => {
  const behind = new PortTraffic(1);
  const car = behind.cars[0];
  const followingPlayer = {
    x: car.pose.x - Math.sin(car.pose.yaw) * 3,
    z: car.pose.z - Math.cos(car.pose.yaw) * 3,
  };
  behind.update(.1, followingPlayer);
  assert.ok(car.speed > 1, 'the lead car must continue moving');
  const ahead = new PortTraffic(1);
  const lead = ahead.cars[0];
  ahead.update(.1, {
    x: lead.pose.x + Math.sin(lead.pose.yaw) * 3,
    z: lead.pose.z + Math.cos(lead.pose.yaw) * 3,
  });
  assert.ok(lead.speed < .1, 'the car still yields to an obstacle ahead');
});

test('oriented vehicle bounds permit passing lanes but block physical overlap', () => {
  const car = { x: 0, z: 0, yaw: 0 };
  assert.equal(portVehicleOverlap(car, { x: 2.4, z: 0, yaw: Math.PI }, 'car', 'van'), false);
  assert.equal(portVehicleOverlap(car, { x: 1.5, z: 0, yaw: Math.PI }, 'car', 'van'), true);
  assert.equal(portVehicleOverlap(car, { x: 0, z: 3, yaw: 0 }, 'car', 'van'), true);
  assert.equal(portVehicleOverlap(car, { x: 0, z: 6, yaw: 0 }, 'car', 'van'), false);
});

test('inherited vehicle overlap allows separating reverse movement, never deeper penetration',()=>{
  const player={x:0,z:0,yaw:0},other={x:0,z:4,yaw:0};
  assert.equal(vehicleMotionBlocked(player,{...player,z:-.1},other,'player','car'),false);
  assert.equal(vehicleMotionBlocked(player,{...player,z:.1},other,'player','car'),true);
  assert.equal(vehicleMotionBlocked({...player,z:-2},{...player,z:-.5},other,'player','car'),true);
});

test('AI rejects a next pose intersecting an oriented stationary player',()=>{
  const traffic=new PortTraffic(1),car=traffic.cars[0];
  const obstacle={x:car.pose.x+Math.sin(car.pose.yaw)*7,
    z:car.pose.z+Math.cos(car.pose.yaw)*7,yaw:car.pose.yaw+Math.PI/2};
  for(let i=0;i<120;i++) {
    traffic.update(1/30,obstacle);
    assert.equal(portVehicleOverlap(car.pose,obstacle,car.kind,'player'),false);
  }
});

test('junction reservations keep all six cars progressing without overlap for ten simulated minutes',()=>{
  const traffic=new PortTraffic(6);let previous=traffic.cars.map(c=>c.trips);
  for(let i=0;i<18000;i++) {
    traffic.update(1/30);
    for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)
      assert.equal(portVehicleOverlap(traffic.cars[a].pose,traffic.cars[b].pose,
        traffic.cars[a].kind,traffic.cars[b].kind),false,`frame ${i}, pair ${a}/${b}`);
    if(i%3000===2999){
      assert.ok(traffic.cars.every((c,j)=>c.trips>previous[j]),'each vehicle must make trips in every 100-second window');
      previous=traffic.cars.map(c=>c.trips);
    }
  }
});

test('MMC player footprint includes its longer body without changing old AI dimensions', () => {
  assert.ok(PORT_VEHICLE_FOOTPRINTS.player.length >= 5.0058);
  assert.ok(PORT_VEHICLE_FOOTPRINTS.player.halfWidth * 2 >= 2.1049);
  const a = { x: 0, z: 0, yaw: 0 }, b = { x: 0, z: 4.92, yaw: 0 };
  assert.equal(portVehicleOverlap(a, b, 'car', 'car'), false);
  assert.equal(portVehicleOverlap(a, b, 'player', 'car'), true);
});

test('thin barriers include bumper corners and reject clear adjacent travel', () => {
  const pose = { x: 0, z: 0, yaw: 0 };
  assert.equal(portVehicleBarrierOverlap(pose, { ax: 1, az: 2.45, bx: 2, bz: 3 }), true);
  assert.equal(portVehicleBarrierOverlap(pose, { ax: -3, az: -2.5, bx: 3, bz: -2.5 }), true);
  assert.equal(portVehicleBarrierOverlap(pose, { ax: 1.3, az: -3, bx: 1.3, bz: 3 }), false);
  assert.equal(portVehicleBarrierOverlap({ ...pose, yaw: Math.PI / 2 }, { ax: 2.45, az: 1, bx: 3, bz: 2 }), true);
});

test('traffic turns continuously across route and trip boundaries without teleporting', () => {
  const traffic = new PortTraffic(6);
  for (let frame = 0; frame < 12000; frame++) {
    const before = traffic.cars.map(car => ({ ...car.pose }));
    traffic.update(1 / 30);
    for (let i = 0; i < traffic.cars.length; i++) {
      const p = traffic.cars[i].pose;
      assert.ok(Math.hypot(p.x - before[i].x, p.z - before[i].z) < .65, `position snap: car ${i}, frame ${frame}`);
      const angle = Math.atan2(Math.sin(p.yaw - before[i].yaw), Math.cos(p.yaw - before[i].yaw));
      assert.ok(Math.abs(angle) < .25, `heading snap: car ${i}, frame ${frame}`);
    }
  }
});
