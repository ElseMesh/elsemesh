import { BoxGeometry, BufferGeometry, Float32BufferAttribute, CylinderGeometry, Euler, Group, Mesh, SphereGeometry, Vector3, Color } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { RAIL, railPosition, secondIslandHeight } from './MonorailRoute.js';

const mat = (name, color, extra = {}) => {
	const m = standard({ name, color, roughness: 0.65, metalness: 0.15, side: 'double', ...extra });
	m.underwaterLighting = 'none';
	m.localLightsCheap = true;
	return m;
};
const rock = mat('Station_basalt', 0x394b55, { emissive: 0x253744, emissiveIntensity: 0.55 });
const metal = mat('Station_dark_metal', 0x394a55, { metalness: 0.55, roughness: 0.31, emissive: 0x243b4b, emissiveIntensity: 0.52 });
const brass = mat('Station_brass', 0xb88e4d, { metalness: 0.65, roughness: 0.28, emissive: 0x6b4d26, emissiveIntensity: 0.36 });
const light = mat('Station_light', 0x72c9e8, { emissive: 0x43a9e4, emissiveIntensity: 2 });
const deepSea = mat('Undersea_view', 0x0b3449, { emissive: 0x0a3c58, emissiveIntensity: 0.6 });
const glass = mat('Pressure_glass', 0x8ce7e9, { transparent: true, opacity: 0.19, depthWrite: false, metalness: 0.15, roughness: 0.08 });
const roofGlass = mat('Pressure_glass_roof', 0x247d9d, { transparent: true, opacity: 0.55, depthWrite: false,
	metalness: 0.08, roughness: 0.12, emissive: 0x155f83, emissiveIntensity: 0.55 });
const floorMat = mat('Island_dark_sand', 0x76694b);
const leaf = mat('Island_green', 0x385f42);
const trunk = mat('Island_wood', 0x544536);
const fishMat = [0x66bfc7, 0xe3ac69, 0x91adc4, 0xbed7c7].map((c, i) => mat('Tunnel_fish_' + i, c, { emissive: c, emissiveIntensity: 0.16 }));

function box(parent, name, x, y, z, w, h, d, material) {
	const mesh = new Mesh(new BoxGeometry(w, h, d), material);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.staticVelocity = true;
	parent.add(mesh);
	return mesh;
}

function cylinder(parent, name, x, y, z, radius, length, material, segments = 12) {
	const mesh = new Mesh(new CylinderGeometry(radius, radius, length, segments, 1, true), material);
	mesh.name = name;
	mesh.position.set(x, y, z);
	mesh.rotation.z = Math.PI / 2;
	mesh.staticVelocity = true;
	parent.add(mesh);
	return mesh;
}

function islandGeometry() {
	const n = 96, rings = 20, positions = [], indices = [];
	for (let j = 0; j <= rings; j++) {
		const r = j / rings;
		for (let i = 0; i <= n; i++) {
			const a = i / n * Math.PI * 2;
			const x = RAIL.island.x + Math.cos(a) * RAIL.island.radius * r;
			const z = RAIL.island.z + Math.sin(a) * RAIL.island.radius * r;
			positions.push(x, secondIslandHeight(x, z), z);
		}
	}
	for (let j = 0; j < rings; j++) for (let i = 0; i < n; i++) {
		const a = j * (n + 1) + i, b = a + n + 1;
		indices.push(a, b, a + 1, b, b + 1, a + 1);
	}
	const geo = new BufferGeometry();
	geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geo.setIndex(indices);
	geo.computeVertexNormals();
	geo.computeBoundingSphere();
	return geo;
}

function rng(i) { const s = Math.sin(i * 127.1 + 78.233) * 43758.5453; return s - Math.floor(s); }

// The cave door is a lift into Station A. The rail car remains in one continuous world
// coordinate system and shuttles to Station B; both portals let the player return.
export class MonorailSystem {
	constructor({ scene, cave, localLights }) {
		this.scene = scene;
		this.cave = cave;
		this.localLights = localLights;
		this.group = new Group();
		this.group.name = 'Undersea_Monorail_And_Second_Island';
		scene.add(this.group);
		this.build();
		this.state = 'station';
		this.station = 'A';
		this.rideFrom = 'A';
		this.elapsed = 0;
		this.mapUnlocked = false;
		this.mapVisible = false;
		this.logFound = false;
		this.signalRestored = false;
		this.checkpoint = 'home';
		try {
			const saved = JSON.parse(localStorage.getItem('burning-horizons.mystery.v1') || 'null');
			if (saved) {
				this.mapUnlocked = !!saved.mapUnlocked;
				this.logFound = !!saved.logFound;
				this.signalRestored = !!saved.signalRestored;
				this.checkpoint = ['home', 'A', 'B', 'island'].includes(saved.checkpoint) ? saved.checkpoint : 'home';
				if (this.checkpoint !== 'home') this.mapUnlocked = true;
				if (this.mapUnlocked) cave.openFinalDoor();
			}
		} catch { /* saving is optional */ }
		this.createMap();
	}

