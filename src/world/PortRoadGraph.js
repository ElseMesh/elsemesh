// One deterministic graph supplies road geometry, lane poses and traffic routes.
// Positions are metres in the shared world coordinate system.
import { JUNCTION_TRIM, lineIntersection, quadraticPose } from './PortRoadJunction.js';
export const PORT = Object.freeze({
  id: 'bracken-quay',
  name: 'Bracken Quay',
  authority: 'Bracken Sound Port Authority',
  x: 760, z: 425, radiusX: 174, radiusZ: 154, roadY: 5.12,
});

const localNodes = {
  gate: [-125, -8], west: [-93, -63], north: [-13, -80], depot: [81, -63],
  east: [117, -6], quay: [112, 67], yard: [28, 79], checkpoint: [-67, 68],
  circle: [-31, -3], warehouse: [45, 25], service: [42, -39],
};
export const PORT_NODES = Object.freeze(Object.fromEntries(
  Object.entries(localNodes).map(([id, [x, z]]) => [id, Object.freeze({ id, x: PORT.x + x, z: PORT.z + z })]),
));

const edgeSpecs = [
  ['gate-west', 'gate', 'west', 'arterial'], ['west-north', 'west', 'north', 'secondary'],
  ['north-depot', 'north', 'depot', 'secondary'], ['depot-east', 'depot', 'east', 'secondary'],
  ['east-quay', 'east', 'quay', 'arterial'], ['quay-yard', 'quay', 'yard', 'service'],
  ['yard-checkpoint', 'yard', 'checkpoint', 'service'], ['checkpoint-gate', 'checkpoint', 'gate', 'arterial'],
  ['gate-circle', 'gate', 'circle', 'arterial'], ['circle-warehouse', 'circle', 'warehouse', 'arterial'],
  ['warehouse-east', 'warehouse', 'east', 'arterial'], ['circle-north', 'circle', 'north', 'secondary'],
  ['warehouse-yard', 'warehouse', 'yard', 'service'], ['warehouse-service', 'warehouse', 'service', 'service'],
  ['service-depot', 'service', 'depot', 'service'],
];
export const ROAD_CLASSES = Object.freeze({
  arterial: Object.freeze({ width: 8.4, speed: 11 }),
  secondary: Object.freeze({ width: 6.8, speed: 8 }),
  service: Object.freeze({ width: 5.4, speed: 5 }),
});
export const PORT_EDGES = Object.freeze(edgeSpecs.map(([id, from, to, roadClass]) => {
  const a = PORT_NODES[from], b = PORT_NODES[to];
  return Object.freeze({ id, from, to, roadClass, width: ROAD_CLASSES[roadClass].width,
    length: Math.hypot(b.x - a.x, b.z - a.z) });
}));

export function roadPosition(edge, fraction, lane = 0) {
  const a = PORT_NODES[edge.from], b = PORT_NODES[edge.to];
  const t = Math.max(0, Math.min(1, fraction));
  const dx = (b.x - a.x) / edge.length, dz = (b.z - a.z) / edge.length;
  return { x: a.x + (b.x - a.x) * t - dz * lane,
    y: PORT.roadY, z: a.z + (b.z - a.z) * t + dx * lane,
    yaw: Math.atan2(dx, dz) };
}

export function connectedEdges(nodeId) {
  return PORT_EDGES.filter(edge => edge.from === nodeId || edge.to === nodeId);
}

export function findRoadRoute(start, goal, avoidFirstEdgeId = null) {
  if (!(start in PORT_NODES) || !(goal in PORT_NODES)) throw Error('unknown_port_node');
  const queue = [{ node: start, cost: 0, path: [] }], best = new Map([[start, 0]]);
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (current.node === goal) return current.path;
    if (current.cost > best.get(current.node)) continue;
    for (const edge of connectedEdges(current.node)) {
      if (!current.path.length && edge.id === avoidFirstEdgeId) continue;
      const next = edge.from === current.node ? edge.to : edge.from;
      const cost = current.cost + edge.length / ROAD_CLASSES[edge.roadClass].speed;
      if (cost >= (best.get(next) ?? Infinity)) continue;
      best.set(next, cost);
      queue.push({ node: next, cost, path: [...current.path, { edgeId: edge.id, from: current.node, to: next }] });
    }
  }
  return null;
}

export function routePose(step, fraction, laneOffset = 1.65) {
  const edge = PORT_EDGES.find(candidate => candidate.id === step.edgeId);
  if (!edge || (step.from !== edge.from && step.from !== edge.to)) throw Error('invalid_port_route_step');
  const forward = step.from === edge.from;
  const pose = roadPosition(edge, forward ? fraction : 1 - fraction, forward ? laneOffset : -laneOffset);
  return { ...pose, yaw: pose.yaw + (forward ? 0 : Math.PI) };
}

// Incoming and outgoing edges share the same quadratic lane connector. Each
// owns half, so crossing the logical node no longer teleports or snaps heading.
export function continuousRoutePose(step, fraction, previous, next, laneOffset = 1.65) {
  const edge = PORT_EDGES.find(e => e.id === step.edgeId);
  const distance = Math.max(0, Math.min(1, fraction)) * edge.length;
  let incoming, outgoing, t;
  if (previous && distance < JUNCTION_TRIM) {
    incoming = previous; outgoing = step; t = .5 + distance / (2 * JUNCTION_TRIM);
  } else if (next && distance > edge.length - JUNCTION_TRIM) {
    incoming = step; outgoing = next; t = (distance - edge.length + JUNCTION_TRIM) / (2 * JUNCTION_TRIM);
  } else return routePose(step, fraction, laneOffset);
  if (incoming.to !== outgoing.from) throw Error('disconnected_junction_steps');
  const e0 = PORT_EDGES.find(e => e.id === incoming.edgeId);
  const e1 = PORT_EDGES.find(e => e.id === outgoing.edgeId);
  const a = routePose(incoming, 1 - JUNCTION_TRIM / e0.length, laneOffset);
  const b = routePose(outgoing, JUNCTION_TRIM / e1.length, laneOffset);
  const da = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) };
  const db = { x: Math.sin(b.yaw), z: Math.cos(b.yaw) };
  const control = lineIntersection(a, da, b, db);
  return { ...quadraticPose(a, control, b, t), y: PORT.roadY };
}

export function portIslandHeight(x, z) {
  // Berth extension walking surface, physically supported by pier columns.
  if (Math.abs(x - PORT.x) <= 40 && z - PORT.z >= 130 && z - PORT.z <= 160) return 5;
  const radius = Math.hypot((x - PORT.x) / PORT.radiusX, (z - PORT.z) / PORT.radiusZ);
  if (radius >= 1.38) return -90;
  if (radius > 1) return -3.5 - (radius - 1) * 90;
  // Reclaimed industrial platform: keep occupied peripheral plots on level
  // ground, with a short engineered shore batter rather than a broad beach
  // beneath warehouse foundations. Outer seabed and island extent are unchanged.
  const rise = Math.min(1, Math.max(0, (1 - radius) / 0.025));
  const smooth = rise * rise * (3 - 2 * rise);
  return -3.5 + smooth * 8.5;
}
