import assert from 'node:assert/strict';
import test from 'node:test';
import { TemporalUpscale } from '../src/post/TemporalUpscale.js';

test('review-camera cut discards temporal reprojection and camera-motion history', () => {
  const history = Object.create(TemporalUpscale.prototype);
  Object.assign(history, { _needsRestart:false, _hasPrevInvVP:true,
    _nextPrev:{stale:true}, _camPrev:{stale:true} });
  history.resetHistory();
  assert.equal(history._needsRestart,true);
  assert.equal(history._hasPrevInvVP,false);
  assert.equal(history._nextPrev,null);
  assert.equal(history._camPrev,null);
});
