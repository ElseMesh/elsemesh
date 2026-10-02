import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PortIslandSystem } from '../src/world/PortIslandSystem.js';

test('vehicle footprint stops at a finite port barrier and clears beyond its end', () => {
  const context = { solids: [], barrierSegments: [{
    ax: 756, az: 425, bx: 764, bz: 425, tag: 'test-barrier',
  }] };
  const blocked = (x, z, yaw = 0) => PortIslandSystem.prototype.blocked.call(context, x, z, yaw);
  assert.equal(blocked(760, 427.5, 0), true, 'front reaches barrier before car centre');
  assert.equal(blocked(760, 433, 0), false, 'far approach remains drivable');
  assert.equal(blocked(769, 425, 0), false, 'clear passage around barrier end');
});