	save() {
		try { localStorage.setItem('burning-horizons.mystery.v1', JSON.stringify({ mapUnlocked: this.mapUnlocked, logFound: this.logFound, signalRestored: this.signalRestored, checkpoint: this.checkpoint })); } catch { /* optional */ }
	}

	restorePlayer(player) {
		if (this.checkpoint === 'A') this.teleport(player, -235, -16, -24, Math.PI / 2);
		if (this.checkpoint === 'B') this.teleport(player, -1118, -16, -24, Math.PI / 2);
		if (this.checkpoint === 'island') this.teleport(player, -1162, secondIslandHeight(-1162, -30), -30, Math.PI / 2);
	}

	build() {
		const g = this.group;
		// The undersea pressure tube has glass spans, structural collars and a lit guideway.
		const a = RAIL.stationA.x, b = RAIL.stationB.x;
		box(g, 'Deep_sea_north_view', (a + b) / 2, -14, -50, a - b + 80, 29, 0.5, deepSea);
		box(g, 'Deep_sea_south_view', (a + b) / 2, -14, -10, a - b + 80, 29, 0.5, deepSea);
		box(g, 'Seabed_outside_tube', (a + b) / 2, -24, -30, a - b + 80, 0.5, 40, rock);
		box(g, 'Rail_guideway', (a + b) / 2, -18.7, -30, a - b, 0.48, 2.0, brass);
		box(g, 'Tinted_glass_tube_roof', (a + b) / 2, -8.52, -30, a - b, 0.12, 10.2, roofGlass);
		for (let x = a - 20; x > b + 20; x -= 40) {
			cylinder(g, 'Pressure_glass_span', x - 20, -13.7, -30, 5.1, 39.6, glass, 16);
			cylinder(g, 'Steel_pressure_collar', x - 40, -13.7, -30, 5.12, 0.42, metal, 16);
			box(g, 'Guideway_light', x - 18, -18.34, -30, 7, 0.08, 0.3, light);
			box(g, 'Ceiling_light', x - 18, -8.43, -30, 5, 0.08, 0.3, light);
		}
		for (const [label, s] of [['A', RAIL.stationA], ['B', RAIL.stationB]]) {
			box(g, `Station_${label}_floor`, s.x + 10, -16.35, -24, 34, 0.7, 18, rock);
			box(g, `Station_${label}_rear_wall`, s.x + 10, -12.1, -15, 34, 8, 0.8, rock);
			box(g, `Station_${label}_roof`, s.x + 10, -7.85, -24, 34, 0.9, 18, rock);
			box(g, `Station_${label}_platform_edge`, s.x + 10, -15.92, -32.5, 34, 0.14, 0.55, brass);
			for (let i = -1; i <= 1; i++) {
				const xx = s.x + 10 + i * 10;
				box(g, `Station_${label}_light`, xx, -8.4, -24, 4.2, 0.15, 0.7, light);
			}
			this.localLights.add({ position: new Vector3(s.x, -11, -25), color: new Color(0.34, 0.77, 1), intensity: 12, range: 27, kind: 'cave' });
		}
		// The car's broad windows leave the passing fish visible on either side.
		this.car = new Group();
		this.car.name = 'Two_way_monorail_car';
		g.add(this.car);
		box(this.car, 'Car_floor', 0, -16.05, -30, 11, 0.5, 5.6, metal);
		box(this.car, 'Car_roof', 0, -11.7, -30, 11, 0.35, 5.6, metal);
		for (const z of [-32.8, -27.2]) {
			box(this.car, 'Car_sill', 0, -14.95, z, 11, 1.3, 0.22, brass);
			for (const x of [-5.2, 0, 5.2]) box(this.car, 'Car_window_post', x, -13.35, z, 0.23, 3.2, 0.25, metal);
		}
		for (const x of [-5.5, 5.5]) box(this.car, 'Car_end', x, -13.9, -30, 0.24, 4, 5.6, glass);
		this.car.position.x = RAIL.stationA.x;
		// Small schools and sea-floor vents provide readable motion at train speed.
		for (let i = 0; i < 140; i++) {
			const x = b + 30 + rng(i * 7) * (a - b - 60);
			const z = -30 + (i % 2 ? 1 : -1) * (7 + rng(i * 11) * 6);
			const y = -17 + rng(i * 13) * 9;
			const fish = new Mesh(new SphereGeometry(0.48 + rng(i * 17) * 0.52, 8, 6), fishMat[i % fishMat.length]);
			fish.name = 'Marine_life_visible_through_glass';
			fish.position.set(x, y, z);
			fish.scale.set(1.7, 0.6, 0.55);
			fish.staticVelocity = true;
			g.add(fish);
		}
		const island = new Mesh(islandGeometry(), floorMat);
		island.name = 'Second_island_walkable_terrain';
		island.staticVelocity = true;
		g.add(island);
		for (let i = 0; i < 38; i++) {
			const theta = rng(i * 3) * Math.PI * 2, r = 33 + rng(i * 5) * 90;
			const x = RAIL.island.x + Math.cos(theta) * r, z = RAIL.island.z + Math.sin(theta) * r;
			const y = secondIslandHeight(x, z);
			box(g, 'Second_island_tree_trunk', x, y + 2.2, z, 0.6, 4.4, 0.6, trunk);
			const crown = new Mesh(new SphereGeometry(2.4 + rng(i * 9), 8, 6), leaf);
			crown.name = 'Second_island_tree_crown';
			crown.position.set(x, y + 5.1, z);
			crown.staticVelocity = true;
			g.add(crown);
		}
		const sx = -1150, sz = -30, sy = secondIslandHeight(sx, sz);
		box(g, 'Second_island_station_entrance', sx, sy + 2.6, sz, 12, 5.2, 9, metal);
		box(g, 'Second_island_station_bands', sx, sy + 4.8, sz, 12.4, 0.22, 9.4, brass);
		box(g, 'Second_island_station_door', sx - 5.92, sy + 1.6, sz, 0.15, 3.2, 3.1, light);
		const bx = -1210, bz = -62, by = secondIslandHeight(bx, bz);
		box(g, 'Mystery_signal_bunker', bx, by + 1.8, bz, 8, 3.6, 7, rock);
		box(g, 'Mystery_signal_mast', bx, by + 9, bz, 0.42, 15, 0.42, brass);
		box(g, 'Mystery_signal_lamp', bx, by + 17, bz, 1.5, 1.2, 1.5, light);
	}

