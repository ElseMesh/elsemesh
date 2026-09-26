import { Mesh, TorusGeometry, Vector3 } from '../engine/index.js';
import { loadGLB } from '../engine/loaders/GLTF.js';
import { SkinnedModel } from '../engine/render/Skinning.js';
import { standard } from '../materials/Materials.js';
import { SPRAY } from '../fx/Spray.js';
import { KAIJU_ROUTE, kaijuPoseAt } from './KaijuRoute.js';

const MODEL_URL = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'models/godzilla/steam79-walk.glb';
const _p = new Vector3();
const _q = new Vector3();
const _v = new Vector3();

// A scripted sighting alongside the starting pier. The downloadable source model is
// normalized and given a walk clip by the Blender asset-preparation step.
export class KaijuEncounter {
	constructor({ scene, terrain, spray }) {
		this.scene = scene;
		this.terrain = terrain;
		this.spray = spray;
		this.elapsed = 0;
		this.model = null;
		this.pose = kaijuPoseAt(0, terrain);
		this._step = -1;
		this.wake = [];
		this.pressureWake = [];
		for (let i = 0; i < 5; i++) {
			const material = standard({ name: `Kaiju_foam_wake_${i}`, color: 0xd0e9e9,
				roughness: 1, emissive: 0x759da3, emissiveIntensity: 0.55,
				transparent: true, opacity: 0.42 - i * 0.045, depthWrite: false, side: 'double' });
			const ring = new Mesh(new TorusGeometry(1, 0.075, 5, 48), material);
			ring.name = `Kaiju_surface_wake_${i}`;
			ring.rotation.x = Math.PI / 2;
			ring.visible = false;
			this.scene.add(ring);
			this.wake.push(ring);
		}
		for (let i = 0; i < 4; i++) {
			const material = standard({ name: `Kaiju_forward_crest_${i}`, color: 0xe4f5f3,
				roughness: 1, emissive: 0x8abdc4, emissiveIntensity: 0.7,
				transparent: true, opacity: 0.72 - i * 0.1, depthWrite: false, side: 'double' });
			const crest = new Mesh(new TorusGeometry(1, 0.055, 5, 48, Math.PI), material);
			crest.name = `Kaiju_forward_water_crest_${i}`;
			crest.rotation.x = -Math.PI / 2;
			crest.visible = false;
			this.scene.add(crest);
			this.pressureWake.push(crest);
		}
	}

	async load() {
		const gltf = await loadGLB(MODEL_URL);
		if (!gltf.skins.length) throw new Error('Steam79 model needs its Blender walk-rig export');
		this.model = await SkinnedModel.create(gltf);
		const walk = this.model.clipNames().find((n) => /walk/i.test(n));
		if (!walk) throw new Error('Steam79 model is missing its Blender walk clip');
		this.model.play(walk, { loop: true, speed: 0.8 });
		this.model.group.name = 'Steam79_Godzilla_Encounter';
		this.model.group.position.set(this.pose.x, this.pose.feet, this.pose.z);
		// The source faces Blender -Y, exported to glTF +Z. Turn it toward the island (-Z).
		this.model.group.rotation.y = Math.PI;
		this.scene.add(this.model.group);
		this.model.update(0);
		return this;
	}

