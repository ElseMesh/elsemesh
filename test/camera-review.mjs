import assert from 'node:assert/strict';
import { VIEWS, cameraPoseFromSearch } from '../src/core/DebugViews.js';

assert.deepEqual( cameraPoseFromSearch( '?view=tValley' ), VIEWS.tValley, 'named mountain valley camera can be selected by URL' );
assert.equal( cameraPoseFromSearch( '?view=missing' ), null, 'unknown named cameras are ignored' );
assert.deepEqual( cameraPoseFromSearch( `?pose=${ encodeURIComponent( JSON.stringify( { p: [ 1, 2, 3 ], yaw: 0.5, pitch: - 0.2, time: 12 } ) ) }` ), { p: [ 1, 2, 3 ], yaw: 0.5, pitch: - 0.2, time: 12 }, 'recorded camera poses can be restored from URL parameters' );
assert.equal( cameraPoseFromSearch( '?pose=%7Bbad-json' ), null, 'malformed poses are ignored' );
assert.equal( cameraPoseFromSearch( `?pose=${ encodeURIComponent( JSON.stringify( { p: [ 1, 2, Infinity ], yaw: 0, pitch: 0 } ) ) }` ), null, 'non-finite camera coordinates are rejected' );
assert.equal( cameraPoseFromSearch( `?pose=${ encodeURIComponent( JSON.stringify( { p: [ 1, 2, 3 ], yaw: 0, pitch: 2 } ) ) }` ), null, 'out-of-range camera pitch is rejected' );

console.log( 'ok deterministic named and captured camera review poses' );
