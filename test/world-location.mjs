import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWorldLocation, reviewCameraMinimumHeight } from '../src/world/WorldLocation.js';

test('HUD resolves every island and open water', () => {
  assert.equal(resolveWorldLocation(-500, 10, 650, 8), 'Cartoon Island · Island 4');
  assert.equal(resolveWorldLocation(-800, 12, 430, 10), 'Forest Island · Island 5');
  assert.equal(resolveWorldLocation(115, 8, 650, 8), 'Helicopter Island · Island 3');
  assert.equal(resolveWorldLocation(-1200, 8, -30, 8), 'Station Island · Island 2');
  assert.equal(resolveWorldLocation(40, 8, -100, 8), 'Home Island · Island 1');
  assert.equal(resolveWorldLocation(500, 1, 500, -30), 'Open Sea');
});

test('review cameras cannot descend under terrain or the sea surface', () => {
  assert.equal(reviewCameraMinimumHeight(7.8, -Infinity, 0), 9.5);
  assert.equal(reviewCameraMinimumHeight(-20, -Infinity, 0.8), 1.25);
  assert.equal(reviewCameraMinimumHeight(5, 9, 0), 10.7);
});
