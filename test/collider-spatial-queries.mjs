import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Colliders } from '../src/world/Colliders.js';
import { Colliders as FlatReference } from './fixtures/colliders-flat-reference.mjs';
import { Vector3 } from '../src/engine/index.js';
import { CaveSystem } from '../src/world/CaveSystem.js';

function random(seed = 0x517cc1b7) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function oracle(world) {
  const flat = new FlatReference();
  flat.boxes = world.boxes; flat.cylinders = world.cylinders;
  return flat;
}
function capsule(world, flat, p, radius = .3, height = 1.75, step = .35) {
  const actual = p.clone(), expected = p.clone();
  assert.equal(world.resolveCapsule(actual, radius, height, step), flat.resolveCapsule(expected, radius, height, step));
  assert.deepEqual(actual, expected, `capsule at ${p.x},${p.y},${p.z}`);
  return actual;
}
function queries(world, flat, p, dir, radius = .3, height = 1.75, step = .35, pad = 0, distance = 40) {
  capsule(world, flat, p, radius, height, step);
  assert.equal(world.groundHeightAt(p.x, p.z, p.y + height, pad), flat.groundHeightAt(p.x, p.z, p.y + height, pad));
  assert.equal(world.raycast(p, dir, distance), flat.raycast(p, dir, distance));
}

test('indexed default builds lazily; flat comparison and optional candidate counters remain available', () => {
  const world = new Colliders();
  for (let i = 0; i < 100; i++) world.addBox(new Vector3(i * 32, 1, 0), new Vector3(1, 1, 1), 0, {walkable:true});
  assert.equal(world.optimizeSpatialQueries, true);
  assert.equal(world._spatial, null, 'registration alone does not build the index');
  world.optimizeSpatialQueries = false;
  world.groundHeightAt(0, 0, 3);
  assert.equal(world._spatial, null);
  assert.equal(world.queryStats.groundQueries, 0);
  world.queryStats.enabled = true;
  world.groundHeightAt(0, 0, 3);
  assert.equal(world.queryStats.boxCandidates, 100);
  world.resetQueryStats();
  world.optimizeSpatialQueries = true;
  assert.equal(world.groundHeightAt(0, 0, 3), 2);
  assert.equal(world.queryStats.boxCandidates, 1);
  assert.equal(world.queryStats.indexRebuilds, 1);
  world.optimizeSpatialQueries = false;
  world.groundHeightAt(0, 0, 3);
  assert.equal(world.queryStats.boxCandidates, 101);
});

test('capsule pushes re-query new cells without revisiting earlier boxes or cylinders', () => {
  const boxes = new Colliders();
  boxes.addBox(new Vector3(41, 0, 0), new Vector3(2, 4, 3)); // skipped before the large push
  boxes.addBox(new Vector3(), new Vector3(40, 4, 100));
  boxes.addBox(new Vector3(40.5, 0, 0), new Vector3(.5, 4, 3));
  boxes.optimizeSpatialQueries = true;
  assert.equal(capsule(boxes, oracle(boxes), new Vector3(), .5).x, 41.5);
  const cylinders = new Colliders();
  cylinders.addCylinder(41, 0, 2, -2, 4); // must not be revisited after the later push
  cylinders.addCylinder(0, 0, 40, -2, 4);
  cylinders.addCylinder(40, 0, 1, -2, 4);
  cylinders.optimizeSpatialQueries = true;
  assert.equal(capsule(cylinders, oracle(cylinders), new Vector3(1, 0, 0), .5).x, 41.5);
  boxes.addCylinder(41, 0, 1, -2, 4);
  assert.equal(capsule(boxes, oracle(boxes), new Vector3(), .5).x, 42.5, 'cylinders begin at the final box-resolved position');
});

test('cell edges, rotated corners, tangency, stepping, padding and parallel rays match', () => {
  const world = new Colliders();
  for (const x of [-32, -16, 0, 16, 32]) {
    world.addBox(new Vector3(x, 1, -16), new Vector3(2, 1, 6), Math.PI / 4, {walkable:true});
    world.addCylinder(x, 16, 2, -1, 3);
  }
  world.optimizeSpatialQueries = true;
  const flat = oracle(world);
  for (const x of [-32, -16, 0, 16, 32]) for (const offset of [-2.3, -1e-8, 0, 1e-8, 2.3]) {
    for (const y of [-3, 0, 2, 2.35, 4]) for (const pad of [-.3, 0, .6, 10]) {
      queries(world, flat, new Vector3(x + offset, y, -16), new Vector3(0, 1, 0), .3, 1.75, .35, pad);
      queries(world, flat, new Vector3(x + offset, y, 16), new Vector3(1, 0, 1e-10), .3, 1.75, 0, pad);
    }
  }
});

