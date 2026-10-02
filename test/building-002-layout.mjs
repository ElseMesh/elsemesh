import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { thirdIslandHeight, thirdIslandWarehouseExtension } from '../src/world/ThirdIslandLayout.js';

test('warehouse footprint is supported by the extended island plateau', () => {
  for (const x of [116.5, 121.5, 145.5, 169.5, 174.5]) {
    for (const z of [584.5, 589.5, 610.25, 631, 636]) {
      assert.ok(thirdIslandHeight(x, z) >= 7.95, `${x},${z} should remain grassed plateau`);
    }
  }
});

test('warehouse extension has a rounded natural fringe', () => {
  assert.equal(thirdIslandWarehouseExtension(145.5, 610.25), 8);
  assert.ok(thirdIslandWarehouseExtension(190, 610.25) < 1);
  assert.equal(thirdIslandWarehouseExtension(210, 610.25), -90);
  assert.ok(thirdIslandHeight(210, 610.25) < 0, 'extension must not create unlimited land');
});

test('dedicated warehouse path is removed while Building 001 signage remains', async () => {
  const building = await readFile(new URL('../src/world/AbandonedWarehouse.js', import.meta.url), 'utf8');
  const portal = await readFile(new URL('../src/world/PortalInterior.js', import.meta.url), 'utf8');
  assert.doesNotMatch(building, /access gravel|building-002-access/);
  assert.match(portal, /WAREHOUSE LOFT/);
  assert.match(portal, /E TO ENTER/);
});
