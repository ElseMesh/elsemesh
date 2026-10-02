import assert from 'node:assert/strict';
import { RAIL, railPosition, secondIslandHeight } from '../src/world/MonorailRoute.js';

assert.deepEqual(railPosition('A', 0), RAIL.stationA);
assert.deepEqual(railPosition('A', 1), RAIL.stationB);
assert.deepEqual(railPosition('B', 0), RAIL.stationB);
assert.deepEqual(railPosition('B', 1), RAIL.stationA);
assert.equal(railPosition('A', -1).x, RAIL.stationA.x);
assert.equal(railPosition('A', 2).x, RAIL.stationB.x);
assert.ok(railPosition('A', 0.5).x < RAIL.stationA.x);
assert.ok(secondIslandHeight(RAIL.island.x, RAIL.island.z) > 30);
assert.ok(secondIslandHeight(RAIL.stationB.x - 9, RAIL.stationB.z) > 0);
assert.equal(secondIslandHeight(-100, 100), -30);
console.log('monorail route and island ground passed');
