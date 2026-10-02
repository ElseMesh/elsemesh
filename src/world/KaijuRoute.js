// Terrain-qualified, cached coastal route for the roaming kaiju.

export const KAIJU_ROUTE = Object.freeze({
	start: { x: 86, z: 290 },
	end: { x: 84, z: 54 },
	duration: 92,
	height: 24,
});

const CX = 0, CZ = -400, TAU = Math.PI * 2;
const NODE_COUNT = 512;
const caches = new WeakMap();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
const fract = (v) => v - Math.floor(v);
const hash = (v) => fract(Math.sin(v * 127.1 + 311.7) * 43758.5453123);

function seedNumber(seed) {
	if (typeof seed === 'number' && Number.isFinite(seed)) return seed;
	let h = 2166136261;
	for (const c of String(seed ?? 'kaiju')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
	return h >>> 0;
}

function pierDistance(x, z) {
	const dx = Math.max(48 - x, 0, x - 62);
	const dz = Math.max(-64 - z, 0, z - 43.5);
	return Math.hypot(dx, dz);
}

function buildContour(terrain) {
	let cached = caches.get(terrain);
	if (cached) return cached;

	const edge = new Float64Array(NODE_COUNT);
	for (let i = 0; i < NODE_COUNT; i++) {
		const a = i * TAU / NODE_COUNT, sx = Math.sin(a), sz = Math.cos(a);
		let outer = 220;
		// The first island is wholly inside this radius. Scanning inward and retaining
		// the outermost raised terrain avoids selecting bays, lakes, and inland valleys.
		for (let r = 820; r >= 180; r -= 4) {
			if (terrain.heightAt(CX + sx * r, CZ + sz * r) > 3) { outer = r; break; }
		}
		edge[i] = outer;
	}

	// First form a conservative outward envelope around projecting headlands, then
	// low-pass that envelope over a broad angular window. The extra seaward margin
	// keeps the smoothed curve outside the sampled coast while avoiding the sharp
	// radial wedges produced by using the maximum-filter result directly.
	const envelope = new Float64Array(NODE_COUNT);
	for (let i = 0; i < NODE_COUNT; i++) {
		let r = 0;
		for (let k = -12; k <= 12; k++) r = Math.max(r, edge[(i + k + NODE_COUNT) % NODE_COUNT]);
		envelope[i] = r;
	}
	const radii = new Float64Array(NODE_COUNT);
	for (let i = 0; i < NODE_COUNT; i++) {
		let weighted = 0, weights = 0;
		// Smooth across roughly ninety degrees. This retains the conservative outer
		// envelope while removing short radial lobes whose curvature was still visible
		// as rapid heading changes after spline interpolation.
		for (let k = -64; k <= 64; k++) {
			const weight = 65 - Math.abs(k);
			weighted += envelope[(i + k + NODE_COUNT) % NODE_COUNT] * weight;
			weights += weight;
		}
		radii[i] = weighted / weights + 82;
	}

	// Qualifying nodes independently can reintroduce narrow radial spikes. Record the
	// required outward corrections, envelope them, and smooth once more so terrain
	// clearance is carried by the curve itself rather than jagged per-node pushes.
	const qualified = new Float64Array(NODE_COUNT);
	for (let i = 0; i < NODE_COUNT; i++) {
		const a = i * TAU / NODE_COUNT, sx = Math.sin(a), sz = Math.cos(a);
		let r = radii[i];
		for (let tries = 0; tries < 80; tries++, r += 5) {
			const x = CX + sx * r, z = CZ + sz * r;
			if (terrain.heightAt(x, z) <= 2.5 && pierDistance(x, z) >= 48) break;
		}
		qualified[i] = r;
	}
	const safeEnvelope = new Float64Array(NODE_COUNT);
	for (let i = 0; i < NODE_COUNT; i++) {
		let r = 0;
		for (let k = -16; k <= 16; k++) r = Math.max(r, qualified[(i + k + NODE_COUNT) % NODE_COUNT]);
		safeEnvelope[i] = r;
	}
	const safeRadii = new Float64Array(NODE_COUNT);
	for (let i = 0; i < NODE_COUNT; i++) {
		let weighted = 0, weights = 0;
		for (let k = -48; k <= 48; k++) {
			const weight = 49 - Math.abs(k);
			weighted += safeEnvelope[(i + k + NODE_COUNT) % NODE_COUNT] * weight;
			weights += weight;
		}
		const desired = weighted / weights + 70;
		const angle = i * TAU / NODE_COUNT, sx = Math.sin(angle), sz = Math.cos(angle);
		const capX = Math.abs(sx) > 0.001 ? (985 - Math.sign(sx) * CX) / Math.abs(sx) : 1e6;
		const capZ = Math.abs(sz) > 0.001 ? (985 - Math.sign(sz) * CZ) / Math.abs(sz) : 1e6;
		// Keep the contour itself inside the world inset; offshore-capacity logic cannot
		// repair a base contour already beyond the northern edge. Blend into the cap
		// over a broad band so the inset does not introduce another heading corner.
		// Round the rectangle's limiting-axis transition conservatively as well; a
		// hard min here creates a geometric corner in the cached contour itself.
		const lesser = Math.min(capX, capZ), difference = Math.abs(capX - capZ);
		const cap = lesser - Math.log1p(Math.exp(-0.008 * difference)) / 0.008;
		const blend = smooth((cap - desired + 140) / 280);
		safeRadii[i] = cap - (cap - desired) * blend;
	}

	const points = new Array(NODE_COUNT + 1);
	for (let i = 0; i <= NODE_COUNT; i++) {
		const j = i % NODE_COUNT, a = j * TAU / NODE_COUNT, r = safeRadii[j];
		points[i] = { x: CX + Math.sin(a) * r, z: CZ + Math.cos(a) * r, r, a };
	}

	const cumulative = new Float64Array(NODE_COUNT + 1);
	for (let i = 0; i < NODE_COUNT; i++) {
		const a = points[i], b = points[i + 1];
		cumulative[i + 1] = cumulative[i] + Math.hypot(b.x - a.x, b.z - a.z);
	}
	cached = { points, cumulative, length: cumulative[NODE_COUNT] };
	caches.set(terrain, cached);
	return cached;
}

function contourAt(cache, distance) {
	let d = ((distance % cache.length) + cache.length) % cache.length;
	let lo = 0, hi = NODE_COUNT;
	while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (cache.cumulative[m] <= d) lo = m; else hi = m; }
	const prev = cache.points[(lo - 1 + NODE_COUNT) % NODE_COUNT];
	const p = cache.points[lo], q = cache.points[lo + 1];
	const next = cache.points[(lo + 2) % NODE_COUNT];
	const hPrev = Math.hypot(p.x - prev.x, p.z - prev.z) || 1;
	const h = cache.cumulative[lo + 1] - cache.cumulative[lo] || 1;
	const hNext = Math.hypot(next.x - q.x, next.z - q.z) || 1;
	const f = (d - cache.cumulative[lo]) / h;
	const f2 = f * f, f3 = f2 * f;
	const h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f;
	const h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
	// Distance-scaled central tangents make adjacent segments share both position
	// and direction, eliminating polyline-corner yaw snaps without faking yaw.
	const px = (q.x - prev.x) / (hPrev + h), pz = (q.z - prev.z) / (hPrev + h);
	const qx = (next.x - p.x) / (h + hNext), qz = (next.z - p.z) / (h + hNext);
	return {
		x: h00 * p.x + h10 * h * px + h01 * q.x + h11 * h * qx,
		z: h00 * p.z + h10 * h * pz + h01 * q.z + h11 * h * qz,
	};
}

