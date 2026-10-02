import assert from 'node:assert/strict';
import { TerrainData } from '../src/world/TerrainData.js';
import { kaijuPoseAt } from '../src/world/KaijuRoute.js';

const terrain = new TerrainData();
const seeds = [1, 2, 3, 17, 99];
const centre = { x: 0, z: -400 };
const signatures = [];

for (const seed of seeds) {
	let deep = 0, visible = 0, maxStep = 0;
	const sectors = new Set();
	let previous = null;
	for (let t = 0; t <= 6000; t += 5) {
		const pose = kaijuPoseAt(t, terrain, seed);
		for (const key of ['x', 'z', 'feet', 'yaw', 'exposed', 'speed', 'progress', 'pierClearance'])
			assert.ok(Number.isFinite(pose[key]), `seed ${seed} t ${t}: finite ${key}`);
		const ground = terrain.heightAt(pose.x, pose.z);
		assert.ok(pose.feet >= ground - 0.05, `seed ${seed} t ${t}: feet ${pose.feet} below ${ground}`);
		assert.ok(ground <= 3.05, `seed ${seed} t ${t}: inland ground ${ground}`);
		assert.ok(pose.pierClearance >= 40, `seed ${seed} t ${t}: pier ${pose.pierClearance}`);
		assert.ok(pose.speed <= 6.5, `seed ${seed} t ${t}: speed ${pose.speed}`);
		assert.ok(Math.abs(pose.x) <= 1010 && Math.abs(pose.z) <= 1010, `seed ${seed} t ${t}: world bounds`);
		sectors.add(Math.floor(((Math.atan2(pose.x - centre.x, pose.z - centre.z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 16));
		if (ground < -24) deep++;
		if (pose.exposed > 0.25) visible++;
		if (previous) maxStep = Math.max(maxStep, Math.hypot(pose.x - previous.x, pose.z - previous.z));
		previous = pose;
	}
	assert.equal(sectors.size, 16, `seed ${seed}: full angular coverage`);
	assert.ok(deep > 0, `seed ${seed}: reaches real deep water`);
	assert.ok(visible > 0, `seed ${seed}: has visible samples`);
	assert.ok(maxStep <= 33, `seed ${seed}: no coarse-sample teleport (${maxStep})`);

	for (const boundary of [0, 92, 1200, 2400, 3600, 4800, 6000]) {
		const a = kaijuPoseAt(Math.max(0, boundary - 0.02), terrain, seed);
		const b = kaijuPoseAt(boundary + 0.02, terrain, seed);
		assert.ok(Math.hypot(b.x - a.x, b.z - a.z) <= 0.3, `seed ${seed}: continuous near ${boundary}`);
	}

	let maxTurnRate = 0, maxTurnTime = 0;
	for (let t = 0.1; t <= 6000; t += 1) {
		const a = kaijuPoseAt(t, terrain, seed);
		const b = kaijuPoseAt(t + 0.1, terrain, seed);
		const delta = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
		const turnRate = Math.abs(delta) / 0.1;
		if (turnRate > maxTurnRate) { maxTurnRate = turnRate; maxTurnTime = t; }
	}
	assert.ok(maxTurnRate <= 0.5, `seed ${seed}: heading turn rate ${maxTurnRate} rad/s at t=${maxTurnTime}`);

	const a = kaijuPoseAt(1234.567, terrain, seed);
	const b = kaijuPoseAt(1234.567, terrain, seed);
	assert.deepEqual(a, b, `seed ${seed}: deterministic`);
	signatures.push([a.x, a.z]);
}

assert.ok(signatures.some((p, i) => i && Math.hypot(p[0] - signatures[0][0], p[1] - signatures[0][1]) > 10), 'different seeds vary');
console.log('kaiju roaming terrain qualification passed');
