// South of Godzilla's approach. Localized heightfield addition; home and UNDERNEATH are untouched.
export const THIRD = Object.freeze({ x: 115, z: 650, radius: 115,
 dock: { x: 115, z: 530, y: 2.4 }, hut: { x: 105, z: 575 }, pad: { x: 115, z: 638, y: 8 } });
export function thirdIslandHeight(x, z) {
 const r = Math.hypot((x - THIRD.x) / 115, (z - THIRD.z) / 105);
 if (r >= 1.45) return -90;
 if (r > 1) return -4 - (r - 1) * 160;
 const t = Math.max(0, Math.min(1, (1 - r) / 0.37));
 return -4 + 12 * (t * t * (3 - 2 * t));
}
