// Shared junction mouth/kerb geometry. Distances are metres, X/Z plan coordinates.
// A filleted boundary follows each incident road instead of a circular asphalt disc.
export const JUNCTION_TRIM = 10;
const cross = (a, b) => a.x * b.z - a.z * b.x;
const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

export function lineIntersection(a, da, b, db) {
  const denominator = cross(da, db);
  if (Math.abs(denominator) < 1e-6) return mix(a, b, .5);
  const t = cross(sub(b, a), db) / denominator;
  return { x: a.x + da.x * t, z: a.z + da.z * t };
}

export function quadraticPose(a, c, b, t) {
  const p = mix(mix(a, c, t), mix(c, b, t), t);
  const d = mix(sub(c, a), sub(b, c), t);
  return { ...p, yaw: Math.atan2(d.x, d.z) };
}

export function junctionBoundary(node, edges, nodes) {
  const arms = edges.filter(e => e.from === node.id || e.to === node.id).map(edge => {
    const other = nodes[edge.from === node.id ? edge.to : edge.from];
    const length = Math.hypot(other.x - node.x, other.z - node.z);
    const direction = { x: (other.x - node.x) / length, z: (other.z - node.z) / length };
    const mouth = { x: direction.x * JUNCTION_TRIM, z: direction.z * JUNCTION_TRIM };
    const half = edge.width / 2;
    return { direction, angle: Math.atan2(direction.z, direction.x),
      right: { x: mouth.x + direction.z * half, z: mouth.z - direction.x * half },
      left: { x: mouth.x - direction.z * half, z: mouth.z + direction.x * half } };
  }).sort((a, b) => a.angle - b.angle);
  if (arms.length < 2) throw Error('junction_requires_two_arms');
  const boundary = [], kerbs = [];
  for (let i = 0; i < arms.length; i++) {
    const arm = arms[i], next = arms[(i + 1) % arms.length];
    boundary.push(arm.right, arm.left);
    const control = lineIntersection(arm.left, arm.direction, next.right, next.direction);
    // Near-parallel opposing roads have a straight boundary; the intersection
    // helper uses their midpoint and therefore introduces no arbitrary bulge.
    if (Math.hypot(control.x, control.z) > JUNCTION_TRIM * 3)
      throw Error(`unsupported_acute_junction:${node.id}`);
    let previous = arm.left;
    for (let sample = 1; sample <= 12; sample++) {
      const point = quadraticPose(arm.left, control, next.right, sample / 12);
      kerbs.push([previous, point]);
      if (sample < 12) boundary.push(point);
      previous = point;
    }
  }
  return { boundary, kerbs };
}

// Ear clipping retains concave kerb returns; a centre fan would fill their grass
// corners or produce overlapping triangles. Return X/Z counterclockwise indices.
export function triangulateRoadBoundary(points) {
  const remaining = points.map((_, i) => i), triangles = [];
  const area = points.reduce((sum, p, i) => sum + cross(p, points[(i + 1) % points.length]), 0);
  if (area < 0) remaining.reverse();
  const inside = (p, a, b, c) => cross(sub(b, a), sub(p, a)) >= -1e-8 &&
    cross(sub(c, b), sub(p, b)) >= -1e-8 && cross(sub(a, c), sub(p, c)) >= -1e-8;
  while (remaining.length > 3) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const ia = remaining[(i + remaining.length - 1) % remaining.length];
      const ib = remaining[i], ic = remaining[(i + 1) % remaining.length];
      const a = points[ia], b = points[ib], c = points[ic];
      if (cross(sub(b, a), sub(c, b)) <= 1e-9) continue;
      if (remaining.some(j => j !== ia && j !== ib && j !== ic && inside(points[j], a, b, c))) continue;
      triangles.push(ia, ib, ic); remaining.splice(i, 1); clipped = true; break;
    }
    if (!clipped) throw Error('invalid_junction_boundary');
  }
  triangles.push(...remaining); return triangles;
}
