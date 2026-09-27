import { Mesh, TorusGeometry, Vector3 } from '../engine/index.js';
import { loadGLB } from '../engine/loaders/GLTF.js';
import { SkinnedModel } from '../engine/render/Skinning.js';
import { standard } from '../materials/Materials.js';
import { SPRAY } from '../fx/Spray.js';
import { KAIJU_ROUTE, kaijuPoseAt } from './KaijuRoute.js';

const MODEL_URL = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'models/godzilla/steam79-walk.glb';
const _p = new Vector3(), _q = new Vector3(), _v = new Vector3();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function rotateOffset(p, side, forward, y = 0) {
	const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
	return _p.set(p.x + cy * side + sy * forward, y, p.z - sy * side + cy * forward);
}
function rotateVelocity(p, side, up, forward) {
	const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
	return _v.set(cy * side + sy * forward, up, -sy * side + cy * forward);
}
function multiplyYaw(q, angle) {
	const y = Math.sin(angle * 0.5), w = Math.cos(angle * 0.5);
	const x0 = q[0], y0 = q[1], z0 = q[2], w0 = q[3];
	// Parent-space Y rotation: Head and Tail are children of the near-upright Torso.
	q[0] = x0 * w + z0 * y; q[1] = w0 * y + y0 * w;
	q[2] = z0 * w - x0 * y; q[3] = w0 * w - y0 * y;
}

export function advanceEmissionCadence(accumulator, dt, hz = 30) {
	const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
	const total = accumulator + safeDt * hz;
	const ticks = Math.floor(total + 1e-9);
	return { ticks, accumulator: total - ticks };
}

export function advanceRunoffState(state, exposed, dt) {
	const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
	state.age += safeDt;
	if (exposed <= 0.02) {
		state.age = Infinity;
		state.submergedAge += safeDt;
		if (state.submergedAge >= 1) state.armed = true;
	} else {
		state.submergedAge = 0;
		if (state.armed && exposed > 0.08) { state.armed = false; state.age = 0; }
	}
	return state;
}

export function runoffStrength(state, exposed) {
	if (state.age >= 7 - 1e-9) return 0;
	return clamp01(1 - state.age / 7) * clamp01((exposed - 0.08) / 0.42);
}
function sessionIdentity() {
	if (typeof location === 'undefined') return null;
	const params = new URLSearchParams(location.search);
	const room = params.get('room') || params.get('session');
	return room ? `room:${room}` : null;
}

export class KaijuEncounter {
	constructor({ scene, terrain, spray, seed = null, time = null, elapsed = null }) {
		this.scene = scene; this.terrain = terrain; this.spray = spray;
		const shared = sessionIdentity();
		this.seed = seed ?? shared ?? `offline:${Math.random()}`; // chosen once, never per frame
		this.time = time || (() => Date.now() / 1000);
		this.sharedClock = !!shared && elapsed === null;
		this.elapsed = elapsed ?? (this.sharedClock ? this.time() : 0);
		this.model = null; this.pose = kaijuPoseAt(this.elapsed, terrain, this.seed);
		this._step = -1;
		this._runoff = { armed: false, submergedAge: 0, age: Infinity };
		this._emissionAccumulator = 0; this.wake = []; this.pressureWake = [];
		for (let i = 0; i < 5; i++) {
			const material = standard({ name: `Kaiju_foam_wake_${i}`, color: 0xd0e9e9, roughness: 1, emissive: 0x759da3, emissiveIntensity: 0.55, transparent: true, opacity: 0.42 - i * 0.045, depthWrite: false, side: 'double' });
			const ring = new Mesh(new TorusGeometry(1, 0.075, 5, 48), material);
			ring.name = `Kaiju_surface_wake_${i}`; ring.rotation.x = Math.PI / 2; ring.visible = false;
			this.scene.add(ring); this.wake.push(ring);
		}
		for (let i = 0; i < 4; i++) {
			const material = standard({ name: `Kaiju_forward_crest_${i}`, color: 0xe4f5f3, roughness: 1, emissive: 0x8abdc4, emissiveIntensity: 0.7, transparent: true, opacity: 0.72 - i * 0.1, depthWrite: false, side: 'double' });
			const crest = new Mesh(new TorusGeometry(1, 0.055, 5, 48, Math.PI), material);
			crest.name = `Kaiju_forward_water_crest_${i}`; crest.rotation.x = -Math.PI / 2; crest.visible = false;
			this.scene.add(crest); this.pressureWake.push(crest);
		}
	}

