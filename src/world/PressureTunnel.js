// Agent Control: half-round pressure shells above a solid maglev foundation.
import { BufferGeometry, Float32BufferAttribute, Mesh, InstancedMesh, SphereGeometry, Matrix4, Quaternion, Vector3 } from '../engine/index.js';
const up = new Vector3(0, 1, 0);

export function pressureArch(radius, springY, floorY, length, segments = 24) {
	const profile = [[floorY, -radius]];
	for (let i = 0; i <= segments; i++) {
		const angle = Math.PI * i / segments;
		profile.push([springY + Math.sin(angle) * radius, -Math.cos(angle) * radius]);
	}
	profile.push([floorY, radius]);
	const positions = [], indices = [];
	for (const x of [-length / 2, length / 2]) for (const [y, z] of profile) positions.push(x, y, z);
	const n = profile.length;
	for (let i = 0; i < n - 1; i++) indices.push(i, i + 1, i + n, i + 1, i + n + 1, i + n);
	const g = new BufferGeometry();
	g.setAttribute('position', new Float32BufferAttribute(positions, 3)); g.setIndex(indices);
	g.computeVertexNormals(); g.computeBoundingSphere();
	return g;
}

export function addArch(parent, name, x, radius, springY, floorY, length, material, order = 0) {
	const mesh = new Mesh(pressureArch(radius, springY, floorY, length), material);
	mesh.name = name; mesh.position.set(x, 0, -30); mesh.renderOrder = order;
	mesh.staticVelocity = true; parent.add(mesh); return mesh;
}

export function addGlassEnd(parent, x, material) {
	// Agent Control: a matching arched end pane closes the monocoque above the low sill.
	const positions = [0, -14.5, 0, 0, -15.8, -2.8], indices = [];
	for (let i = 0; i <= 24; i++) {
		const angle = i / 24 * Math.PI;
		positions.push(0, -13.4 + Math.sin(angle) * 2.8, -Math.cos(angle) * 2.8);
	}
	positions.push(0, -15.8, 2.8);
	const count = positions.length / 3;
	for (let i = 1; i < count - 1; i++) indices.push(0, i, i + 1);
	indices.push(0, count - 1, 1);
	const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
	const mesh = new Mesh(geometry, material); mesh.name = 'Car_arched_end_glass';
	mesh.position.set(x, 0, -30); mesh.renderOrder = 1; parent.add(mesh);
}

function fishGeometry() {
	const body = new SphereGeometry(1, 10, 6);
	const p = Array.from(body.attributes.position.array), idx = Array.from(body.index.array);
	for (let i = 0; i < p.length; i += 3) { p[i] *= 0.65; p[i + 1] *= 0.23; p[i + 2] *= 0.13; }
	const tri = (...points) => { const b = p.length / 3; p.push(...points.flat()); idx.push(b, b + 1, b + 2); };
	tri([-0.53, 0, 0], [-1.02, 0.37, 0], [-0.86, 0, 0]);
	tri([-0.53, 0, 0], [-0.86, 0, 0], [-1.02, -0.37, 0]);
	tri([0.25, 0.16, 0], [-0.26, 0.49, 0], [-0.41, 0.13, 0]);
	for (const side of [-1, 1]) tri([0.24, -0.03, side * 0.1], [-0.2, -0.2, side * 0.48], [-0.28, -0.1, side * 0.08]);
	const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(p, 3)); g.setIndex(idx);
	g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}

export class TunnelMarineLife {
	constructor(parent, materials, a, b) {
		this.time = 0; this.a = a; this.b = b; this.batches = [];
		this.matrix = new Matrix4(); this.position = new Vector3(); this.rotation = new Quaternion(); this.scale = new Vector3();
		const geometry = fishGeometry();
		for (let j = 0; j < 4; j++) {
			const mesh = new InstancedMesh(geometry, materials[j], 35);
			mesh.name = 'Swimming_marine_school_' + j; mesh.frustumCulled = false;
			parent.add(mesh); this.batches.push(mesh);
		}
		this.update(0, { x: -650, y: -14 });
	}
	update(dt, camera) {
		this.time += dt;
		const visible = camera.y < 5 && camera.x < this.a + 60 && camera.x > this.b - 60;
		for (let j = 0; j < 4; j++) {
			const mesh = this.batches[j]; mesh.visible = visible;
			if (!visible) continue;
			for (let i = 0; i < 35; i++) {
				const seed = i * 4 + j, direction = j % 2 ? 1 : -1, t = this.time;
				const x = this.b + 30 + ((seed * 43.73 + t * direction * 1.1) % (this.a - this.b - 60) + this.a - this.b - 60) % (this.a - this.b - 60);
				this.position.set(x, -17 + (seed % 9) + Math.sin(t * 0.7 + seed) * 0.35, -30 + direction * (7 + (seed % 5)) + Math.sin(t + seed) * 0.45);
				this.rotation.setFromAxisAngle(up, (direction < 0 ? Math.PI : 0) + Math.sin(t * 3 + seed) * 0.12);
				const s = 0.75 + (seed % 5) * 0.2; this.scale.set(s, s, s);
				this.matrix.compose(this.position, this.rotation, this.scale); mesh.setMatrixAt(i, this.matrix);
			}
			mesh.instanceMatrix.needsUpdate = true;
		}
	}
}
