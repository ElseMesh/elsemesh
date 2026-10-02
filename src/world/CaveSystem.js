import { Color, Group, Mesh, Vector3 } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { parseGLB } from './debris/GLB.js';
import { loadCaveStone, isCaveRock } from './CaveStone.js';

const BASE = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'models/world/';
const sq = (x) => x * x;

function segmentAt(points, x, z) {
	let best = null;
	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i], b = points[i + 1];
		const dx = b[0] - a[0], dz = b[1] - a[1];
		const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
		const px = a[0] + dx * t, pz = a[1] + dz * t;
		const width = a[4] * (1 - t) + b[4] * t;
		const dist = Math.hypot(x - px, z - pz);
		if (dist <= width - 0.35 && (!best || dist / width < best.score)) {
			best = { floor: a[2] * (1 - t) + b[2] * t, score: dist / width };
		}
	}
	return best;
}

function caveColor(name) {
	if (name.includes('Glow_Mineral')) return 0x7fcbd1;
	if (name.includes('Keypad_Light') || name.includes('Keypad_Screen')) return 0x49d8e9;
	if (name.includes('Waiting_Train_Headlight') || name.includes('Waiting_Train_Route_Display') ||
		name.includes('Station_Ceiling_Light') || name.includes('Station_Wall_Light') ||
		name.includes('Station_Destination_Glow')) return 0xbce5d9;
	if (name.includes('Waiting_Train_Windshield') || name.includes('Waiting_Train_Side_Window')) return 0x102c3b;
	if (name.includes('Waiting_Train_Door') || name.includes('Station_Preview_Safety_Stripe')) return 0xd89a35;
	if (name.includes('Waiting_Train_Belt') || name.includes('Waiting_Train_Nose_Band')) return 0x447789;
	if (name.includes('Waiting_Train_Body')) return 0x547581;
	if (name.includes('Waiting_Train_Nose_Front')) return 0x49636c;
	if (name.includes('Waiting_Train')) return 0x344b54;
	if (name.includes('Station_Wall_Panel') || name.includes('Station_Wall_Rib')) return 0x1f3339;
	if (name.includes('Station_Wall_Trim')) return 0x789596;
	if (name.includes('Station_Track_Rail')) return 0x789392;
	if (name.includes('Station_Track_Tie')) return 0x293337;
	if (name.includes('Station_Preview_Platform_Edge')) return 0xc1afa0;
	if (name.includes('Salt') || name.includes('Hall')) return 0x77776c;
	if (name.includes('Door_Brass') || name.includes('Band') || name.includes('Jamb') || name.includes('Lintel')) return 0x8f6430;
	if (name.includes('Closed_Door')) return 0x292e32;
	if (name.includes('Landing')) return 0x55504a;
	if (name.includes('Boat') || name.includes('Entrance_Rock')) return 0x303c42;
	return 0x3a4244;
}

// Geometry is authored in Blender and exported as a GLB. This class only supplies
// browser rendering, a small terrain opening, and gameplay collision/ground rules.
export class CaveSystem {

	static async load({ scene, terrain, colliders, localLights }) {
		const [assetRes, layoutRes] = await Promise.all([
			fetch(BASE + 'caves.glb'), fetch(BASE + 'caves.json'),
		]);
		if (!assetRes.ok || !layoutRes.ok) throw new Error('UNDERNEATH cave assets are missing');
		const [asset, layout] = await Promise.all([assetRes.arrayBuffer(), layoutRes.json()]);
		const cave = new CaveSystem(layout, terrain, colliders);
		const parsed = parseGLB(asset);
		if (!parsed.meshes.some((m) => m.name === 'UN_Boat_Cavern') ||
			!parsed.meshes.some((m) => m.name === 'UN_Closed_Door')) {
			throw new Error('UNDERNEATH GLB has no boat cavern or final door');
		}
		cave.group = new Group();
		cave.group.name = 'UNDERNEATH';
		cave.doorMeshes = [];
		cave.keypadLights = [];
		const materials = new Map();
		const stone = await loadCaveStone();
		for (const { name, geometry } of parsed.meshes) {
			const color = caveColor(name);
			if (!materials.has(color)) {
				const mat = standard({ name: 'Cave_' + color.toString(16), color, roughness: 0.93,
					metalness: name.includes('Door') ? 0.55 : 0, side: 'double',
					emissive: color, emissiveIntensity: name.includes('Glow_Mineral') ? 1.5 :
						name.includes('Headlight') || name.includes('Station_Ceiling_Light') ||
						name.includes('Station_Wall_Light') ? 1.2 :
						name.includes('Waiting_Train') || name.includes('Station_Wall_Panel') ? 0.08 : 0.32 });
				mat.localLightsCheap = true;
				materials.set(color, mat);
			}
			const mesh = new Mesh(geometry, isCaveRock(name) ? stone : materials.get(color));
			mesh.name = name;
			// Agent Control: baked world geometry still needs bounds for view and shadow culling.
			geometry.computeBoundingSphere();
			mesh.frustumCulled = true;
			mesh.receiveShadow = true;
			mesh.castShadow = true;
			mesh.staticVelocity = true;
			cave.group.add(mesh);
			if (name === 'UN_Closed_Door' || name.startsWith('UN_Door_Band')) cave.doorMeshes.push(mesh);
			if (name.startsWith('UN_Keypad_Light')) cave.keypadLights.push(mesh);
		}
		scene.add(cave.group);
		cave.addCollision();
		for (const [x, y, z, range, intensity] of [
			[-337, 6, 80, 19, 8], [-313, 7, 80, 19, 7], [-286, 7, 74, 18, 9],
			[-262, 8, 53, 16, 7], [-245, 7, 45, 20, 10], [-215, 7, 20, 25, 11],
			[-220, 5, -5, 16, 7],
			[-220, 6, -30, 20, 10],
		]) {
			localLights.add({ position: new Vector3(x, y, z), color: new Color(0.72, 0.83, 1),
				intensity, range, kind: 'cave', flicker: 0.015 });
		}
		return cave;
	}

