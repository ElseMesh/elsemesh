// CPU-only synthetic microbenchmark. The browser CollisionReview helper instead
// takes the actual loaded world. These numbers are not game-FPS measurements.
import assert from 'node:assert/strict';
import { Colliders } from '../src/world/Colliders.js';
import { Colliders as RawFlat } from './fixtures/colliders-flat-reference.mjs';
import { Vector3 } from '../src/engine/index.js';
import { createCollisionWorkload, sampleCollisionWorkload, runCollisionReview } from '../src/core/CollisionReview.js';

const world = new Colliders(), raw = new RawFlat();
for (let i = 0; i < 2048; i++) {
  const x = (i % 64) * 24 - 768, z = Math.floor(i / 64) * 24 - 384;
  world.addBox(new Vector3(x, 1, z), new Vector3(.5 + i % 5, 1 + i % 3, 1.5), i * .27, {walkable:i%3!==0, solid:i%11!==0});
  world.addCylinder(x+8, z+8, .3+i%3*.2, -2, 6);
}
raw.boxes = world.boxes; raw.cylinders = world.cylinders;
const queries = createCollisionWorkload(world), output = new Float64Array(queries.length * 6);
const expected = sampleCollisionWorkload(raw, queries);
for (const enabled of [false,true]) {
  world.optimizeSpatialQueries = enabled;
  assert.deepEqual(sampleCollisionWorkload(world, queries), expected);
}
world.optimizeSpatialQueries = false;
// Compare raw published methods with the disabled feature, not just the shared
// dispatch paths, so added baseline overhead is visible rather than disguised.
sampleCollisionWorkload(raw, queries, 6, output);
sampleCollisionWorkload(world, queries, 6, output);
const baselineSamples = [];
for (let cycle = 0; cycle < 2; cycle++) for (const target of [raw,world,world,raw]) {
  sampleCollisionWorkload(target, queries, 1, output);
  const start = performance.now();
  sampleCollisionWorkload(target, queries, 6, output);
  baselineSamples.push({cycle, mode:target===raw?'published-flat':'feature-disabled', durationMs:performance.now()-start});
  assert.deepEqual(output, expected);
}
const review = runCollisionReview(world);
assert.equal(review.valid,true);
console.log(JSON.stringify({scope:'Synthetic CPU query microbenchmark; not game FPS',baselineSamples,review},null,2));
