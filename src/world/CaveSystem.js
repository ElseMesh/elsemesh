import { Color, Group, Mesh, Vector3 } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { parseGLB } from './debris/GLB.js';

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
		const materials = new Map();
		for (const { name, geometry } of parsed.meshes) {
			const color = caveColor(name);
			if (!materials.has(color)) {
				const mat = standard({ name: 'Cave_' + color.toString(16), color, roughness: 0.93,
					metalness: name.includes('Door') ? 0.55 : 0, side: 'double',
					emissive: color, emissiveIntensity: 0.32 });
				mat.localLightsCheap = true;
				materials.set(color, mat);
			}
			const mesh = new Mesh(geometry, materials.get(color));
			mesh.name = name;
			mesh.frustumCulled = false;
			mesh.receiveShadow = true;
			mesh.castShadow = true;
			mesh.staticVelocity = true;
			cave.group.add(mesh);
		}
		scene.add(cave.group);
		cave.addCollision();
		for (const [x, y, z, range, intensity] of [
			[-337, 6, 80, 19, 8], [-313, 7, 80, 19, 7], [-286, 7, 74, 18, 9],
			[-262, 8, 53, 16, 7], [-245, 7, 45, 20, 10], [-215, 7, 20, 25, 11],
			[-220, 5, -5, 16, 7],
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
	}

	zoneAt(x, z) {
		const l = this.layout;
		const landing = l.landing;
		if (Math.abs(x - landing.center[0]) <= landing.size[0] / 2 &&
			Math.abs(z - landing.center[2]) <= landing.size[2] / 2) {
			return { floor: landing.center[1] };
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
		return segmentAt(this.layout.boatPath, x, z) ? -2.8 : this.terrain.heightAt(x, z);
	}

	addCollision() {
		const l = this.layout;
		const c = this.colliders;
		const landing = l.landing;
		c.addBox(new Vector3(landing.center[0], landing.center[1] - landing.size[1] / 2, landing.center[2]), new Vector3(
			landing.size[0] / 2, landing.size[1] / 2, landing.size[2] / 2
		), 0, { walkable: true, solid: false, tag: 'cave-landing' });
		const d = l.door;
		c.addBox(new Vector3(d.center[0], d.center[2] + d.height / 2, d.center[1]),
			new Vector3(d.width / 2, d.height / 2, 0.55), 0,
			{ tag: 'cave-final-door' });
		for (let i = 0; i < l.boatPath.length - 1; i++) {
			const a = l.boatPath[i], b = l.boatPath[i + 1];
			const mx = (a[0] + b[0]) / 2;
			const w = Math.min(a[4], b[4]) + 0.8;
			for (const side of [-1, 1]) {
				if (side === -1 && i >= 3) continue; // open south side onto the landing
				c.addBox(new Vector3(mx, 3.5, 80 + side * w),
					new Vector3((b[0] - a[0]) / 2 + 0.2, 7, 0.7), 0,
					{ tag: 'cave-boat-wall' });
			}
		}
		c.addBox(new Vector3(-282, 4.3, 80), new Vector3(0.7, 7.2, 11), 0,
			{ tag: 'cave-boat-end' });
	}
}
