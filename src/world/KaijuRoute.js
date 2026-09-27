import { WORLD } from './WorldLayout.js';

// Compatibility fields retained for capture tooling. Roaming is intentionally not duration-clamped.
export const KAIJU_ROUTE = Object.freeze({
	start: { x: 86, z: 290 },
	end: { x: 84, z: 54 },
	duration: 92,
	height: 24,
});

const CENTRE_X = 0, CENTRE_Z = -400, TAU = Math.PI * 2;
const shorelineCaches = new WeakMap();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };

function seedNumber(seed) {
	if (typeof seed === 'number' && Number.isFinite(seed)) return seed;
	let h = 2166136261;
	for (const c of String(seed ?? 'kaiju')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
	return h >>> 0;
}

function shorelineFor(terrain) {
	let cache = shorelineCaches.get(terrain);
	if (cache) return cache;
	const count = 256, radii = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		const a = i / count * TAU, dx = Math.sin(a), dz = Math.cos(a);
		let bestR = 350, bestScore = Infinity;
		// Search from the outside inward. The radius bias selects the outer coast when
		// small inland ponds or low valleys also cross sea level.
		for (let r = 700; r >= 230; r -= 5) {
			const x = CENTRE_X + dx * r, z = CENTRE_Z + dz * r;
			const h = terrain.heightAt(x, z);
			const score = Math.abs(h) + (700 - r) * 0.0015;
			if (score < bestScore) { bestScore = score; bestR = r; }
		}
		radii[i] = bestR;
	}
	// Circular smoothing removes height-map cell noise without turning the coast into a circle.
	const smoothed = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		let sum = 0, weight = 0;
		for (let k = -4; k <= 4; k++) { const w = 5 - Math.abs(k); sum += radii[(i + k + count) % count] * w; weight += w; }
		smoothed[i] = sum / weight;
	}
	cache = { radii: smoothed, count };
	shorelineCaches.set(terrain, cache);
	return cache;
}

function coastRadius(cache, angle) {
	const u = ((angle / TAU % 1) + 1) % 1 * cache.count;
	const i = Math.floor(u), f = smooth(u - i);
	return cache.radii[i] * (1 - f) + cache.radii[(i + 1) % cache.count] * f;
}

function rawPosition(elapsed, terrain, seed) {
	const s = seedNumber(seed), phase = hash(s) * TAU;
	// About one circuit per 20 minutes, with continuous speed variation.
	const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
	const angle = phase + t * 0.00515 + Math.sin(t * 0.0019 + hash(s + 1) * TAU) * 0.23
		+ Math.sin(t * 0.00071 + hash(s + 2) * TAU) * 0.11;
	const coast = coastRadius(shorelineFor(terrain), angle);
	// Mostly trace the shallows. Smooth, infrequent offshore pulses hide the whole animal.
	const diveWave = Math.sin(t * 0.0037 + hash(s + 3) * TAU);
	const dive = smooth((diveWave - 0.66) / 0.25);
	const variation = 14 * Math.sin(t * 0.013 + hash(s + 4) * TAU)
		+ 9 * Math.sin(t * 0.0061 + hash(s + 5) * TAU);
	const radius = coast + 24 + variation + dive * 125;
	return { x: CENTRE_X + Math.sin(angle) * radius, z: CENTRE_Z + Math.cos(angle) * radius, angle, dive };
}

export function kaijuPoseAt(elapsed, terrain, seed = 'kaiju') {
	const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
	const p = rawPosition(t, terrain, seed);
	const before = rawPosition(Math.max(0, t - 0.35), terrain, seed);
	const after = rawPosition(t + 0.35, terrain, seed);
	const dx = after.x - before.x, dz = after.z - before.z;
	// Mesh forward is +Z, so this yaw maps +Z onto the route tangent.
	const yaw = Math.atan2(dx, dz);
	const ground = terrain.heightAt(p.x, p.z);
	// Offshore swimming is an intentional absence from the seabed (-90): feet are capped
	// at -32, deep enough that feet + body height is below sea level.
	const swim = smooth((p.dive - 0.18) / 0.48);
	const feet = clamp(ground * (1 - swim) - 32 * swim, -32, 3);
	const exposed = clamp((feet + KAIJU_ROUTE.height - 0.3) / KAIJU_ROUTE.height, 0, 1);
	const speed = Math.hypot(dx, dz) / 0.7;
	const pierClearance = Math.hypot(p.x - WORLD.pier.x, p.z - WORLD.pier.z);
	return { x: p.x, z: p.z, feet, yaw, exposed, wetness: feet < -1 ? 1 : 0, moving: speed > 0.05,
		progress: t / KAIJU_ROUTE.duration, speed, pierClearance };
}
