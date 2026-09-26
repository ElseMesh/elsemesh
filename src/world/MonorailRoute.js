export const RAIL = Object.freeze({
	stationA: { x: -255, y: -16, z: -30 },
	stationB: { x: -1135, y: -16, z: -30 },
	duration: 48,
	island: { x: -1200, z: -30, radius: 155 },
});

export function railPosition(from, progress) {
	const t = Math.max(0, Math.min(1, progress));
	const eased = t * t * (3 - 2 * t);
	const a = from === 'A' ? RAIL.stationA : RAIL.stationB;
	const b = from === 'A' ? RAIL.stationB : RAIL.stationA;
	return { x: a.x + (b.x - a.x) * eased, y: a.y, z: a.z };
}

export function secondIslandHeight(x, z) {
	const { x: cx, z: cz, radius } = RAIL.island;
	const dx = (x - cx) / radius, dz = (z - cz) / radius;
	const r = Math.hypot(dx, dz);
	if (r >= 1) return -30;
	const hill = 33 * Math.pow(Math.max(0, 1 - r * r), 1.7);
	const shore = -7 + 13 * Math.max(0, 1 - r * r);
	const variation = 2.1 * Math.sin(x * 0.065) * Math.cos(z * 0.052) * Math.max(0, 1 - r);
	return shore + hill + variation;
}
