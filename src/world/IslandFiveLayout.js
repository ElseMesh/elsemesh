// Bounded, additive Island Five terrain contract. Coordinates are metres in the shared
// [-1024, 1024] terrain domain and deliberately sit away from existing islands.
export const ISLAND_FIVE = Object.freeze({
  id: 'island-five',
  center: Object.freeze({ x: -800, z: 430 }),
  radius: 112,
  shorelineMargin: 18,
  forestRadius: 82,
  maxTrees: 180
});

const clamp01 = value => Math.max(0, Math.min(1, value));
const smoothstep = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

// Analytic height: sea outside the island, a smooth beach fringe, and a low
// forestable interior. The function is bounded and side-effect free for
// TerrainData integration or deterministic tests.
export function islandFiveHeight(x, z) {
  const dx = (x - ISLAND_FIVE.center.x) / ISLAND_FIVE.radius;
  const dz = (z - ISLAND_FIVE.center.z) / (ISLAND_FIVE.radius * 0.86);
  const distance = Math.hypot(dx, dz);
  if (distance >= 1.42) return -90;
  if (distance > 1) return -4 - (distance - 1) * (86 / 0.42);

  const land = smoothstep((1 - distance) / 0.18);
  const interior = smoothstep((1 - distance) / 0.62);
  const relief = 0.75 * Math.sin((x + 17) * 0.071) * Math.cos((z - 9) * 0.063);
  return Math.max(-4, -3.5 + land * 4.5 + interior * (3.2 + relief));
}

export function islandFiveContains(x, z) {
  const dx = (x - ISLAND_FIVE.center.x) / ISLAND_FIVE.radius;
  const dz = (z - ISLAND_FIVE.center.z) / (ISLAND_FIVE.radius * 0.86);
  return Math.hypot(dx, dz) < 1;
}

export function islandFiveForestContains(x, z) {
  const dx = x - ISLAND_FIVE.center.x;
  const dz = (z - ISLAND_FIVE.center.z) / 0.86;
  return Math.hypot(dx, dz) <= ISLAND_FIVE.forestRadius;
}