	constructor(layout, terrain, colliders) {
		this.layout = layout;
		this.terrain = terrain;
		this.colliders = colliders;
		this.paths = [layout.boatPath, ...layout.passages.map((p) => p.points)];
		this.paths.push([[-220, -10, 1.2, 9.2, 5], [-220, -28, 1.2, 9.2, 6], [-220, -47, 1.2, 9.2, 5.5]]);
		this.doorState = 'locked';
		this.doorElapsed = 0;
	}

	zoneAt(x, z) {
		const l = this.layout;
		const landing = l.landing;
		if (Math.abs(x - landing.center[0]) <= landing.size[0] / 2 &&
			Math.abs(z - landing.center[2]) <= landing.size[2] / 2) {
			return { floor: landing.center[1] };
		}
		const ramp = l.wadingRamp;
		const shelf = l.wadingShelf;
		if (shelf && x >= shelf.xMin && x <= shelf.xMax &&
			z >= shelf.zMin && z <= shelf.zMax) return { floor: shelf.floor };
		if (ramp && x >= ramp.xMin && x <= ramp.xMax &&
			z >= ramp.landingEdgeZ && z <= ramp.waterEdgeZ) {
			const u = (ramp.waterEdgeZ - z) / (ramp.waterEdgeZ - ramp.landingEdgeZ);
			return { floor: ramp.waterFloor + (ramp.landingFloor - ramp.waterFloor) * u };
		}
		for (const room of [l.junction, l.chamber]) {
			if (sq(x - room.center[0]) + sq(z - room.center[1]) < sq(room.radius - 0.5)) {
				return { floor: room.center[2] };
			}
		}
		let best = null;
		for (const path of this.paths) {
			const hit = segmentAt(path, x, z);
			if (hit && (!best || hit.score < best.score)) best = hit;
		}
		return best;
	}

	groundHeightAt(x, z, maxY) {
		const zone = this.zoneAt(x, z);
		if (!zone || maxY >= this.terrain.heightAt(x, z) - 1.5) return null;
		return zone.floor;
	}

	constrainPlayer(old, pos) {
		// The centreline footprint is a conservative collision proxy for the cave
		// walls. The sea-facing opening remains open for swimming/return travel.
		if (!this.zoneAt(old.x, old.z) || this.zoneAt(pos.x, pos.z)) return;
		if (this.terrain.heightAt(pos.x, pos.z) <= 0.5) return;
		if (pos.y < this.terrain.heightAt(pos.x, pos.z) - 1.5) {
			pos.x = old.x;
			pos.z = old.z;
		}
	}

	boatGroundAt(x, z) {
		const hit = segmentAt(this.layout.boatPath, x, z);
		return hit ? hit.floor : this.terrain.heightAt(x, z);
	}

	addCollision() {
		const l = this.layout;
		const c = this.colliders;
		const landing = l.landing;
		c.addBox(new Vector3(landing.center[0], landing.center[1] - landing.size[1] / 2, landing.center[2]), new Vector3(
			landing.size[0] / 2, landing.size[1] / 2, landing.size[2] / 2
		), 0, { walkable: true, solid: false, tag: 'cave-landing' });
		const d = l.door;
		this.finalDoorCollider = c.addBox(new Vector3(d.center[0], d.center[2] + d.height / 2, d.center[1]),
			new Vector3(d.width / 2, d.height / 2, 0.55), 0,
			{ tag: 'cave-final-door' });
		for (let i = 0; i < l.boatPath.length - 1; i++) {
			const a = l.boatPath[i], b = l.boatPath[i + 1];
			const mx = (a[0] + b[0]) / 2;
			const w = Math.min(a[4], b[4]) + 0.8;
			for (const side of [-1, 1]) {
				if (side === -1 && i >= 2) continue; // open south side onto the landing
				c.addBox(new Vector3(mx, 3.5, 80 + side * w),
					new Vector3((b[0] - a[0]) / 2 + 0.2, 7, 0.7), 0,
					{ tag: 'cave-boat-wall' });
			}
		}
		c.addBox(new Vector3(-282, 4.3, 80), new Vector3(0.7, 7.2, 11), 0,
			{ tag: 'cave-boat-end' });
	}

	openFinalDoor() {
		this.doorState = 'open';
		this.doorElapsed = 3.4;
		for (const mesh of this.doorMeshes || []) mesh.position.y = this.layout.door.height + 0.4;
		if (this.finalDoorCollider) this.finalDoorCollider.solid = false;
	}

	activateFinalDoor() {
		if (this.doorState !== 'locked') return false;
		this.doorState = 'scanning';
		this.doorElapsed = 0;
		return true;
	}

	update(dt) {
		if (this.doorState === 'locked' || this.doorState === 'open') return;
		this.doorElapsed += dt;
		const t = this.doorElapsed;
		for (let i = 0; i < (this.keypadLights || []).length; i++) {
			this.keypadLights[i].visible = t >= 1.2 || (Math.floor(t * 7) % 3 === i);
		}
		if (t < 1.2) return;
		this.doorState = 'opening';
		const u = Math.min(1, (t - 1.2) / 2.2);
		const lift = (u * u * (3 - 2 * u)) * (this.layout.door.height + 0.4);
		for (const mesh of this.doorMeshes || []) mesh.position.y = lift;
		if (u >= 0.85 && this.finalDoorCollider) this.finalDoorCollider.solid = false;
		if (u >= 1) this.doorState = 'open';
	}
}
