import { BoxGeometry, Group, Mesh, SphereGeometry, Vector3 } from '../engine/index.js';
import { standard } from '../materials/Materials.js';

const dark = standard({ name: 'Survival_pistol_dark_steel', color: 0x20272b, metalness: 0.7, roughness: 0.34 });
const grip = standard({ name: 'Survival_pistol_grip', color: 0x494138, roughness: 0.88 });
const flashMat = standard({ name: 'Muzzle_flash', color: 0xffd46b, emissive: 0xffb431, emissiveIntensity: 4 });

function part(group, name, w, h, d, x, y, z, material) {
	const mesh = new Mesh(new BoxGeometry(w, h, d), material);
	mesh.name = name;
	mesh.position.set(x, y, z);
	group.add(mesh);
}

// A compact survival sidearm. Ammunition is finite; the encounter currently has
// no damage model, so shots serve as a light-and-sound signal in the mystery world.
export class SurvivalPistol {
	constructor(scene) {
		this.scene = scene;
		this.group = new Group();
		this.group.name = 'Survival_pistol';
		part(this.group, 'Slide', 0.12, 0.08, 0.34, 0.45, -0.33, -0.78, dark);
		part(this.group, 'Barrel', 0.075, 0.075, 0.22, 0.45, -0.34, -1.01, dark);
		part(this.group, 'Grip', 0.12, 0.28, 0.13, 0.45, -0.51, -0.66, grip);
		this.flash = new Mesh(new SphereGeometry(0.12, 8, 6), flashMat);
		this.flash.name = 'Muzzle_flash';
		this.flash.position.set(0.45, -0.34, -1.16);
		this.flash.visible = false;
		this.group.add(this.flash);
		this.group.visible = false;
		scene.add(this.group);
		this.equipped = false;
		this.ammo = 8;
		this.reserve = 32;
		this.cooldown = 0;
		this.flashTime = 0;
		this.wasDown = false;
	}

	update(dt, camera, input, enabled, toast) {
		if (input.hit('KeyG') && enabled) {
			this.equipped = !this.equipped;
			this.group.visible = this.equipped;
			toast(this.equipped ? `Sidearm ready · ${this.ammo}/${this.reserve} · X reload` : 'Sidearm holstered');
		}
		this.cooldown = Math.max(0, this.cooldown - dt);
		this.flashTime = Math.max(0, this.flashTime - dt);
		this.flash.visible = this.flashTime > 0;
		this.group.position.copy(camera.position);
		this.group.quaternion.copy(camera.quaternion);
		if (!this.equipped || !enabled) { this.wasDown = input.mouseDown; return; }
		if (input.hit('KeyX') && this.ammo < 8 && this.reserve > 0) {
			const count = Math.min(8 - this.ammo, this.reserve);
			this.ammo += count;
			this.reserve -= count;
			toast(`Reloaded · ${this.ammo}/${this.reserve}`);
		}
		const fired = input.mouseDown && !this.wasDown;
		this.wasDown = input.mouseDown;
		if (!fired || this.cooldown > 0) return;
		if (this.ammo === 0) { toast('Empty · X reload'); return; }
		this.ammo--;
		this.cooldown = 0.24;
		this.flashTime = 0.085;
		const aim = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
		const impact = camera.position.clone().addScaledVector(aim, 150);
		this.lastShot = { origin: camera.position.clone(), direction: aim, impact, time: performance.now() };
		toast(`Shot fired · ${this.ammo}/${this.reserve}`);
	}
}
