import assert from 'node:assert/strict';
import { FrameWorkMeter } from '../src/core/FrameWorkMeter.js';

globalThis.GPUBufferUsage = { QUERY_RESOLVE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 };
globalThis.GPUMapMode = { READ: 1 };
let clock = 0, submitted;
const readBuffers = [];
const gpu = {
	hasTimestamp: true,
	device: {
		createQuerySet: () => ( { destroy() {} } ),
		createBuffer: () => {
			const buffer = { destroy() {}, mapAsync: async () => {}, getMappedRange: () => {
				const bytes = new ArrayBuffer( 16 );
				const values = new BigUint64Array( bytes ); values[ 0 ] = 1_000_000n; values[ 1 ] = 4_000_000n;
				return bytes;
			}, unmap() {} };
			readBuffers.push( buffer ); return buffer;
		},
	},
	getEncoder: () => ( {
		beginComputePass: descriptor => ( { descriptor, end() {} } ),
		resolveQuerySet() {}, copyBufferToBuffer() {},
	} ),
	onSubmit: ( _before, after ) => { submitted = after; },
};

const meter = new FrameWorkMeter( { gpu, clock: () => clock, intervalMs: 0 } );
assert.equal( meter.begin(), true );
clock = 10;
meter.end();
assert.equal( meter.gpuMilliseconds(), null, 'work is unavailable before GPU readback completes' );
submitted();
await Promise.resolve();
await Promise.resolve();
assert.equal( meter.gpuMilliseconds(), 3, 'readback reports the whole measured GPU span' );
clock = 2000;
assert.equal( meter.gpuMilliseconds(), null, 'stale GPU samples are excluded' );
meter.dispose();
assert.ok( readBuffers.length >= 3 );
console.log( 'Whole-frame GPU timestamp meter bounds readback and rejects stale samples' );