	update(dt) {
		if (!this.model) return;
		this.elapsed = Math.min(KAIJU_ROUTE.duration, this.elapsed + Math.max(0, dt));
		this.pose = kaijuPoseAt(this.elapsed, this.terrain);
		const p = this.pose;
		this.model.group.position.set(p.x, p.feet, p.z);
		this.model.group.rotation.z = Math.sin(this.elapsed * 2.6) * 0.015 * (p.moving ? 1 : 0);
		this.model.update(p.moving ? dt : 0);
		for (let i = 0; i < this.wake.length; i++) {
			const ring = this.wake[i];
			ring.visible = p.exposed > 0.06 && p.feet < 0.25 && p.moving;
			if (!ring.visible) continue;
			const pulse = (this.elapsed * 0.42 + i / this.wake.length) % 1;
			ring.position.set(p.x + Math.sin(this.elapsed * 0.8 + i) * 0.5, 0.65,
				p.z + 2 + i * 2.7);
			ring.scale.set(5 + pulse * 8, 4 + pulse * 6, 1);
			ring.material.opacity = (0.56 - i * 0.055) * (1 - pulse * 0.6);
		}
		for (let i = 0; i < this.pressureWake.length; i++) {
			const crest = this.pressureWake[i];
			crest.visible = p.exposed > 0.08 && p.feet < 0.5 && p.moving;
			if (!crest.visible) continue;
			const pulse = (this.elapsed * 0.6 + i / this.pressureWake.length) % 1;
			crest.position.set(p.x, 0.67, p.z - 3.6 - i * 2.5);
			crest.scale.set(6.5 + i * 2.4 + pulse * 1.8, 3.2 + i * 0.9 + pulse, 1);
			crest.material.opacity = (0.72 - i * 0.1) * (1 - pulse * 0.35);
		}
		if (p.exposed <= 0) return;
		if (p.feet < 0.25 && p.moving) {
			for (const side of [-1, 1]) {
				_p.set(p.x + side * 4.2, 0.25, p.z + 2.4);
				this.spray.emit(_p, _v.set(side * 1.5, 1.2, 1.6), 28, 0.11,
					SPRAY.SPRAY, { jitter: 0.7, spread: 1.2, life: 0.72 });
			}
			// The waterline sits in front of the creature as it walks toward -Z.
			// Spread a broad, low crest ahead instead of only leaving foam behind.
			for (const side of [-1, 0, 1]) {
				_p.set(p.x + side * 2.6, 0.5, p.z - 5.4);
				_q.set(p.x + side * 6.2, 0.55, p.z - 11.5);
				this.spray.emit(_p, _v.set(side * 2.8, 4.0, -4.8), 82, 0.25,
					SPRAY.SPRAY, { to: _q, jitter: 1.0, spread: 1.8, life: 1.25 });
			}
		}

		// Water falling from the head, shoulders and dorsal ridge becomes visible as
		// more of the animal rises. The shared spray system integrates real gravity.
		// The runoff is a short emergence event. Once the head and shoulders have
		// drained, stop emitting new droplets; existing particles finish falling.
		const emergence = Math.max(0, Math.min(1, (p.exposed - 0.12) / 0.5));
		const wetness = Math.max(0, 1 - Math.max(0, p.progress - 0.08) / 0.27) * emergence;
		if (wetness > 0.02) {
		for (const side of [-1, 1]) {
			for (const [height, spread, behind] of [[0.97, 1.2, -0.6], [0.78, 2.8, 0.6], [0.56, 3.6, 1.7]]) {
				_p.set(p.x + side * spread, p.feet + KAIJU_ROUTE.height * height, p.z + behind);
				if (_p.y <= 0.35) continue;
				_q.set(_p.x + side * 1.8, _p.y - 0.6, _p.z + 2.5);
				this.spray.emit(_p, _v.set(side * 0.8, -2.4, 0.6), Math.round(18 * wetness + 8),
					0.075, SPRAY.LIGAMENT, { to: _q, jitter: 1.2, spread: 1.8, life: 1.8 });
			}
		}
		_p.set(p.x, p.feet + KAIJU_ROUTE.height * 0.99, p.z - 0.3);
		if (_p.y > 0.35) this.spray.emit(_p, _v.set(0, -2.7, 0.7),
			Math.round(24 * wetness), 0.065, SPRAY.DROPLET,
			{ jitter: 1.3, spread: 1.3, life: 2 });
		}
		const step = Math.floor(this.elapsed * 1.45);
		if (step !== this._step && p.moving && p.feet < 0.5 && p.exposed > 0.2) {
			this._step = step;
			_p.set(p.x + (step % 2 ? 2.2 : -2.2), 0.25, p.z - 5);
			this.spray.emit(_p, _v.set(0, 4.8, -4.5), 140, 0.16, SPRAY.SPRAY,
				{ jitter: 1.4, spread: 2.5, life: 1.0 });
		}
	}
}
