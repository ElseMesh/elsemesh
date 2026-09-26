// Metres/seconds, +Y up, yaw zero faces -Z. Fixed substeps avoid frame-rate-dependent flight.
export function flightStep(s, controls, dt, groundAt, obstructed = () => false) {
 dt = Math.max(0, Math.min(0.1, dt));
 const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
 for (let i = 0; i < steps; i++) {
  s.rpm += ((controls.active ? 1 : 0) - s.rpm) * Math.min(1, h * 0.8);
  const ready = s.rpm > 0.75;
  const speed = controls.boost ? 38 : 24;
  const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
  const targetX = (controls.x * cy - controls.forward * sy) * speed;
  const targetZ = (-controls.x * sy - controls.forward * cy) * speed;
  const lift = ready ? controls.lift * 7 : 0;
  const ease = 1 - Math.exp(-h * 1.3);
  s.vx += ((ready ? targetX : 0) - s.vx) * ease;
  s.vz += ((ready ? targetZ : 0) - s.vz) * ease;
  s.vy += (lift - s.vy) * (1 - Math.exp(-h * 1.8));
  const nx = s.x + s.vx * h, nz = s.z + s.vz * h;
  // Sample the skid footprint ahead; stop horizontal travel into a cliff or building.
  const floor = Math.max(groundAt(nx, nz), groundAt(nx - 1.5, nz), groundAt(nx + 1.5, nz), groundAt(nx, nz - 2), groundAt(nx, nz + 2));
  if (floor > s.y + 0.55 || obstructed(s.x, s.y + 1, s.z, nx, nz)) { s.vx = s.vz = 0; }
  else { s.x = nx; s.z = nz; }
  const under = Math.max(groundAt(s.x, s.z), groundAt(s.x - 1.5, s.z), groundAt(s.x + 1.5, s.z), groundAt(s.x, s.z - 2), groundAt(s.x, s.z + 2));
  s.y = Math.max(under + 0.25, Math.min(450, s.y + s.vy * h));
  s.grounded = s.y <= under + 0.27;
  if (s.grounded || s.y >= 450) s.vy = 0;
  const turn = 1 - Math.exp(-h * 3);
  s.pitch += ((ready ? -controls.forward * 0.13 : 0) - s.pitch) * turn;
  s.roll += ((ready ? -controls.x * 0.17 : 0) - s.roll) * turn;
  if (s.grounded) { s.pitch *= 1 - turn; s.roll *= 1 - turn; }
 }
 return s;
}
export const canLeaveHelicopter = s => s.grounded && Math.hypot(s.vx, s.vz) < 0.7;