test('live door/platform flags require no rebuild; geometry and same-length edits have explicit invalidation', () => {
  const world = new Colliders();
  const b = world.addBox(new Vector3(0, 1, 0), new Vector3(1, 1, 1), 0, {walkable:true});
  const c = world.addCylinder(4, 0, .5, -1, 3);
  world.optimizeSpatialQueries = true;
  world.queryStats.enabled = true;
  queries(world, oracle(world), new Vector3(.5, 0, 0), new Vector3(1, 0, 0));
  b.solid = false; b.walkable = false;
  queries(world, oracle(world), new Vector3(.5, 0, 0), new Vector3(1, 0, 0));
  assert.equal(world.queryStats.indexRebuilds, 1);
  const retained = b.center;
  retained.set(64, 1, 0); b.half.set(4, 1, 2); b.solid = b.walkable = true;
  c.x = 68; c.radius = 2;
  world.invalidateSpatialQueries();
  queries(world, oracle(world), new Vector3(64.5, 0, 0), new Vector3(1, 0, 0));
  world.addBox(new Vector3(80, 1, 0), new Vector3(2, 1, 2), .2, {walkable:true});
  queries(world, oracle(world), new Vector3(80, 0, 0), new Vector3(0, 0, 1));
  world.boxes.reverse(); world.invalidateSpatialQueries();
  queries(world, oracle(world), new Vector3(64, 0, 0), new Vector3(1, 0, 0));
  world.boxes.splice(0, 1); // length changes are detected automatically
  queries(world, oracle(world), new Vector3(80, 0, 0), new Vector3(-1, 0, 0));
  world.boxes = world.boxes.slice();
  world.cylinders = [];
  queries(world, oracle(world), new Vector3(68, 0, 0), new Vector3(-1, 0, 0));
  // Edits while the feature is disabled still need notification before reusing its index.
  world.optimizeSpatialQueries = false; retained.x = -64; world.invalidateSpatialQueries();
  world.optimizeSpatialQueries = true;
  queries(world, oracle(world), new Vector3(-64, 0, 0), new Vector3(1, 0, 0));
});

test('large/global records and unbounded queries safely retain flat semantics', () => {
  const world = new Colliders();
  world.addBox(new Vector3(), new Vector3(5000, 2, 5000), 0, {walkable:true});
  world.addCylinder(-64, 2, 1000, -2, 4);
  const unusual = world.addBox(new Vector3(100, 0, 200), new Vector3(2, 2, 2));
  unusual.cos = .0001; unusual.sin = 0; // non-rotation basis conservatively stays global
  world.optimizeSpatialQueries = true;
  const flat = oracle(world);
  for (const distance of [0, -1, 1, 1e10, Infinity]) {
    queries(world, flat, new Vector3(-16, 0, 16), new Vector3(1, 0, 0), .25, 1.6, 0, .2, distance);
    queries(world, flat, new Vector3(100, 10, 200), new Vector3(1e-10, -1, 0), .25, 1.6, 0, .2, distance);
  }
});

test('seeded mixed worlds match the frozen original for 18000 randomized queries', () => {
  const rnd = random(), world = new Colliders();
  for (let i = 0; i < 450; i++) {
    world.addBox(new Vector3((rnd()-.5)*1200, rnd()*20-5, (rnd()-.5)*1200),
      new Vector3(.1+rnd()*15, .1+rnd()*8, .1+rnd()*15), rnd()*Math.PI*2,
      {walkable:rnd()>.3, solid:rnd()>.15});
    world.addCylinder((rnd()-.5)*1200, (rnd()-.5)*1200, .1+rnd()*4, -5, 10+rnd()*10);
  }
  const flat = oracle(world);
  for (let i = 0; i < 6000; i++) {
    const near = world.boxes[Math.floor(rnd()*world.boxes.length)];
    const p = i % 4 ? new Vector3(near.center.x+(rnd()-.5)*30, near.bottom+rnd()*10, near.center.z+(rnd()-.5)*30)
      : new Vector3((rnd()-.5)*2400, rnd()*40-10, (rnd()-.5)*2400);
    const dir = new Vector3(rnd()-.5, rnd()-.5, rnd()-.5).normalize();
    world.optimizeSpatialQueries = i % 11 !== 0; // also compare the new flat dispatch with raw old source
    queries(world, flat, p, dir, .05+rnd()*2, .2+rnd()*4, rnd(), rnd()*3-.1, rnd()*160);
  }
});

test('real cave landing and door collision queries match with live open/closed flags', () => {
  const layout = JSON.parse(readFileSync(new URL('../public/models/world/caves.json', import.meta.url)));
  const world = new Colliders();
  const cave = new CaveSystem(layout, {heightAt:()=>30}, world);
  cave.addCollision();
  world.optimizeSpatialQueries = true;
  for (const solid of [true, false, true]) {
    cave.finalDoorCollider.solid = solid;
    for (const p of [new Vector3(-220, 1.2, -10), new Vector3(-288, 1.2, 70), new Vector3(-304, 1.2, 70), new Vector3(-323, 0, 84.5)]) {
      queries(world, oracle(world), p, new Vector3(0, 0, 1), .3, 1.75, .35, .1, 80);
    }
  }
});
