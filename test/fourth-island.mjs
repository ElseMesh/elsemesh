import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { FOURTH, fourthIslandContains, fourthIslandHeight } from '../src/world/FourthIslandLayout.js';
import { THIRD } from '../src/world/ThirdIslandLayout.js';

test('Island Four is bounded, separate and supported above sea level', () => {
  assert.equal(fourthIslandContains(FOURTH.x, FOURTH.z), true);
  assert.ok(fourthIslandHeight(FOURTH.x, FOURTH.z) > 6);
  assert.ok(fourthIslandHeight(FOURTH.villa.x, FOURTH.villa.z) > 6);
  assert.ok(fourthIslandHeight(FOURTH.x + FOURTH.radiusX * 1.5, FOURTH.z) < -30);
  assert.ok(Math.hypot(FOURTH.x - THIRD.x, FOURTH.z - THIRD.z) > FOURTH.radiusX + THIRD.radius);
});

test('the villa occupies the far ocean-facing forest edge', () => {
  assert.ok(FOURTH.villa.z > FOURTH.z + FOURTH.radiusZ * .5);
  assert.equal(FOURTH.villa.x, FOURTH.x);
});

test('the qualified runtime asset matches the recorded hash and budget', async () => {
  const crypto = await import('node:crypto');
  const file = fs.readFileSync(new URL('../public/models/buildings/forest-cabin.glb', import.meta.url));
  assert.ok(file.length < 9_000_000);
  assert.equal(crypto.createHash('sha256').update(file).digest('hex'), 'd63b2edf668272d53c1217e9413f3810b94e548b4ea56313c2cf3a264c457d6c');
});
