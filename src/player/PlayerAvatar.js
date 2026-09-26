import { BoxGeometry, Group, Mesh, SphereGeometry, Vector3 } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { HOUSE } from '../world/boat/Wheelhouse.js';

const cloth = standard({ name: 'Explorer_orange_jacket', color: 0xc86624, roughness: 0.9, emissive: 0x542307, emissiveIntensity: 0.16 });
const vest = standard({ name: 'Explorer_life_vest', color: 0xe8962b, roughness: 0.78, emissive: 0x51300a, emissiveIntensity: 0.2 });
const trousers = standard({ name: 'Explorer_navy_trousers', color: 0x263944, roughness: 0.92 });
const skin = standard({ name: 'Explorer_skin', color: 0xa97450, roughness: 0.86 });
const boots = standard({ name: 'Explorer_boots', color: 0x17242b, roughness: 0.95 });

function part(parent, name, geometry, material, x, y, z) {
	const mesh = new Mesh(geometry, material);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	parent.add(mesh);
	return mesh;
}

// Visible in external views and cinematics; hidden close to the first-person camera.
export class PlayerAvatar {
	constructor(scene, boat) {
		this.scene = scene;
		this.boat = boat;
		this.group = new Group();
		this.group.name = 'Island_explorer_player_character';
		part(this.group, 'Jacket', new BoxGeometry(0.49, 0.68, 0.28), cloth, 0, 1.11, 0);
		part(this.group, 'Life_vest', new BoxGeometry(0.51, 0.47, 0.31), vest, 0, 1.2, 0.08);
		part(this.group, 'Head', new SphereGeometry(0.14, 12, 8), skin, 0, 1.58, 0);
		part(this.group, 'Cap', new BoxGeometry(0.31, 0.1, 0.33), trousers, 0, 1.72, 0.025);
		part(this.group, 'Cap_brim', new BoxGeometry(0.31, 0.03, 0.16), trousers, 0, 1.68, 0.21);
		this.arms = [];
		this.legs = [];
		for (const side of [-1, 1]) {
			const arm = new Group();
			arm.position.set(side * 0.33, 1.37, 0);
			part(arm, 'Sleeve', new BoxGeometry(0.19, 0.5, 0.21), cloth, 0, -0.26, 0);
			part(arm, 'Hand', new SphereGeometry(0.09, 8, 6), skin, 0, -0.53, 0);
			this.group.add(arm);
			this.arms.push(arm);
			const leg = new Group();
			leg.position.set(side * 0.14, 0.8, 0);
			part(leg, 'Trouser_leg', new BoxGeometry(0.2, 0.65, 0.24), trousers, 0, -0.34, 0);
			part(leg, 'Boot', new BoxGeometry(0.22, 0.18, 0.31), boots, 0, -0.72, 0.06);
			this.group.add(leg);
			this.legs.push(leg);
		}
		this.cinematic = null;
		this.clock = 0;
		this._parent = null;
		this._place(scene);
	}

	_place(parent) {
		if (this._parent === parent) return;
		this._parent?.remove(this.group);
		parent.add(this.group);
		this._parent = parent;
	}

	update(dt, player, camera, freeCam) {
		const c = this.cinematic;
		const aboard = c ? c.mode === 'boat' : (player.mode === 'boat' || player.mode === 'deck');
		this._place(aboard ? this.boat.model.group : this.scene);
		let moving = false;
		if (c) {
			if (aboard) {
				this.group.position.set(c.x, c.y ?? this.boat.model.lines.deckY, c.z);
				this.group.rotation.y = c.yaw ?? 0;
			} else {
				this.group.position.set(c.x, c.y, c.z);
				this.group.rotation.y = c.yaw ?? 0;
			}
			moving = !!c.walk;
		} else if (aboard) {
			const p = player.mode === 'deck' ? player.deckPos : new Vector3(HOUSE.helmX, this.boat.model.lines.deckY, HOUSE.seatZ);
			this.group.position.copy(p);
			this.group.rotation.y = player.mode === 'deck' ? player.deckYaw : 0;
			moving = player.mode === 'deck' && player.deckVel.lengthSq() > 0.04;
		} else {
			this.group.position.copy(player.position);
			this.group.rotation.y = player.yaw + Math.PI;
			moving = player.mode === 'walk' && player.velocity.lengthSq() > 0.12;
		}
		this.clock += dt * (moving ? 8 : 2);
		const gait = moving ? Math.sin(this.clock) * 0.5 : 0;
		this.legs[0].rotation.x = gait;
		this.legs[1].rotation.x = -gait;
		this.arms[0].rotation.x = -gait * 0.7;
		this.arms[1].rotation.x = gait * 0.7;
		const close = !freeCam && camera.position.distanceTo(this.group.getWorldPosition(new Vector3())) < 1.1;
		this.group.visible = !close;
	}
}
