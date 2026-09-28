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

// Analytic height: sea outside the island, a smooth beach fringe, and a rolling
// forest interior. The function is bounded and side-effect free for
// TerrainData integration or deterministic tests.
export function islandFiveHeight(x, z) {
  const dx = (x - ISLAND_FIVE.center.x) / ISLAND_FIVE.radius;
  const dz = (z - ISLAND_FIVE.center.z) / (ISLAND_FIVE.radius * 0.86);
  const distance = Math.hypot(dx, dz);
  if (distance >= 1.42) return -90;
  if (distance > 1) return -4 - (distance - 1) * (86 / 0.42);

  const land = smoothstep((1 - distance) / 0.18);
  const interior = smoothstep((1 - distance) / 0.62);
  const shoreFade = smoothstep((1 - distance) / 0.28);
  const broadRidge = Math.sin((x + 34) * 0.024) * 2.4 + Math.cos((z - 51) * 0.031) * 1.8;
  const crossedRidge = Math.sin((x + z) * 0.043) * 1.35 + Math.cos((x - z) * 0.037) * 1.1;
  const hummocks = Math.sin((x + 17) * 0.091) * Math.cos((z - 9) * 0.083) * 0.65;
  const relief = (broadRidge + crossedRidge + hummocks) * shoreFade;
  return Math.max(-4, -3.5 + land * 5.0 + interior * 8.8 + relief);
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