function rawPosition(elapsed, terrain, seed) {
	const cache = buildContour(terrain), s = seedNumber(seed);
	// Permit evaluation just before zero so the initial centred tangent follows the
	// same continuous route instead of turning sharply as a clamped point releases.
	const t = Number.isFinite(elapsed) ? elapsed : 0;
	const phase = hash(s) * cache.length;
	// Arc-length travel gives a stable coastal speed. Broad, slowly changing offshore
	// pulses create genuine deep-water disappearances and vary on every circuit.
	// A measured 1.35 m/s coastal pace keeps genuine path curvature below the
	// visible heading-rate limit while remaining within the intended walking range.
	const base = contourAt(cache, phase + t * 1.35);
	const angle = Math.atan2(base.x - CX, base.z - CZ);
	const wave = Math.sin(t * 0.0017 + hash(s + 1) * TAU)
		+ 0.55 * Math.sin(t * 0.00063 + hash(s + 2) * TAU);
	const dive = smooth((wave - 0.38) / 0.72);
	// Use a smooth conservative approximation of the square world boundary. A hard
	// min of the x/z capacities has a derivative corner where the limiting axis
	// changes, which made the actual path (and therefore its heading) snap.
	const sx = Math.sin(angle), sz = Math.cos(angle);
	// Measure remaining travel from the actual point to each directional side of
	// the world rectangle. A negative-power mean is a smooth conservative min,
	// so it rounds the limiting-axis transition without ever exceeding either cap.
	const capX = Math.abs(sx) > 0.001 ? (990 - Math.sign(sx) * base.x) / Math.abs(sx) : 1e6;
	const capZ = Math.abs(sz) > 0.001 ? (990 - Math.sign(sz) * base.z) / Math.abs(sz) : 1e6;
	// A log-sum-exp soft minimum is conservative for every positive capacity and
	// stays well behaved when one axis is nearly parallel to the route. The extra
	// ten-metre inset absorbs spline and floating-point tolerance at the boundary.
	const lesser = Math.min(capX, capZ), difference = Math.abs(capX - capZ);
	const smoothRoom = lesser - Math.log1p(Math.exp(-0.03 * difference)) / 0.03;
	// Smoothly saturate offshore capacity instead of hard-clamping at 330m. The
	// clamp's derivative corner changed the real path tangent as a dive crossed the
	// threshold, producing a heading spike even though the contour itself was smooth.
	const positiveRoom = Math.max(0, smoothRoom);
	const room = 330 * Math.tanh(positiveRoom / 330);
	// The separate southern island lies directly offshore of the first island.
	// Smoothly suppress excursions in that sector rather than clipping positions
	// after evaluation; dives remain available around the rest of the coastline.
	const southAngle = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
	const southTaper = smooth((southAngle - 0.62) / 0.5);
	const offshore = room * dive * southTaper;
	return { x: base.x + sx * offshore, z: base.z + sz * offshore, dive: dive * southTaper };
}

export function kaijuPoseAt(elapsed, terrain, seed = 'kaiju') {
	const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
	const p = rawPosition(t, terrain, seed);
	const before = rawPosition(Math.max(0, t - 0.25), terrain, seed);
	const after = rawPosition(t + 0.25, terrain, seed);
	const dx = after.x - before.x, dz = after.z - before.z;
	const speed = Math.hypot(dx, dz) / (t < 0.25 ? t + 0.25 : 0.5);
	const ground = terrain.heightAt(p.x, p.z);
	// Never place feet beneath either real terrain or the deep-swimming cap.
	const feet = Math.max(ground, -32);
	const exposed = clamp((feet + KAIJU_ROUTE.height - 0.3) / KAIJU_ROUTE.height, 0, 1);
	return {
		x: p.x, z: p.z, feet, yaw: Math.atan2(dx, dz), exposed,
		wetness: feet < -1 ? 1 : 0, speed, moving: speed > 0.05,
		progress: t / KAIJU_ROUTE.duration, pierClearance: pierDistance(p.x, p.z),
	};
}
