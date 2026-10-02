// South of Godzilla's approach. Localized heightfield addition; home and UNDERNEATH are untouched.
export const THIRD = Object.freeze({ x: 115, z: 650, radius: 115,
 dock: { x: 115, z: 530, y: 2.4 }, hut: { x: 105, z: 575 }, pad: { x: 115, z: 638, y: 8 } });

const smoothstep = t => {
 const x = Math.max(0, Math.min(1, t));
 return x * x * (3 - 2 * x);
};

// Building #002 occupies x 121.7..169.3 and z 589.6..630.9 after placement.
// Extend the island heightfield beneath it with a broad grassed shoulder instead
// of placing the warehouse over the original southern slope. The rounded fringe
// merges back into the existing island, so this remains terrain rather than a
// separate access path or a visible rectangular platform.
export function thirdIslandWarehouseExtension(x, z) {
 const dx = Math.max(Math.abs(x - 145.5) - 30, 0);
 const dz = Math.max(Math.abs(z - 610.25) - 26, 0);
 const distance = Math.hypot(dx, dz);
 if (distance >= 26) return -90;
 if (distance > 18) return -4 - (distance - 18) * (86 / 8);
 return -4 + 12 * smoothstep(1 - distance / 18);
}

export function thirdIslandHeight(x, z) {
 const r = Math.hypot((x - THIRD.x) / 115, (z - THIRD.z) / 105);
 let island;
 if (r >= 1.45) island = -90;
 else if (r > 1) island = -4 - (r - 1) * 160;
 else island = -4 + 12 * smoothstep((1 - r) / 0.37);
 return Math.max(island, thirdIslandWarehouseExtension(x, z));
}
