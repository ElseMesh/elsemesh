// Real Chrome/WebGPU driving qualification. Only keyboard input changes game
// state; page.evaluate reads telemetry. No teleport, clock or traffic injection.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routePose } from '../src/world/PortRoadGraph.js';

const output = path.resolve(process.argv[2] ?? 'artifacts/bracken-three-loop');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false, args: ['--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const rows = [], held = new Set();
let outcome = 'INCOMPLETE';
const angleDelta = (target, yaw) => Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
const sample = async label => {
  const state = await page.evaluate(() => {
    const port = window.__app?.portIsland;
    if (!port) return { loaded: false };
    const car = port.playerCar;
    return { loaded: true, driving: port.driving, speed: port.speed,
      pose: { x: car.position.x, z: car.position.z, yaw: car.rotation.y },
      asset: port.vehicleAssetStatus, depotPower: port.depotPower,
      traffic: port.traffic.cars.map(ai => ({ id: ai.id, kind: ai.kind,
        x: ai.pose.x, z: ai.pose.z, speed: ai.speed, trips: ai.trips })),
      fpsHud: document.querySelector('.tw-stats-main')?.textContent?.trim() ?? null,
      heapUsed: performance.memory?.usedJSHeapSize ?? null };
  });
  const row = { at: new Date().toISOString(), label, held: [...held], ...state };
  rows.push(row); return row;
};
const setHeld = async keys => {
  const wanted = new Set(keys);
  for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
};
const snap = async label => {
  await setHeld([]);
  await page.screenshot({ path: path.join(output, `${label}.png`) });
  await sample(label);
};
const circuit = [
  ['checkpoint-gate', 'checkpoint', 'gate'], ['gate-west', 'gate', 'west'],
  ['west-north', 'west', 'north'], ['north-depot', 'north', 'depot'],
  ['depot-east', 'depot', 'east'], ['east-quay', 'east', 'quay'],
  ['quay-yard', 'quay', 'yard'], ['yard-checkpoint', 'yard', 'checkpoint'],
];
try {
  await page.goto('http://127.0.0.1:5189/?view=portCar', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__app?.portIsland?.vehicleAssetStatus,
    null, { timeout: 150_000 });
  await page.getByRole('button', { name: /Tap or click to explore/ })
    .click({ timeout: 150_000 });
  await page.waitForTimeout(1000);
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible()) await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await page.waitForTimeout(900);
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  let state = await sample('enter');
  if (!state.driving) throw Error('enter_not_observed');
  await snap('start');
  const waypoints = [['approach-checkpoint', 694, 492]];
  for (let loop = 1; loop <= 3; loop++) for (let segment = 0; segment < circuit.length; segment++) {
    const [edgeId, from, to] = circuit[segment];
    for (const fraction of [.22, .48, .72, .88]) {
      const pose = routePose({ edgeId, from, to }, fraction, 1.65);
      waypoints.push([`loop${loop}-${String(segment + 1).padStart(2, '0')}-${edgeId}-${fraction}`,
        pose.x, pose.z]);
    }
  }
  for (const [label, targetX, targetZ] of waypoints) {
    const deadline = Date.now() + 45_000;
    let previous = null, still = 0;
    while (Date.now() < deadline) {
      state = await sample(`drive:${label}`);
      const dx = targetX - state.pose.x, dz = targetZ - state.pose.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 3.8) {
        await setHeld([]);
        if (label === 'approach-checkpoint' || label.endsWith('-0.88'))
          await snap(`arrive-${label}`);
        else await sample(`arrive-${label}`);
        break;
      }
      if (previous && Math.hypot(state.pose.x - previous.x, state.pose.z - previous.z) < .05) still++;
      else still = 0;
      if (still > 35) throw Error(`stalled:${label}:${distance.toFixed(1)}m`);
      previous = { x: state.pose.x, z: state.pose.z };
      const delta = angleDelta(Math.atan2(dx, dz), state.pose.yaw);
      const desiredSpeed = distance < 13 || Math.abs(delta) > .3 ? 2.8 : 7.5;
      const keys = [];
      if (delta > .055) keys.push('d'); else if (delta < -.055) keys.push('a');
      if (state.speed > desiredSpeed + .7) keys.push('Space');
      else if (state.speed < desiredSpeed - .3) keys.push('w');
      await setHeld(keys);
      await page.waitForTimeout(110);
    }
    if (Date.now() >= deadline) throw Error(`timeout:${label}`);
    if (label.endsWith('yard-checkpoint-0.88')) await snap(`completed-loop-${label.slice(4, 5)}`);
  }
  outcome = 'THREE_CONSECUTIVE_LOOPS_OBSERVED';
} catch (error) {
  outcome = `FAIL:${error.message}`;
  await snap('failure').catch(() => {});
} finally {
  await setHeld([]);
  await writeFile(path.join(output, 'qualification.json'), JSON.stringify({
    schema: 'bracken-quay.real-browser-three-loop/v1', outcome,
    inputMethod: 'Playwright keyboard; read-only telemetry; no game state injection',
    viewport: { width: 1600, height: 900 }, rows,
  }, null, 2));
  console.log(JSON.stringify({ outcome, rows: rows.length, output }));
  await browser.close();
}
if (outcome !== 'THREE_CONSECUTIVE_LOOPS_OBSERVED') process.exitCode = 1;
