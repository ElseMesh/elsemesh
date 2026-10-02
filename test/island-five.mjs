import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ISLAND_FIVE, islandFiveHeight, islandFiveContains } from '../src/world/IslandFiveLayout.js';
import { createIslandFiveForestData, createIslandFiveCanopyRecords } from '../src/world/IslandFiveSystem.js';
import { FOURTH } from '../src/world/FourthIslandLayout.js';
import fs from 'node:fs';

test('Island Five is bounded, separated, forest-only, and deterministic', () => {
  const treesA = createIslandFiveForestData();
  const treesB = createIslandFiveForestData();
  assert.ok(treesA.length > 0 && treesA.length <= ISLAND_FIVE.maxTrees);
  assert.deepEqual(treesA, treesB);
  assert.ok(islandFiveHeight(ISLAND_FIVE.center.x, ISLAND_FIVE.center.z) >= -4);
  assert.equal(islandFiveHeight(ISLAND_FIVE.center.x + ISLAND_FIVE.radius * 1.43, ISLAND_FIVE.center.z), -90);
  assert.ok(Math.hypot(ISLAND_FIVE.center.x - FOURTH.x, ISLAND_FIVE.center.z - FOURTH.z) > ISLAND_FIVE.radius + Math.max(FOURTH.radiusX, FOURTH.radiusZ));
  assert.ok(Math.abs(ISLAND_FIVE.center.x) + ISLAND_FIVE.radius * 1.42 < 1024);
  assert.ok(Math.abs(ISLAND_FIVE.center.z) + ISLAND_FIVE.radius * 1.42 < 1024);
  for (const tree of treesA) {
    assert.ok(islandFiveContains(tree.x, tree.z));
    assert.ok(tree.collision.type === 'cylinder');
    assert.ok(tree.collision.radius > 0 && tree.collision.yMax > tree.collision.yMin);
    assert.equal(tree.collision.tag, 'island-five-tree');
    assert.ok(Number.isFinite(tree.scale) && Number.isFinite(tree.rotation));
  }
  assert.ok(new Set(treesA.map(tree => tree.index)).size === treesA.length);
});

test('Island Five has rolling relief and emits established canopy records', () => {
  const heights = [];
  for (let x = -855; x <= -745; x += 11) for (let z = 385; z <= 475; z += 9) {
    if (islandFiveContains(x, z)) heights.push(islandFiveHeight(x, z));
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 8, 'terrain must read as rolling rather than flat');
  const canopy = createIslandFiveCanopyRecords();
  assert.equal(canopy.length, createIslandFiveForestData().length);
  for (const record of canopy) {
    assert.ok(record.H > 7 && Number.isFinite(record.seed));
    assert.ok(Number.isFinite(record.la) && record.l > 0);
  }
});

test('Forest Island does not overlay bare cylinders on the mapped canopy trees', async () => {
  const source = await fs.promises.readFile(new URL('../src/world/IslandFiveSystem.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /new CylinderGeometry/);
  assert.match(source, /Do not add a second bare cylinder/);
});
