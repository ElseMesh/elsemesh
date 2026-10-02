// Display timing is independent of the simulation clock and its safety cap.
// Ignore intervals spanning a pause/visibility change, not merely long frames.
export class FrameTiming {
	constructor() {
		this.sample = { wallDt: 0, valid: false, reset: true };
		this.invalidate();
	}
	invalidate() { this.previous = null; }
	update( timestamp, hidden = false ) {
		const sample = this.sample;
		sample.wallDt = 0; sample.valid = false; sample.reset = true;
		if ( hidden || ! Number.isFinite( timestamp ) ) {
			this.invalidate();
			return sample;
		}
		const previous = this.previous;
		this.previous = timestamp;
		if ( previous === null || timestamp <= previous ) return sample;
		sample.wallDt = ( timestamp - previous ) / 1000;
		sample.valid = true; sample.reset = false;
		return sample;
	}
}

export class FrameRate {
	constructor( windowSeconds = 0.5 ) {
		this.windowSeconds = windowSeconds;
		this.reset();
	}
	reset() { this.elapsed = 0; this.frames = 0; this.worst = 0; }
	update( wallDt ) {
		if ( ! Number.isFinite( wallDt ) || wallDt <= 0 ) return null;
		this.elapsed += wallDt;
		this.frames ++;
		this.worst = Math.max( this.worst, wallDt );
		if ( this.elapsed < this.windowSeconds ) return null;
		const result = {
			fps: this.frames / this.elapsed,
			meanMs: 1000 * this.elapsed / this.frames,
			worstMs: 1000 * this.worst,
			frames: this.frames,
			elapsed: this.elapsed,
		};
		this.reset();
		return result;
	}
}
