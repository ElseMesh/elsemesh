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

test('Island Four is the declared Cartoon Island biome', async () => {
  const source = await fs.promises.readFile(new URL('../src/world/FourthIslandSystem.js', import.meta.url), 'utf8');
  assert.match(source, /Cartoon Island/);
  assert.match(source, /Cartoon banana tree/);
  assert.match(source, /new TreeWildlife/);
  assert.match(source, /index<82/);
  assert.match(source, /index<18/);
  assert.match(source, /side limbs emerge from different trunk joints/);
  assert.match(source, /TorusGeometry\(\.16,.045/);
  assert.match(source, /new Box3\(\)\.setFromObject\(model\)/);
  assert.match(source, /y\+\.08-base/);
  assert.match(source, /measuredBase:base,targetY:y\+\.08/);
});

test('the qualified runtime asset matches the recorded hash and budget', async () => {
  const crypto = await import('node:crypto');
  const file = fs.readFileSync(new URL('../public/models/buildings/forest-cabin.glb', import.meta.url));
  assert.ok(file.length < 9_000_000);
  assert.equal(crypto.createHash('sha256').update(file).digest('hex'), 'd63b2edf668272d53c1217e9413f3810b94e548b4ea56313c2cf3a264c457d6c');
});
