import assert from 'node:assert/strict';
import test from 'node:test';
import { Colliders } from '../src/world/Colliders.js';
import { Vector3 } from '../src/engine/index.js';
import { createCollisionWorkload, runCollisionReview } from '../src/core/CollisionReview.js';

function world() {
  const c = new Colliders();
  for (let i = 0; i < 128; i++) {
    c.addBox(new Vector3(i * 32, 1, i % 3 * 50), new Vector3(1, 1, 3), i * .1, {walkable:true});
    c.addCylinder(i * 32, 20, .5, -1, 3);
  }
  return c;
}

test('CPU review uses deterministic world queries, exact ABBA outputs and separate counters', () => {
  const c = world();
  const originalOptimization = c.optimizeSpatialQueries;
  assert.deepEqual(createCollisionWorkload(c), createCollisionWorkload(c));
  c.queryStats.enabled = true;
  c.groundHeightAt(0, 0, 5);
  const stats = {...c.queryStats};
  const result = runCollisionReview(c, {anchors:32, repetitions:2, warmup:1});
  assert.equal(result.valid, true);
  assert.equal(result.equivalence.exact, true);
  assert.deepEqual(result.samples.map(s=>s.mode), ['flat','indexed','indexed','flat','flat','indexed','indexed','flat']);
  assert.ok(result.samples.every(s=>s.exact && s.durationMs >= 0 && s.queries === result.workload.queriesPerBatch * 2));
  assert.ok(result.candidates.flat.boxCandidates > result.candidates.indexed.boxCandidates * 20);
  assert.equal(c.optimizeSpatialQueries, originalOptimization);
  assert.deepEqual(c.queryStats, stats);
});

test('CPU review restores flags and counters after a query throws', () => {
  const c = world(); c.optimizeSpatialQueries = true;
  c.queryStats.enabled = true; c.groundHeightAt(0, 0, 5);
  const stats = {...c.queryStats};
  c.resolveCapsule = () => { throw new Error('intentional query failure'); };
  assert.throws(()=>runCollisionReview(c, {anchors:8, repetitions:1}), /intentional query failure/);
  assert.equal(c.optimizeSpatialQueries, true);
  assert.deepEqual(c.queryStats, stats);
});

test('CPU review refuses equivalence if the candidate changes an output', () => {
  const c = world(), raycast = c.raycast;
  c.raycast = function(...args) { const result = raycast.apply(this,args); return this.optimizeSpatialQueries ? result + 1 : result; };
  const result = runCollisionReview(c, {anchors:8, repetitions:1});
  assert.equal(result.valid, false);
  assert.equal(result.equivalence.exact, false);
  assert.equal(result.samples.length, 0);
});
