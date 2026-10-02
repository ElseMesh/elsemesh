// Agent Control: bounded rendering budgets; gameplay simulation and world assets stay intact.
export const QUALITY = {
	high: { scale: 1, pixels: Infinity, refraction: 0.5, shadows: true, reflections: true },
	balanced: { scale: 0.75, pixels: 1440 * 810, refraction: 0.35, shadows: true, reflections: false },
	mobile: { scale: 0.65, pixels: 960 * 540, refraction: 0.25, shadows: false, reflections: false },
};

export function qualityFor(name, mobile = false) {
	return QUALITY[name] ? name : mobile ? 'mobile' : 'balanced';
}

export class AdaptiveResolution {
	constructor() { this.reset(); }
	reset() { this.slow = 0; this.fast = 0; this.cooldown = 3; }
	update(dt, scale, ceiling = 1) {
		if (!Number.isFinite(dt) || dt <= 0) return scale;
		// Classify the real frame interval, including sustained sub-5 FPS. A
		// single scheduler stall contributes at most one second of evidence;
		// hidden/resume intervals are excluded and reset by the frame loop.
		const evidence = Math.min(dt, 1);
		this.cooldown -= evidence;
		if (this.cooldown > 0) return scale;
		this.slow = dt > 1 / 27 ? this.slow + evidence : Math.max(0, this.slow - evidence);
		this.fast = dt < 1 / 38 ? this.fast + evidence : 0;
		const next = this.slow > 2 ? Math.max(0.5, scale - 0.05) : this.fast > 10 ? Math.min(ceiling, scale + 0.05) : scale;
		if (next !== scale) this.reset();
		return Math.round(next * 20) / 20;
	}
}