	createMap() {
		if (typeof document === 'undefined') return;
		const el = document.createElement('div');
		el.setAttribute('role', 'dialog');
		el.setAttribute('aria-label', 'Two-island world map');
		el.style.cssText = 'position:fixed;inset:12% 18%;z-index:1000;display:none;background:rgba(7,22,30,.94);border:1px solid #5eb9c9;border-radius:16px;color:#e2f5f5;font:18px system-ui;padding:24px;box-shadow:0 12px 50px #000b;pointer-events:none';
		el.innerHTML = '<div style="font-size:26px;letter-spacing:.12em">ARCHIPELAGO</div><div style="font-size:14px;color:#9dd9df">N to close · Sea route and hidden rail</div><svg viewBox="0 0 800 360" style="width:100%;height:75%" aria-label="First island, undersea rail, second island"><path d="M90 180 Q200 80 310 180 Q210 290 90 180Z" fill="#788763" stroke="#9ed1c8" stroke-width="3"/><path d="M520 180 Q630 70 730 180 Q640 290 520 180Z" fill="#788763" stroke="#9ed1c8" stroke-width="3"/><path d="M286 195 L545 195" stroke="#71deea" stroke-width="7" stroke-dasharray="14 9"/><text x="122" y="183" fill="white" font-size="24">HOME ISLAND</text><text x="547" y="183" fill="white" font-size="24">SECOND ISLAND</text><text x="306" y="165" fill="#9deaf2" font-size="20">UNDERSEA MONORAIL ⇄</text><text x="175" y="280" fill="#b8e1e4" font-size="17">CAVE / STATION A</text><text x="585" y="280" fill="#b8e1e4" font-size="17">STATION B</text></svg>';
		document.body.appendChild(el);
		this.mapEl = el;
	}

	isDryAt(x, z, y = -16) {
		if (y > -3) return false;
		if (z < -35 || z > -15) return false;
		return (x <= -221 && x >= -274) || (x <= -1108 && x >= -1152) || (x < -255 && x > -1135 && z >= -35 && z <= -25);
	}

	floorAt(x, z, maxY = -16) {
		if (this.isDryAt(x, z, maxY)) return -16;
		const h = secondIslandHeight(x, z);
		return h > -29 ? h : null;
	}

	teleport(player, x, y, z, yaw) {
		player.position.set(x, y, z);
		player.velocity.set(0, 0, 0);
		player.mode = 'walk';
		player.grounded = true;
		player.yaw = yaw;
		player.pitch = 0;
		player.waterH = player.waterMean = -100;
		player.camOff = player.camOffV = 0;
	}

