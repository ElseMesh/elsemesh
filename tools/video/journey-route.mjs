// The filmed journey is time compressed. These cubic segments provide a
// continuous course and heading, while the in-game boat controller supplies
// buoyancy, trim, roll, spray and steering-wheel response.
export const route = [
  [0, 64.5, 36.5], [2.5, 64.5, 61], [5, 42, 80], [7, 0, 85], [10, -100, 110],
  [13, -180, 180], [16, -180, 320], [19, -350, 320],
  [21, -450, 230], [24, -470, 120], [25, -480, 105], [26, -485, 85],
  [27, -465, 65], [28, -430, 65], [29, -390, 80], [31, -345, 84.5], [33, -323, 84.5],
];

const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));

function tangent(i) {
  if (i <= 1) return { x: 0, z: 9.8 };
  if (i === route.length - 1) {
    const a = route[i - 1], b = route[i], dt = b[0] - a[0];
    return { x: (b[1] - a[1]) / dt, z: 0 };
  }
  const a = route[i - 1], b = route[i + 1], dt = b[0] - a[0];
  return { x: (b[1] - a[1]) / dt, z: (b[2] - a[2]) / dt };
}

export function pathPoint(t) {
  t = Math.max(0, Math.min(33, t));
  let i = 0;
  while (i < route.length - 2 && t > route[i + 1][0]) i++;
  const a = route[i], b = route[i + 1];
  const dt = b[0] - a[0], u = Math.max(0, Math.min(1, (t - a[0]) / dt));
  if (i === 0) return { x: a[1], z: lerp(a[2], b[2], u) };
  const m0 = tangent(i), m1 = tangent(i + 1);
  const h00 = 2*u*u*u - 3*u*u + 1, h10 = u*u*u - 2*u*u + u;
  const h01 = -2*u*u*u + 3*u*u, h11 = u*u*u - u*u;
  return { x: h00*a[1] + h10*dt*m0.x + h01*b[1] + h11*dt*m1.x,
    z: h00*a[2] + h10*dt*m0.z + h01*b[2] + h11*dt*m1.z };
}

function headingAt(t) {
  const a = pathPoint(t - 0.04), b = pathPoint(t + 0.04);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export function boatAt(t) {
  const p = pathPoint(t), a = pathPoint(t - 0.04), b = pathPoint(t + 0.04);
  const ha = headingAt(t - 0.1), hb = headingAt(t + 0.1);
  return { ...p, heading: headingAt(t), vx: (b.x - a.x) / 0.08,
    vz: (b.z - a.z) / 0.08,
    turnRate: Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha)) / 0.2 };
}
