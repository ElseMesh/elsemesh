import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { HOUSE } from '../world/boat/Wheelhouse.js';

const cloth = standard({ name: 'Explorer_orange_jacket', color: 0xc86624, roughness: 0.9, emissive: 0x542307, emissiveIntensity: 0.16 });
const vest = standard({ name: 'Explorer_life_vest', color: 0xe8962b, roughness: 0.78, emissive: 0x51300a, emissiveIntensity: 0.2 });
const trousers = standard({ name: 'Explorer_navy_trousers', color: 0x263944, roughness: 0.92 });
const skin = standard({ name: 'Explorer_skin', color: 0xa97450, roughness: 0.86 });
const boots = standard({ name: 'Explorer_boots', color: 0x17242b, roughness: 0.95 });
const detail = standard({ name: 'Explorer_vest_detail', color: 0xf4c05d, roughness: 0.76 });
const dark = standard({ name: 'Explorer_face_detail', color: 0x262124, roughness: 0.9 });
const gloves = standard({ name: 'Explorer_gloves', color: 0x27343b, roughness: 0.95 });

function part(parent, name, geometry, material, x, y, z) {
	const mesh = new Mesh(geometry, material);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	parent.add(mesh);
	return mesh;
}

function limb(parent, name, from, to, radius, material) {
	const direction = new Vector3().subVectors(to, from);
	const mesh = part(parent, name, new CylinderGeometry(radius * 0.86, radius, direction.length(), 9),
		material, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
	mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
	return mesh;
}

// Visible in external views and cinematics; hidden close to the first-person camera.
export class PlayerAvatar {
	constructor(scene, boat) {
		this.scene = scene;
		this.boat = boat;
		this.group = new Group();
		this.group.name = 'Island_explorer_player_character';
		part(this.group, 'Jacket', new SphereGeometry(1, 18, 12), cloth, 0, 1.11, 0)
			.scale.set(0.29, 0.39, 0.2);
		part(this.group, 'Life_vest', new SphereGeometry(1, 18, 12), vest, 0, 1.2, 0.08)
			.scale.set(0.275, 0.29, 0.18);
		part(this.group, 'Vest_back_panel', new BoxGeometry(0.38, 0.38, 0.045), detail, 0, 1.22, -0.105);
		for (const side of [-1, 1]) {
			part(this.group, 'Reflective_vest_strip', new BoxGeometry(0.055, 0.4, 0.035), detail,
				side * 0.19, 1.2, 0.26);
			part(this.group, 'Vest_buckle', new BoxGeometry(0.1, 0.045, 0.042), dark,
				side * 0.12, 1.06, 0.27);
			part(this.group, 'Ear', new SphereGeometry(0.055, 8, 6), skin, side * 0.145, 1.58, 0);
			part(this.group, 'Eye', new SphereGeometry(0.018, 8, 6), dark,
				side * 0.055, 1.6, 0.127);
		}
		part(this.group, 'Jacket_zip', new BoxGeometry(0.018, 0.42, 0.017), dark, 0, 1.2, 0.266);
		part(this.group, 'Nose', new SphereGeometry(0.032, 8, 6), skin, 0, 1.55, 0.15);
		part(this.group, 'Belt', new BoxGeometry(0.49, 0.075, 0.29), dark, 0, 0.77, 0);
		part(this.group, 'Head', new SphereGeometry(0.14, 12, 8), skin, 0, 1.58, 0);
		part(this.group, 'Cap', new SphereGeometry(1, 14, 8), trousers, 0, 1.72, 0.025)
			.scale.set(0.17, 0.08, 0.175);
		part(this.group, 'Cap_brim', new BoxGeometry(0.31, 0.03, 0.16), trousers, 0, 1.68, 0.21);
		this.arms = [];
		this.legs = [];
		this.seated = new Group();
		this.seated.name = 'Seated_helm_pose';
		this.group.add(this.seated);
		const wheel = this.boat.model.wheelPivot.position;
		const gripY = wheel.y - this.boat.model.lines.deckY;
		const gripZ = wheel.z - HOUSE.seatZ - 0.05;
		for (const side of [-1, 1]) {
			const arm = new Group();
			arm.position.set(side * 0.33, 1.37, 0);
			part(arm, 'Sleeve', new CylinderGeometry(0.075, 0.105, 0.5, 10), cloth, 0, -0.26, 0);
			part(arm, 'Hand', new SphereGeometry(0.09, 8, 6), skin, 0, -0.53, 0);
			this.group.add(arm);
			this.arms.push(arm);
			const leg = new Group();
			leg.position.set(side * 0.14, 0.8, 0);
			part(leg, 'Trouser_leg', new CylinderGeometry(0.09, 0.12, 0.65, 10), trousers, 0, -0.34, 0);
			part(leg, 'Boot', new BoxGeometry(0.22, 0.18, 0.31), boots, 0, -0.72, 0.06);
			this.group.add(leg);
			this.legs.push(leg);
			const hip = new Vector3(side * 0.15, 0.7, 0);
			const knee = new Vector3(side * 0.17, 0.62, 0.48);
			const ankle = new Vector3(side * 0.18, 0.06, 0.58);
			limb(this.seated, 'Seated_thigh', hip, knee, 0.11, trousers);
			limb(this.seated, 'Seated_shin', knee, ankle, 0.095, trousers);
			part(this.seated, 'Seated_boot', new BoxGeometry(0.2, 0.14, 0.3), boots,
				ankle.x, ankle.y, ankle.z + 0.09);
			const shoulder = new Vector3(side * 0.31, 1.36, 0);
			const elbow = new Vector3(side * 0.31, 1.14, 0.43);
			const hand = new Vector3(side * 0.17, gripY, gripZ);
			limb(this.seated, 'Sleeve_to_wheel', shoulder, elbow, 0.095, cloth);
			limb(this.seated, 'Forearm_to_wheel', elbow, hand, 0.075, cloth);
			part(this.seated, 'Hand_on_wheel', new SphereGeometry(0.083, 9, 7), gloves,
				hand.x, hand.y, hand.z);
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
		const aboard = c ? (c.mode === 'boat' || c.mode === 'helm') : (player.mode === 'boat' || player.mode === 'deck');
		const atHelm = c ? (c.mode === 'helm' || !!c.seated) : player.mode === 'boat';
		this.seated.visible = atHelm;
		for (const limb of [...this.arms, ...this.legs]) limb.visible = !atHelm;
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
			// Keep the explorer in the open cockpit for exterior views. The wheelhouse
			// hides a seated figure from the camera following behind the boat.
			const p = player.mode === 'deck' ? player.deckPos :
				new Vector3(HOUSE.helmX, this.boat.model.lines.deckY, HOUSE.seatZ);
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