	async load() {
		const gltf = await loadGLB(MODEL_URL);
		if (!gltf.skins.length) throw new Error('Steam79 model needs its Blender walk-rig export');
		this.model = await SkinnedModel.create(gltf, { materials: ({ name }) =>
			/^(Eyes|Pupils)$/i.test(name) ? { color: [0.1, 1, 1, 1], roughness: 0.2, metalness: 0, surface: 's.albedo = vec3f(0.1, 1.0, 1.0); s.emissive = vec3f(0.1, 3.5, 5.0);' } : {} });
		const walk = this.model.clipNames().find((n) => /walk/i.test(n));
		if (!walk) throw new Error('Steam79 model is missing its Blender walk clip');
		this.model.play(walk, { loop: true, speed: 0.8 });
		const head = gltf.nodes.findIndex((n) => n.name === 'Head');
		const tail = gltf.nodes.findIndex((n) => n.name === 'Tail');
		this.model.poseModifier = (local) => {
			const t = this.elapsed;
			if (tail >= 0) multiplyYaw(local[tail].r, Math.sin(t * 0.72) * 0.13 + Math.sin(t * 0.31) * 0.045);
			// Raised cosine windows give each glance quiet neutral intervals and eased returns.
			if (head >= 0) { const cycle = (t + 7.3) % 19, window = cycle < 6 ? Math.sin(Math.PI * cycle / 6) ** 2 : 0; multiplyYaw(local[head].r, window * Math.sin(t * 0.47) * 0.24); }
		};
		this.model.group.name = 'Steam79_Godzilla_Encounter';
		this.model.group.position.set(this.pose.x, this.pose.feet, this.pose.z); this.model.group.rotation.y = this.pose.yaw;
		this.scene.add(this.model.group); this.model.update(0); return this;
	}

	update(dt) {
		if (!this.model) return;
		const stepDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
		this.elapsed = this.sharedClock ? this.time() : this.elapsed + stepDt;
		this.pose = kaijuPoseAt(this.elapsed, this.terrain, this.seed);
		const p = this.pose; this.model.group.position.set(p.x, p.feet, p.z); this.model.group.rotation.y = p.yaw;
		this.model.group.rotation.z = Math.sin(this.elapsed * 2.6) * 0.015; this.model.update(stepDt);
		advanceRunoffState(this._runoff, p.exposed, stepDt);
		const cadence = advanceEmissionCadence(this._emissionAccumulator, stepDt);
		this._emissionAccumulator = cadence.accumulator;
		const emissionTicks = cadence.ticks;
		for (let i = 0; i < this.wake.length; i++) {
			const ring = this.wake[i]; ring.visible = p.exposed > 0.06 && p.feet < 0.25 && p.moving; if (!ring.visible) continue;
			const pulse = (this.elapsed * 0.42 + i / this.wake.length) % 1; rotateOffset(p, Math.sin(this.elapsed * 0.8 + i) * 0.5, -2 - i * 2.7, 0.65); ring.position.copy(_p);
			ring.scale.set(5 + pulse * 8, 4 + pulse * 6, 1); ring.material.opacity = (0.56 - i * 0.055) * (1 - pulse * 0.6);
		}
		for (let i = 0; i < this.pressureWake.length; i++) {
			const crest = this.pressureWake[i]; crest.visible = p.exposed > 0.08 && p.feet < 0.5 && p.moving; if (!crest.visible) continue;
			const pulse = (this.elapsed * 0.6 + i / this.pressureWake.length) % 1; rotateOffset(p, 0, 3.6 + i * 2.5, 0.67); crest.position.copy(_p); crest.rotation.z = -p.yaw;
			crest.scale.set(6.5 + i * 2.4 + pulse * 1.8, 3.2 + i * 0.9 + pulse, 1); crest.material.opacity = (0.72 - i * 0.1) * (1 - pulse * 0.35);
		}
		if (p.exposed <= 0 || emissionTicks === 0) return;
		if (p.feet < 0.25 && p.moving) {
			for (const side of [-1, 1]) { rotateOffset(p, side * 4.2, -2.4, 0.25); this.spray.emit(_p, rotateVelocity(p, side * 1.5, 1.2, -1.6), 28 * emissionTicks, 0.11, SPRAY.SPRAY, { jitter: 0.7, spread: 1.2, life: 0.72 }); }
			for (const side of [-1, 0, 1]) { rotateOffset(p, side * 2.6, 5.4, 0.5); const sx = _p.x, sz = _p.z; rotateOffset(p, side * 6.2, 11.5, 0.55); _q.copy(_p); _p.set(sx, 0.5, sz); this.spray.emit(_p, rotateVelocity(p, side * 2.8, 4, 4.8), 82 * emissionTicks, 0.25, SPRAY.SPRAY, { to: _q, jitter: 1, spread: 1.8, life: 1.25 }); }
		}
		const runoff = runoffStrength(this._runoff, p.exposed);
		if (runoff > 0) for (const side of [-1, 1]) for (const [height, spread, behind] of [[.97,1.2,-.6],[.78,2.8,.6],[.56,3.6,1.7]]) {
			rotateOffset(p, side * spread, behind, p.feet + KAIJU_ROUTE.height * height); if (_p.y <= .35) continue;
			const sx = _p.x, sy = _p.y, sz = _p.z; rotateOffset(p, side * (spread + 1.8), behind - 2.5, sy - .6); _q.copy(_p); _p.set(sx, sy, sz);
			this.spray.emit(_p, rotateVelocity(p, side * .8, -2.4, -.6), Math.round((18 * runoff + 8) * emissionTicks), .075, SPRAY.LIGAMENT, { to: _q, jitter: 1.2, spread: 1.8, life: 1.8 });
		}
		const step = Math.floor(this.elapsed * 1.45);
		if (step !== this._step && p.moving && p.feet < .5 && p.exposed > .2) { this._step = step; rotateOffset(p, step % 2 ? 2.2 : -2.2, 5, .25); this.spray.emit(_p, rotateVelocity(p, 0, 4.8, 4.5), 140, .16, SPRAY.SPRAY, { jitter: 1.4, spread: 2.5, life: 1 }); }
	}
}
