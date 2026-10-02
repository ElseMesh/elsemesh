import { PORT_EDGES, PORT_NODES, ROAD_CLASSES, findRoadRoute, routePose, continuousRoutePose } from './PortRoadGraph.js';
import { JUNCTION_TRIM } from './PortRoadJunction.js';

const destinations = ['quay', 'depot', 'checkpoint', 'warehouse', 'north', 'yard'];
const starts = ['gate', 'north', 'quay', 'yard', 'depot', 'east'];
const edgeById = new Map(PORT_EDGES.map(edge => [edge.id, edge]));

// Dimensions measured from the governed OpenX Blender collision manifests.
// They remain provisional until the models and their licences are admitted.
export const PORT_VEHICLE_FOOTPRINTS = Object.freeze({
  // MMC AI68 bounds reach -2.49271/+2.51524 m along Z and are 2.10487 m wide.
  // Round the symmetric footprint outward to include both plate/body ends.
  player: Object.freeze({ length: 5.04, halfWidth: 1.055 }),
  car: Object.freeze({ length: 4.6745, halfWidth: 1.0425 }),
  van: Object.freeze({ length: 4.9992, halfWidth: 1.2538 }),
  utility: Object.freeze({ length: 4.3075, halfWidth: .9878 }),
});
const footprint = kind => PORT_VEHICLE_FOOTPRINTS[kind] || PORT_VEHICLE_FOOTPRINTS.car;
const axes = yaw => [{ x: Math.sin(yaw), z: Math.cos(yaw) }, { x: Math.cos(yaw), z: -Math.sin(yaw) }];

// Slab intersection in vehicle-local coordinates includes bumper corners, which
// three circular samples could miss against a thin oblique barrier.
export function portVehicleBarrierOverlap(pose, barrier, kind = 'player', thickness = .12) {
  const [forward, side] = axes(pose.yaw), size = footprint(kind);
  const local = (x, z) => [(x - pose.x) * side.x + (z - pose.z) * side.z,
    (x - pose.x) * forward.x + (z - pose.z) * forward.z];
  const a = local(barrier.ax, barrier.az), b = local(barrier.bx, barrier.bz);
  const extent = [size.halfWidth + thickness, size.length / 2 + thickness];
  let entry = 0, exit = 1;
  for (let axis = 0; axis < 2; axis++) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(a[axis]) > extent[axis]) return false;
      continue;
    }
    const t0 = (-extent[axis] - a[axis]) / delta;
    const t1 = (extent[axis] - a[axis]) / delta;
    entry = Math.max(entry, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (entry > exit) return false;
  }
  return true;
}

// A circular distance check prevents ordinary traffic from passing in the
// opposite lane. These oriented footprints reject only actual body overlap.
export function portVehicleOverlap(a, b, aKind = 'car', bKind = 'car') {
  return portVehiclePenetration(a, b, aKind, bKind) >= 0;
}

// Minimum separating-axis penetration, including the existing 10 cm clearance.
// Negative means separated; decreasing positive penetration permits an escape
// from an inherited overlap without allowing a car to move further through it.
export function portVehiclePenetration(a, b, aKind = 'car', bKind = 'car') {
  const aAxes = axes(a.yaw), bAxes = axes(b.yaw);
  const dx = b.x - a.x, dz = b.z - a.z;
  let depth = Infinity;
  for (const axis of [...aAxes, ...bAxes]) {
    const projection = Math.abs(dx * axis.x + dz * axis.z);
    const radius = (footprint(aKind).length / 2) * Math.abs(aAxes[0].x * axis.x + aAxes[0].z * axis.z)
      + footprint(aKind).halfWidth * Math.abs(aAxes[1].x * axis.x + aAxes[1].z * axis.z)
      + (footprint(bKind).length / 2) * Math.abs(bAxes[0].x * axis.x + bAxes[0].z * axis.z)
      + footprint(bKind).halfWidth * Math.abs(bAxes[1].x * axis.x + bAxes[1].z * axis.z) + .1;
    depth = Math.min(depth, radius - projection);
  }
  return depth;
}

export function vehicleMotionBlocked(current, proposed, obstacle, kind = 'car', obstacleKind = 'car') {
  const next = portVehiclePenetration(proposed, obstacle, kind, obstacleKind);
  if (next < 0) return false;
  const previous = portVehiclePenetration(current, obstacle, kind, obstacleKind);
  return previous < 0 || next >= previous - 1e-5;
}

// Fixed-step, deterministic traffic. No model calls or network state in the car loop.
export class PortTraffic {
  constructor(count = 6) {
    this.junctionOwners = new Map();
    this.cars = Array.from({ length: Math.max(0, Math.min(12, count)) }, (_, id) => ({
      id, kind: id % 4 === 1 ? 'van' : id % 4 === 2 ? 'utility' : 'car',
      route: findRoadRoute(starts[id % starts.length], destinations[id % destinations.length]),
      step: 0, fraction: (id % 3) * .18, speed: 0, wait: 0, trips: 0,
    }));
    for (const car of this.cars) {
      car.fraction = Math.max(car.fraction, (JUNCTION_TRIM + 3) / edgeById.get(car.route[0].edgeId).length);
      car.pose = routePose(car.route[0], car.fraction, car.kind === 'van' ? 1.36 : 1.55);
    }
  }

