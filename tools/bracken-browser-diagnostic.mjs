// Real browser-input diagnostic, not a final visual or release qualification.
// Playwright sends ordinary keyboard events to the live game; it never writes
// game state. Invoke against the local Vite server with:
//   node tools/bracken-browser-diagnostic.mjs OUTPUT_DIRECTORY
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routePose } from '../src/world/PortRoadGraph.js';

const output = path.resolve(process.argv[2] ?? 'artifacts/bracken-browser-diagnostic');
await mkdir(output, { recursive: true });
const recordCandidate = process.argv[3] === '--record-candidate';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false,
  args: ['--enable-unsafe-webgpu'],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 },
  ...(recordCandidate ? { recordVideo: { dir: output, size: { width: 1600, height: 900 } } } : {}),
});
const page = await context.newPage();
const observations = [];
const held = new Set();
const sample = async label => {
  const observed = await page.evaluate(() => {
    const app = window.__app;
    const port = app?.portIsland;
    if (!port) return { loaded: false };
    const car = port.playerCar;
    return {
      loaded: true, driving: port.driving, speed: port.speed, steer: port.steer,
      car: { x: car.position.x, y: car.position.y, z: car.position.z, yaw: car.rotation.y },
      player: { x: app.player.position.x, y: app.player.position.y, z: app.player.position.z,
        yaw: app.player.yaw, mode: app.player.mode },
      traffic: port.traffic.cars.map(other => ({ kind: other.kind, x: other.pose.x,
        z: other.pose.z, yaw: other.pose.yaw, speed: other.speed })),
      depotPower: port.depotPower, gatehouseLoaded: !!port.gatehouseModel,
      vehicleAssetStatus: port.vehicleAssetStatus ?? 'LOADING',
      fpsHud: document.querySelector('.tw-stats-main')?.textContent?.trim() ?? null,
      heapUsed: performance.memory?.usedJSHeapSize ?? null,
    };
  });
  const row = { at: new Date().toISOString(), label, held: [...held], ...observed };
  observations.push(row);
  return row;
};
const setHeld = async wanted => {
  const next = new Set(wanted);
  for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
};
const hold = async (keys, ms) => { await setHeld(keys); await page.waitForTimeout(ms); await setHeld([]); };
const snap = async label => { await page.screenshot({ path: path.join(output, `${label}.png`) }); await sample(label); };
const angleDelta = (target, yaw) => Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
let outcome = 'INCOMPLETE';
try {
  await page.goto('http://127.0.0.1:5189/?view=portCar', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__app?.portIsland?.gatehouseModel, null, { timeout: 150_000 });
  await page.waitForFunction(() => !!window.__app?.portIsland?.vehicleAssetStatus, null, { timeout: 150_000 });
  await page.getByRole('button', { name: /Tap or click to explore/ }).waitFor({ state: 'visible', timeout: 150_000 });
  await page.getByRole('button', { name: /Tap or click to explore/ }).click();
  await page.waitForTimeout(1200);
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible()) await page.keyboard.press('Escape');
  await snap('01-port-car-before-walk');
  await page.keyboard.press('f');
  await page.waitForTimeout(1200);
  await sample('on-foot');
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  let current = await sample('enter-attempt');
  if (!current.driving) throw Error('vehicle_enter_not_observed');
  await snap('02-entered-car');
  await hold(['w'], 900);
  current = await sample('accelerate');
  if (Math.abs(current.speed) < 1) throw Error('accelerate_not_observed');
  await hold(['Space'], 750);
  current = await sample('brake');
  await hold(['s'], 900);
  current = await sample('reverse');
  await snap('03-brake-reverse');
  // This connected journey uses player keyboard controls and read-only pose
  // feedback. It is not a state teleport or a scripted game simulation.
  const waypoints = [['checkpoint', 694, 492]];
  let segment = 0;
  for (const [edgeId, from, to] of [
    ['checkpoint-gate', 'checkpoint', 'gate'], ['gate-west', 'gate', 'west'],
    ['west-north', 'west', 'north'], ['north-depot', 'north', 'depot'],
  ]) {
    segment++;
    // Turn toward the next edge before the node; a car cannot take a sharp
    // junction by aiming at each road's exact centreline endpoint.
    for (const fraction of (edgeId === 'north-depot' ? [.25, .5, .75, .82, .96] : [.25, .5, .75, .82])) {
      const pose = routePose({ edgeId, from, to }, fraction, 1.65);
      waypoints.push([`s${String(segment).padStart(2, '0')}-${edgeId}-${fraction}`, pose.x, pose.z]);
    }
  }
  waypoints.push(['depot-approach', 839, 344]);
  for (const [name, targetX, targetZ] of waypoints) {
    const deadline = Date.now() + 40_000;
    let previous = null, stalled = 0;
    while (Date.now() < deadline) {
      current = await sample(`approach-${name}`);
      const dx = targetX - current.car.x, dz = targetZ - current.car.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 5.5) { await setHeld([]); await snap(`arrive-${name}`); break; }
      if (previous && Math.hypot(current.car.x - previous.x, current.car.z - previous.z) < .08) stalled++;
      else stalled = 0;
      if (stalled > 22) throw Error(`drive_stalled:${name}:${distance.toFixed(1)}m`);
      previous = { x: current.car.x, z: current.car.z };
      const delta = angleDelta(Math.atan2(dx, dz), current.car.yaw);
      const targetSpeed = distance < 15 || Math.abs(delta) > .45 ? 3.2 : 8;
      const keys = [];
      if (delta > .09) keys.push('d'); else if (delta < -.09) keys.push('a');
      if (current.speed > targetSpeed + 1.5) keys.push('Space');
      else if (current.speed < targetSpeed - .4) keys.push('w');
      await setHeld(keys);
      await page.waitForTimeout(120);
    }
    if (Date.now() >= deadline) throw Error(`drive_timeout:${name}`);
  }
  await setHeld([]);
  await page.keyboard.press('e');
  await page.waitForTimeout(350);
  current = await sample('depot-exit-attempt');
  if (current.driving) throw Error('vehicle_exit_not_observed');
  await snap('04-depot-exit');
  for (const [name, targetX, targetZ] of [
    ['depot-door', 838, 337], ['depot-interior', 838, 322], ['depot-breaker', 826, 310],
  ]) {
    const deadline = Date.now() + 30_000;
    let previous = null, stalled = 0;
    while (Date.now() < deadline) {
      current = await sample(`walk-${name}`);
      const dx = targetX - current.player.x, dz = targetZ - current.player.z;
      const distance = Math.hypot(dx, dz);
      if (distance < (name === 'depot-breaker' ? 1.6 : 2)) {
        await setHeld([]); await snap(`arrive-${name}`); break;
      }
      if (previous && Math.hypot(current.player.x - previous.x, current.player.z - previous.z) < .025) stalled++;
      else stalled = 0;
      if (stalled > 28) throw Error(`walk_stalled:${name}:${distance.toFixed(1)}m`);
      previous = { x: current.player.x, z: current.player.z };
      const forwardX = -Math.sin(current.player.yaw), forwardZ = -Math.cos(current.player.yaw);
      const rightX = -forwardZ, rightZ = forwardX;
      const forward = (dx * forwardX + dz * forwardZ) / distance;
      const right = (dx * rightX + dz * rightZ) / distance;
      const keys = [];
      if (forward > .2) keys.push('w'); else if (forward < -.2) keys.push('s');
      if (right > .2) keys.push('d'); else if (right < -.2) keys.push('a');
      await setHeld(keys);
      await page.waitForTimeout(120);
    }
    if (Date.now() >= deadline) throw Error(`walk_timeout:${name}`);
  }
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  current = await sample('depot-breaker-interact');
  await snap('05-depot-breaker');
  if (!current.depotPower) throw Error('depot_interaction_not_observed');
  if (recordCandidate) {
    // Complete the evidence sequence with ordinary keyboard walking, re-entry
    // and continued road driving. This remains provisional candidate footage.
    for (const [name, targetX, targetZ] of [
      ['return-depot-interior', 838, 322], ['return-depot-door', 838, 337],
      ['return-car', current.car.x, current.car.z],
    ]) {
      const deadline = Date.now() + 35_000;
      while (Date.now() < deadline) {
        current = await sample(`walk-${name}`);
        const dx = targetX - current.player.x, dz = targetZ - current.player.z;
        const distance = Math.hypot(dx, dz);
        if (distance < (name === 'return-car' ? 2.2 : 2.5)) {
          await setHeld([]); await snap(`arrive-${name}`); break;
        }
        const forwardX = -Math.sin(current.player.yaw), forwardZ = -Math.cos(current.player.yaw);
        const rightX = -forwardZ, rightZ = forwardX;
        const forward = (dx * forwardX + dz * forwardZ) / distance;
        const right = (dx * rightX + dz * rightZ) / distance;
        const keys = [];
        if (forward > .2) keys.push('w'); else if (forward < -.2) keys.push('s');
        if (right > .2) keys.push('d'); else if (right < -.2) keys.push('a');
        await setHeld(keys);
        await page.waitForTimeout(120);
      }
      if (Date.now() >= deadline) throw Error(`return_walk_timeout:${name}`);
    }
    await page.keyboard.press('e');
    await page.waitForTimeout(400);
    current = await sample('reenter-after-breaker');
    if (!current.driving) throw Error('vehicle_reentry_not_observed');
    await snap('06-reentered-after-breaker');
    const target = routePose({ edgeId: 'depot-east', from: 'depot', to: 'east' }, .55, 1.65);
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      current = await sample('continue-driving-after-breaker');
      const dx = target.x - current.car.x, dz = target.z - current.car.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 6) { await setHeld([]); await snap('07-continued-driving'); break; }
      const delta = angleDelta(Math.atan2(dx, dz), current.car.yaw);
      const targetSpeed = distance < 16 || Math.abs(delta) > .45 ? 3.2 : 8;
      const keys = [];
      if (delta > .09) keys.push('d'); else if (delta < -.09) keys.push('a');
      if (current.speed > targetSpeed + 1.5) keys.push('Space');
      else if (current.speed < targetSpeed - .4) keys.push('w');
      await setHeld(keys);
      await page.waitForTimeout(120);
    }
    if (Date.now() >= deadline) throw Error('continued_drive_timeout');
  }
  outcome = 'DRIVE_AND_DEPOT_INTERACTION_OBSERVED';
} catch (error) {
  outcome = `FAIL:${error.message}`;
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  observations.push({ at: new Date().toISOString(), label: 'failure-dom',
    bodyText: (await page.locator('body').innerText().catch(() => '')).slice(0, 1200) });
} finally {
  await setHeld([]);
  await writeFile(path.join(output, 'diagnostic.json'), JSON.stringify({
    schema: 'bracken-quay.browser-input-diagnostic/v1', outcome,
    inputMethod: 'Playwright keyboard on real Chrome/WebGPU page; read-only game telemetry',
    url: page.url(), viewport: { width: 1600, height: 900 }, observations,
  }, null, 2));
  console.log(JSON.stringify({ outcome, output, observations: observations.length }));
  const video = recordCandidate ? page.video() : null;
  await context.close();
  if (video) console.log(JSON.stringify({ rawVideo: await video.path() }));
  await browser.close();
}
if (outcome !== 'DRIVE_AND_DEPOT_INTERACTION_OBSERVED') process.exitCode = 1;
