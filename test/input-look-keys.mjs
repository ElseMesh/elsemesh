import assert from 'node:assert/strict';
import { keyboardLookDelta } from '../src/core/Input.js';

const rate = 260;
assert.deepEqual( keyboardLookDelta( new Set( [ 'ArrowRight' ] ), 0.5, rate ), { x: 130, y: 0 }, 'right arrow turns right at a time-based rate' );
assert.deepEqual( keyboardLookDelta( new Set( [ 'ArrowUp' ] ), 0.5, rate ), { x: 0, y: -130 }, 'up arrow looks upward' );
assert.deepEqual( keyboardLookDelta( new Set( [ 'ArrowDown', 'ArrowLeft' ] ), 0.25, rate ), { x: -65, y: 65 }, 'diagonal arrows combine' );
assert.deepEqual( keyboardLookDelta( new Set( [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ] ), 1, rate ), { x: 0, y: 0 }, 'opposing arrows cancel' );
assert.deepEqual( keyboardLookDelta( new Set(), 1, rate ), { x: 0, y: 0 }, 'no arrows leave the view unchanged' );

console.log( 'ok   arrow keys provide independent, time-based view controls' );
