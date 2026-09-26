import { Vector3 } from '../engine/index.js';
import { loadGLB } from '../engine/loaders/GLTF.js';
import { SkinnedModel } from '../engine/render/Skinning.js';
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
		if (p.exposed <= 0) return;

		// Water falling from the head, shoulders and dorsal ridge becomes visible as
		// more of the animal rises. The shared spray system integrates real gravity.
		const drip = Math.min(1, p.exposed * 2);
		for (const side of [-1, 1]) {
			_p.set(p.x + side * 2.8, p.feet + KAIJU_ROUTE.height * 0.76, p.z + 0.5);
			_q.set(p.x + side * 2.2, p.feet + KAIJU_ROUTE.height * 0.95, p.z - 1.5);
			if (_p.y > 0.3) this.spray.emit(_p, _v.set(0, -1.4, 0), Math.round(7 + drip * 8), 0.035, SPRAY.DROPLET,
				{ to: _q, jitter: 0.75, spread: 0.7, life: 1.5 });
		}
		const step = Math.floor(this.elapsed * 1.45);
		if (step !== this._step && p.moving && p.feet < 0.5 && p.exposed > 0.2) {
			this._step = step;
			_p.set(p.x + (step % 2 ? 2.2 : -2.2), 0.1, p.z - 2);
			this.spray.emit(_p, _v.set(0, 3, -0.5), 40, 0.09, SPRAY.SPRAY,
				{ jitter: 1.2, spread: 2, life: 0.8 });
		}
	}
}
