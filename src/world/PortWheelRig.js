import { Group } from '../engine/scene/Group.js';

// Separate yaw pivots from axle spin; preserve source transforms (including
// mirrored wheels). MMC's separate rim, tyre and disc share one tyre hub.
export function rigPortWheels(nodes, mmc = false) {
  const hubs = nodes.filter(n => mmc ? /^trial-generic-tire-low/.test(n.name) : /^Wheel_[01]_[01]$/.test(n.name));
  const forward = mmc ? 'z' : 'x', lateral = mmc ? 'x' : 'z';
  const assemblies = hubs.map(hub => ({ hub, center: hub.position.clone(), members: [] }));
  for (const node of nodes) {
    const relevant = mmc ? /^trial-(generic-wheel|generic-tire-low|brake-disc)/.test(node.name)
      : /^(Wheel|Brake_Caliper)_[01]_[01]$/.test(node.name);
    if (!relevant) continue;
    const nearest = assemblies.reduce((best, a) => !best || node.position.distanceTo(a.center) < node.position.distanceTo(best.center) ? a : best, null);
    if (nearest) nearest.members.push(node);
  }
  const steering = [], wheels = [];
  for (const a of assemblies) {
    const yaw = new Group(), spin = new Group();
    yaw.name = `steer:${a.hub.name}`; spin.name = `spin:${a.hub.name}`;
    yaw.position.copy(a.center); a.hub.parent.add(yaw); yaw.add(spin);
    for (const node of a.members) {
      node.position.sub(a.center);
      (/^Brake_Caliper/.test(node.name) ? yaw : spin).add(node);
    }
    if (a.center[forward] > 0) steering.push(yaw);
    wheels.push(spin);
  }
  const positions = assemblies.map(a => a.center[forward]);
  return { wheels, steering, wheelAxis: mmc ? 'x' : 'z', wheelSpinSign: mmc ? 1 : -1,
    wheelbase: positions.length ? Math.max(...positions) - Math.min(...positions) : 2.8,
    track: assemblies.length ? 2 * Math.abs(assemblies[0].center[lateral]) : 1.6 };
}

export function steeringFromPoses(previous, current, wheelbase) {
  if (!previous) return 0;
  const distance = Math.hypot(current.x - previous.x, current.z - previous.z);
  if (distance < .0001) return null; // hold wheel direction while yielding
  const yaw = Math.atan2(Math.sin(current.yaw - previous.yaw), Math.cos(current.yaw - previous.yaw));
  return Math.max(-.6, Math.min(.6, Math.atan(wheelbase * yaw / distance)));
}

export function steerPortWheels(vehicle, angle, dt) {
  const data = vehicle.userData;
  if (angle !== null) data.wheelSteer = (data.wheelSteer || 0) + (angle - (data.wheelSteer || 0)) * Math.min(1, Math.max(0, dt) * 12);
  for (const pivot of data.steering || []) pivot.rotation.y = data.wheelSteer || 0;
}

export function spinPortWheels(vehicle, distance) {
  const data = vehicle.userData;
  for (const wheel of data.wheels || []) wheel.rotation[data.wheelAxis || 'x'] += distance / .37 * (data.wheelSpinSign || 1);
}
