const STOWED_DEPTH = -2.4;
const MAX_DEPTH = 50;
const MAX_OFFSET = 4;
const CONTROL_STALE_MS = 600;
const POSE_STALE_MS = 5000;

const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function sonarContacts(items, boatPosition, radius = 80, maxDepth = 50) {
	if (!finite3(boatPosition) || !Number.isFinite(radius) || !Number.isFinite(maxDepth)) return [];
	const held = new Set(items.filter(item => item.held).map(item => item.id));
	return items.flatMap(item => {
		if (!item || item.owner !== null || held.has(item.id) || !Number.isFinite(item.x) || !Number.isFinite(item.z) || !Number.isFinite(item.y)) return [];
		const dx = item.x - boatPosition[0], dz = item.z - boatPosition[2], distance = Math.hypot(dx, dz), depth = -item.y;
		if (depth <= 0 || depth > Math.min(MAX_DEPTH, maxDepth) || distance > radius) return [];
		return [{ distance, bearing: Math.atan2(dx, dz), depth, itemId: item.id, type: item.type }];
	}).sort((a, b) => a.distance - b.distance || a.itemId.localeCompare(b.itemId));
}

export class SalvageAuthority {
	constructor(economy) {
		this.economy = economy;
		this.boat = { position: [64.5, 0, 36.5], quaternion: [0, 0, 0, 1], velocity: [0, 0, 0], at: 0, valid: false };
		this.operator = null; this.depth = STOWED_DEPTH; this.offsetX = 0; this.offsetZ = 0;
		this.heldItemId = null; this.returning = false; this.axes = { x: 0, z: 0, depth: 0 };
		this.lastControl = 0; this.lastTick = 0; this.error = null;
	}
	setBoat(state, now = Date.now()) {
		if (!state || !finite3(state.position) || !Array.isArray(state.quaternion) || state.quaternion.length !== 4 || !state.quaternion.every(Number.isFinite) || !finite3(state.velocity)) return false;
		const norm = state.quaternion.reduce((sum, n) => sum + n * n, 0);
		if (Math.abs(norm - 1) > .02) return false;
		this.boat = { position: [...state.position], quaternion: [...state.quaternion], velocity: [...state.velocity], at: now, valid: true };
		return true;
	}
	rotateLocal(x, z) {
		const [, qy, , qw] = this.boat.quaternion;
		const yaw = 2 * Math.atan2(qy, qw), sin = Math.sin(yaw), cos = Math.cos(yaw);
		return [x * cos + z * sin, 0, z * cos - x * sin];
	}
	hook() {
		const local = this.rotateLocal(2.8 + this.offsetX, -2 + this.offsetZ);
		return [this.boat.position[0] + local[0], -this.depth, this.boat.position[2] + local[2]];
	}
	eligible(id, now) {
		const pose = this.economy.positions[id];
		return this.boat.valid && now - this.boat.at >= 0 && now - this.boat.at < POSE_STALE_MS &&
			!!pose && now - pose.at >= 0 && now - pose.at < POSE_STALE_MS && (pose.mode === 'boat' || pose.mode === 'deck') &&
			Math.hypot(pose.x - this.boat.position[0], pose.y - this.boat.position[1], pose.z - this.boat.position[2]) <= 10 &&
			Math.hypot(this.boat.velocity[0], this.boat.velocity[2]) <= .6;
	}
	action(id, input, now = Date.now()) {
		const fail = message => ({ ok: false, message });
		if (!input || typeof input.command !== 'string' || !['claim','control','grab','release','retrieve','stop'].includes(input.command)) return fail('Invalid salvage command.');
		if (input.command === 'claim') {
			if (this.operator && this.operator !== id) return fail('Winch is already in use.');
			if (!this.eligible(id, now)) return fail('Stop the boat and remain close to operate the winch.');
			this.operator = id; this.lastControl = now; this.error = null; return { ok: true, message: 'Winch controls claimed' };
		}
		if (this.operator !== id) return fail('Claim the winch first.');
		if (!this.eligible(id, now)) { this.release(id); return fail('Winch released because the operator or boat moved.'); }
		if (input.command === 'control') {
			const axes = input.axes;
			if (!axes || !['x','z','depth'].every(key => typeof axes[key] === 'number' && Number.isFinite(axes[key]) && axes[key] >= -1 && axes[key] <= 1)) return fail('Invalid winch controls.');
			this.axes = { x: axes.x, z: axes.z, depth: axes.depth }; this.returning = false; this.lastControl = now; return { ok: true, message: 'Winch moving' };
		}
		if (input.command === 'grab') {
			if (this.heldItemId) return fail('Grabber is already holding an item.');
			if (this.economy.owned(id).length >= 12) return fail('Your bag is full (12 items).');
			const hook = this.hook();
			const candidates = this.economy.items.flatMap(candidate => {
				const depth = -candidate.y;
				if (candidate.owner !== null || candidate.held || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) || !Number.isFinite(candidate.z) || depth <= 0 || depth > MAX_DEPTH) return [];
				const distance = Math.hypot(candidate.x-hook[0], candidate.y-hook[1], candidate.z-hook[2]);
				return distance <= .8 ? [{ candidate, distance }] : [];
			}).sort((a, b) => a.distance - b.distance || a.candidate.id.localeCompare(b.candidate.id));
			const item = candidates[0]?.candidate;
			if (!item) return fail('No salvage is within reach of the grabber.');
			item.held = true; this.heldItemId = item.id; this.error = null; return { ok: true, message: 'Salvage secured' };
		}
		if (input.command === 'retrieve') { this.returning = true; this.axes = { x: 0, z: 0, depth: 0 }; this.lastControl = now; return { ok: true, message: 'Retrieving grabber' }; }
		if (input.command === 'release') { this.dropHeld(); return { ok: true, message: 'Salvage released' }; }
		this.release(id); return { ok: true, message: 'Winch released' };
	}
	dropHeld() {
		const item = this.economy.items.find(candidate => candidate.id === this.heldItemId);
		if (item) { const hook = this.hook(); item.x = hook[0]; item.y = hook[1]; item.z = hook[2]; delete item.held; }
		this.heldItemId = null; this.returning = false; this.axes = { x: 0, z: 0, depth: 0 };
	}
	release(id) {
		if (id != null && this.operator !== id) return false;
		this.dropHeld(); this.operator = null; this.lastControl = 0; return true;
	}
	disconnect(id) { return this.release(id); }
	tick(now = Date.now()) {
		if (!this.lastTick) { this.lastTick = now; return false; }
		const dt = clamp((now - this.lastTick) / 1000, 0, .25); this.lastTick = now;
		if (!this.operator) return false;
		if (!this.eligible(this.operator, now)) { this.release(this.operator); return true; }
		if (now - this.lastControl > CONTROL_STALE_MS) this.axes = { x: 0, z: 0, depth: 0 };
		const targetDepth = this.returning ? STOWED_DEPTH : this.depth + this.axes.depth * 2 * dt;
		this.depth = clamp(this.returning ? this.depth - 2 * dt : targetDepth, STOWED_DEPTH, MAX_DEPTH);
		this.offsetX = clamp(this.offsetX + this.axes.x * dt, -MAX_OFFSET, MAX_OFFSET);
		this.offsetZ = clamp(this.offsetZ + this.axes.z * dt, -MAX_OFFSET, MAX_OFFSET);
		const item = this.economy.items.find(candidate => candidate.id === this.heldItemId);
		if (item) { const hook = this.hook(); item.x = hook[0]; item.y = hook[1]; item.z = hook[2]; }
		if (this.returning && this.depth <= STOWED_DEPTH) {
			this.depth = STOWED_DEPTH; this.returning = false; this.offsetX = 0; this.offsetZ = 0;
			if (item && this.economy.owned(this.operator).length < 12) { item.owner = this.operator; delete item.held; this.heldItemId = null; this.error = null; }
			else if (item) this.error = 'Your bag is full (12 items). Make space to recover the held salvage.';
		}
		return true;
	}
	snapshot() {
		return { operator: this.operator, depth: this.depth, offsetX: this.offsetX, offsetZ: this.offsetZ, heldItemId: this.heldItemId, returning: this.returning, hook: this.hook(), boat: { position: [...this.boat.position], quaternion: [...this.boat.quaternion], velocity: [...this.boat.velocity], valid: this.boat.valid }, error: this.error, contacts: sonarContacts(this.economy.items, this.boat.position) };
	}
}
