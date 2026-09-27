import assert from 'node:assert/strict';
import { advanceEmissionCadence, advanceRunoffState, runoffStrength } from '../src/world/KaijuEncounter.js';

const cadenceTotal = (fps, seconds = 10) => {
  let accumulator = 0;
  let ticks = 0;
  for (let frame = 0; frame < fps * seconds; frame++) {
    const next = advanceEmissionCadence(accumulator, 1 / fps);
    accumulator = next.accumulator;
    ticks += next.ticks;
  }
  return ticks;
};

assert.deepEqual(advanceEmissionCadence(0, 0), { ticks: 0, accumulator: 0 }, 'zero dt must not emit');
assert.equal(cadenceTotal(30), 300, '30fps cadence total');
assert.equal(cadenceTotal(60), 300, '60fps cadence total');
assert.equal(cadenceTotal(120), 300, '120fps cadence total');
assert.equal(advanceEmissionCadence(0, 60).ticks, 7, 'long resumed frames are defensively capped');

const dry = { armed: false, submergedAge: 0, age: Infinity };
for (let i = 0; i < 30 * 60; i++) advanceRunoffState(dry, 1, 1 / 60);
assert.equal(dry.armed, false, 'dry spawn never arms runoff');
assert.equal(dry.age, Infinity, 'dry spawn never starts runoff');

const emergence = { armed: false, submergedAge: 0, age: Infinity };
for (let i = 0; i < 60; i++) advanceRunoffState(emergence, 0.02, 1 / 60);
assert.equal(emergence.armed, true, 'one second of full submersion arms runoff');
assert.equal(emergence.age, Infinity, 'runoff stays cleared while fully submerged');
advanceRunoffState(emergence, 0.09, 1 / 60);
assert.equal(emergence.armed, false, 'emergence consumes the armed state');
assert.equal(emergence.age, 0, 'emergence starts runoff');
assert.ok(runoffStrength(emergence, 0.09) > 0, 'emergence above the trigger emits runoff');
for (let i = 0; i < 7 * 60; i++) advanceRunoffState(emergence, 0.5, 1 / 60);
assert.ok(emergence.age >= 7 - 1e-9, 'runoff expires within seven seconds');
assert.equal(runoffStrength(emergence, 0.5), 0, 'expired runoff emits no particles');

const wading = { armed: false, submergedAge: 0, age: Infinity };
for (let i = 0; i < 30 * 60; i++) advanceRunoffState(wading, 0.05, 1 / 60);
assert.equal(wading.armed, false, 'shallow wading does not rearm runoff');
assert.equal(wading.age, Infinity, 'shallow wading does not start dripping');

console.log('kaiju effects: cadence and runoff checks passed');