	update(dt, player, input, camera, toast) {
		if (input.hit('KeyN') && this.mapUnlocked) {
			this.mapVisible = !this.mapVisible;
			if (this.mapEl) this.mapEl.style.display = this.mapVisible ? 'block' : 'none';
		}
		if (this.state === 'riding') {
			this.elapsed = Math.min(RAIL.duration, this.elapsed + dt);
			const p = railPosition(this.rideFrom, this.elapsed / RAIL.duration);
			this.car.position.x = p.x;
			player.position.set(p.x, -16, -30);
			camera.position.set(p.x, -14.45, -30);
			const look = input.consumeLook(dt);
			player.yaw -= look.x * 0.0022;
			player.pitch = Math.max(-1.3, Math.min(1.3, player.pitch - look.y * 0.0022));
			camera.quaternion.setFromEuler(new Euler(player.pitch, player.yaw, 0));
			player.prompt = { key: '', text: `Undersea monorail · ${Math.round(this.elapsed / RAIL.duration * 100)}%` };
			if (this.elapsed >= RAIL.duration) {
				this.station = this.rideFrom === 'A' ? 'B' : 'A';
				this.state = 'station';
				this.checkpoint = this.station;
				this.save();
				const end = RAIL[this.station === 'A' ? 'stationA' : 'stationB'];
				this.teleport(player, this.station === 'A' ? -235 : -1121, -16, -24, this.station === 'A' ? Math.PI / 2 : -Math.PI / 2);
				toast(`Arrived at Station ${this.station}`);
			}
			return;
		}
		const p = player.position;
		const near = (x, y, z, radius = 5) => Math.hypot(p.x - x, p.y - y, p.z - z) < radius;
		let action = null, label = '';
		if (near(-220, 1.2, -8, 7) && this.cave.doorState === 'locked') { action = 'cave-door'; label = 'Use electronic station entry'; }
		else if (near(-216, 1.2, -29, 7) && this.cave.doorState === 'open') { action = 'cave-to-A'; label = 'Board the waiting monorail'; }
		else if (near(-235, -16, -24, 7)) { action = 'A-to-cave'; label = 'Return to cave'; }
		else if (near(RAIL.stationA.x + 2, -16, -24, 8)) { action = 'board-A'; label = 'Board monorail to second island'; }
		else if (near(-1118, -16, -24, 8)) { action = 'B-to-island'; label = 'Take lift to second island'; }
		else if (near(-1138, -16, -19, 5) && !this.logFound) { action = 'read-log'; label = 'Read missing expedition log'; }
		else if (near(RAIL.stationB.x - 2, -16, -24, 8)) { action = 'board-B'; label = 'Board monorail to home island'; }
		else if (near(-1160, secondIslandHeight(-1160, -30), -30, 11)) { action = 'island-to-B'; label = 'Enter Station B'; }
		else if (near(-1210, secondIslandHeight(-1210, -62), -62, 12) && !this.signalRestored) { action = 'signal'; label = this.logFound ? 'Restore the island signal' : 'Inspect the silent transmitter'; }
		if (!action) return;
		player.prompt = { key: 'E', text: label };
		if (!input.hit('KeyE')) return;
		switch (action) {
			case 'cave-door':
				this.cave.activateFinalDoor();
				this.mapUnlocked = true;
				this.save();
				toast('Access accepted · station door lifting');
				break;
			case 'cave-to-A':
				this.mapUnlocked = true;
				this.checkpoint = 'A';
				this.save();
				this.teleport(player, -235, -16, -24, Math.PI / 2);
				toast('Station A discovered · N opens world map');
				break;
			case 'A-to-cave': this.checkpoint = 'home'; this.save(); this.teleport(player, -216, 1.2, -27, 0); break;
			case 'B-to-island': this.checkpoint = 'island'; this.save(); this.teleport(player, -1162, secondIslandHeight(-1162, -30), -30, Math.PI / 2); break;
			case 'island-to-B': this.checkpoint = 'B'; this.save(); this.teleport(player, -1118, -16, -24, Math.PI / 2); break;
			case 'read-log':
				this.logFound = true;
				this.save();
				toast('Expedition log: the island beacon was shut down before the crew vanished. Find the mast.');
				break;
			case 'signal':
				if (!this.logFound) toast('The controls are locked. The station log may hold the code.');
				else {
					this.signalRestored = true;
					this.save();
					toast('Signal restored. The missing expedition answered from beyond the horizon. Mystery continues…');
				}
				break;
			case 'board-A': case 'board-B':
				this.rideFrom = action === 'board-A' ? 'A' : 'B';
				this.station = this.rideFrom;
				this.elapsed = 0;
				this.state = 'riding';
				this.checkpoint = this.rideFrom;
				this.save();
				player.yaw = this.rideFrom === 'A' ? Math.PI / 2 : -Math.PI / 2;
				player.pitch = 0;
				toast(`Monorail departing Station ${this.rideFrom}`);
				break;
		}
	}
}