  update(dt, obstacle = null) {
    const delta = Math.max(0, Math.min(dt, .1));
    // Reserve the turning envelope before entering it. Collision rejection
    // alone can strand two opposing bodies halfway through a tight connector.
    for (const node of Object.values(PORT_NODES)) {
      const owner = this.cars.find(c=>c.id===this.junctionOwners.get(node.id));
      if (owner && Math.hypot(owner.pose.x-node.x,owner.pose.z-node.z)<22) continue;
      this.junctionOwners.delete(node.id);
      const candidates=this.cars.filter(c=>c.route[c.step].to===node.id &&
        Math.hypot(c.pose.x-node.x,c.pose.z-node.z)<24)
        .sort((a,b)=>Math.hypot(a.pose.x-node.x,a.pose.z-node.z)-Math.hypot(b.pose.x-node.x,b.pose.z-node.z)||a.id-b.id);
      if(candidates.length)this.junctionOwners.set(node.id,candidates[0].id);
    }
    for (const car of this.cars) {
      const step = car.route[car.step], edge = edgeById.get(step.edgeId);
      // Plan beyond a destination before arrival so its junction connector is
      // known on both sides. Route completion counters retain their old meaning.
      if (!car.nextRoute) {
        const from = car.route.at(-1).to;
        const goal = destinations[(car.id + car.trips + 1) % destinations.length];
        const alternate = destinations.find(n => n !== from);
        car.nextRoute = findRoadRoute(from, goal === from ? alternate : goal, car.route.at(-1).edgeId);
      }
      const junction = car.fraction * edge.length < JUNCTION_TRIM ||
        (1 - car.fraction) * edge.length < JUNCTION_TRIM;
      const desired = Math.min(ROAD_CLASSES[edge.roadClass].speed * (car.kind === 'van' ? .83 : 1), junction ? 4 : Infinity);
      const current = car.pose;
      const blockedByCar = this.cars.some(other => {
        if (other === car) return false;
        const dx = other.pose.x - current.x, dz = other.pose.z - current.z;
        const ahead = dx * Math.sin(current.yaw) + dz * Math.cos(current.yaw);
        return ahead > 0 && ahead < 8 && Math.abs(dx * Math.cos(current.yaw) - dz * Math.sin(current.yaw)) < 2.1;
      });
      const playerDx = obstacle ? obstacle.x - current.x : 0;
      const playerDz = obstacle ? obstacle.z - current.z : 0;
      const playerAhead = playerDx * Math.sin(current.yaw) + playerDz * Math.cos(current.yaw);
      const playerLateral = playerDx * Math.cos(current.yaw) - playerDz * Math.sin(current.yaw);
      // A trailing player must not stop the lead vehicle and deadlock both cars.
      const playerObstacle = !!obstacle && playerAhead >= 0 && playerAhead < 7 && Math.abs(playerLateral) < 2;
      const junctionYield = (1 - car.fraction) * edge.length < JUNCTION_TRIM + 4 && car.wait < .65 && PORT_EDGES.filter(item => item.from === step.to || item.to === step.to).length > 2;
      const reservedBy = this.junctionOwners.get(step.to);
      const reservationYield = (1-car.fraction)*edge.length < 17 && reservedBy !== undefined && reservedBy !== car.id;
      const targetSpeed = blockedByCar || playerObstacle || junctionYield || reservationYield ? 0 : desired;
      car.speed += (targetSpeed - car.speed) * Math.min(1, delta * (targetSpeed ? 1.8 : 4));
      if (junctionYield) car.wait += delta;
      else if (car.fraction < .5) car.wait = 0;
      const saved = {fraction:car.fraction,step:car.step,trips:car.trips,
        route:car.route,nextRoute:car.nextRoute,previousStep:car.previousStep};
      car.fraction += car.speed * delta / edge.length;
      if (car.fraction >= 1) {
        const overrun = (car.fraction - 1) * edge.length;
        car.previousStep = step;
        car.step++;
        if (car.step >= car.route.length) {
          car.trips++;
          car.route = car.nextRoute; car.nextRoute = null;
          car.step = 0;
        }
        const next = edgeById.get(car.route[car.step].edgeId);
        car.fraction = Math.min(.25, overrun / next.length);
        car.wait = 0;
      }
      car.pose = continuousRoutePose(car.route[car.step], car.fraction,
        car.route[car.step - 1] || car.previousStep,
        car.route[car.step + 1] || car.nextRoute?.[0], car.kind === 'van' ? 1.36 : 1.55);
      const playerPose = obstacle && {...obstacle,yaw:obstacle.yaw??current.yaw};
      const collision = this.cars.some(other => other !== car &&
        vehicleMotionBlocked(current,car.pose,other.pose,car.kind,other.kind)) ||
        (playerPose && vehicleMotionBlocked(current,car.pose,playerPose,car.kind,'player'));
      if (collision) { Object.assign(car,saved);car.pose=current;car.speed=0; }
    }
    return this.cars;
  }
}
