// Island Four sits west of Island Three inside the existing 2048 m terrain domain.
// Its residence occupies the far, ocean-facing forest edge; the three earlier
// islands and their routes remain unchanged.
export const FOURTH = Object.freeze({
  x: -500,
  z: 650,
  radiusX: 138,
  radiusZ: 118,
  villa: Object.freeze({ x: -500, z: 720, yaw: Math.PI }),
});

const clamp01 = value => Math.max(0, Math.min(1, value));
const smoothstep = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function roundedPad(x, z) {
  const dx = Math.max(Math.abs(x - FOURTH.villa.x) - 10.5, 0);
  const dz = Math.max(Math.abs(z - FOURTH.villa.z) - 13, 0);
  const distance = Math.hypot(dx, dz);
  if (distance >= 12) return -90;
  return distance < 5 ? 7.8 : 7.8 - 11.8 * smoothstep((distance - 5) / 7);
}

export function fourthIslandHeight(x, z) {
  const dx = (x - FOURTH.x) / FOURTH.radiusX;
  const dz = (z - FOURTH.z) / FOURTH.radiusZ;
  const radius = Math.hypot(dx, dz);
  let island;
  if (radius >= 1.42) island = -90;
  else if (radius > 1) island = -4 - (radius - 1) * 180;
  else {
    const inland = smoothstep((1 - radius) / 0.35);
    const woodlandRelief = 0.7 * Math.sin(x * 0.075) * Math.cos(z * 0.061) * smoothstep((1 - radius) / 0.2);
    island = -4 + 12.2 * inland + woodlandRelief;
  }
  return Math.max(island, roundedPad(x, z));
}

export function fourthIslandContains(x, z, margin = 0) {
  return Math.hypot((x - FOURTH.x) / (FOURTH.radiusX + margin), (z - FOURTH.z) / (FOURTH.radiusZ + margin)) < 1;
}
