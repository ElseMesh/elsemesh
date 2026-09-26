import { validateHelicopter } from './HelicopterLease.js';
export const WORLD_ID = 'bh:burning-horizons';
export const SECTOR_ID = 'bh:ISLAND-01';
export const ONLINE_ROLES = Object.freeze(['loz', 'ed', ...Array.from({ length: 8 }, (_, i) => `guest${i + 2}`)]);
export const PLAYER_IDS = Object.freeze(Object.fromEntries(ONLINE_ROLES.map((role) => [role, `player:${role}`])));
export const MAX_ROOM_PLAYERS = ONLINE_ROLES.length;
export const roleLabel = (role) => role === 'loz' ? 'Loz' : role === 'ed' ? 'Player 2' : `Player ${Number(role.slice(5)) + 1}`;
export const PLAYER_PROTOCOL = 'bh.player-state/1';

export function makeState({ playerId, nodeId, sequence, player, boat = null, observedRemoteSequence = -1 }) {
	const state = {
		protocol: PLAYER_PROTOCOL, worldId: WORLD_ID, sectorId: SECTOR_ID,
		playerId, nodeId, sequence, observedRemoteSequence,
		position: [ player.position.x, player.position.y, player.position.z ],
		yaw: player.yaw, moving: player.velocity.lengthSq() > 0.12,
		mode: player.mode, timestamp: Date.now(),
	};
	if (player.mode === 'deck') state.deckLocal = [player.deckPos.x, player.deckPos.y, player.deckPos.z];
	if (boat && playerId === PLAYER_IDS.loz) state.boat = {
		position: [boat.position.x, boat.position.y, boat.position.z],
		quaternion: [boat.quaternion.x, boat.quaternion.y, boat.quaternion.z, boat.quaternion.w],
		velocity: [boat.velocity.x, boat.velocity.y, boat.velocity.z],
		driven: boat.driven,
	};
	return state;
}

export function validateState(state) {
	if (!state || state.protocol !== PLAYER_PROTOCOL || state.worldId !== WORLD_ID || state.sectorId !== SECTOR_ID) throw new Error('Incompatible world or sector');
	if (!Object.values(PLAYER_IDS).includes(state.playerId) || !/^bh-node:[0-9a-f]{64}$/.test(state.nodeId)) throw new Error('Invalid player or node identity');
	if (!Number.isSafeInteger(state.sequence) || state.sequence < 0 || !Number.isSafeInteger(state.observedRemoteSequence) || state.observedRemoteSequence < -1) throw new Error('Invalid sequence');
	if (!Array.isArray(state.position) || state.position.length !== 3 || !state.position.every((v) => Number.isFinite(v) && Math.abs(v) < 10000)) throw new Error('Invalid position');
	if (!Number.isFinite(state.yaw) || Math.abs(state.yaw) > 1000 || typeof state.moving !== 'boolean' || !['walk', 'swim', 'deck', 'boat', 'helicopter'].includes(state.mode)) throw new Error('Invalid pose');
	if (state.helicopter !== undefined) validateHelicopter(state.helicopter);
	if (state.deckLocal !== undefined && (state.mode !== 'deck' || !Array.isArray(state.deckLocal) || state.deckLocal.length !== 3 || !state.deckLocal.every((v) => Number.isFinite(v) && Math.abs(v) < 20))) throw new Error('Invalid deck pose');
	if (state.boat !== undefined) {
		const b = state.boat;
		if (state.playerId !== PLAYER_IDS.loz || !b || !Array.isArray(b.position) || b.position.length !== 3 || !b.position.every((v) => Number.isFinite(v) && Math.abs(v) < 10000) || !Array.isArray(b.quaternion) || b.quaternion.length !== 4 || !b.quaternion.every((v) => Number.isFinite(v) && Math.abs(v) <= 1.001) || Math.abs(b.quaternion.reduce((sum, v) => sum + v * v, 0) - 1) > 0.02 || !Array.isArray(b.velocity) || b.velocity.length !== 3 || !b.velocity.every((v) => Number.isFinite(v) && Math.abs(v) < 100) || typeof b.driven !== 'boolean') throw new Error('Invalid boat state');
	}
	if (!Number.isFinite(state.timestamp) || Math.abs(Date.now() - state.timestamp) > 60_000) throw new Error('Stale timestamp');
	if (JSON.stringify(state).length > 4096) throw new Error('Oversized state');
	return state;
}

export class RemoteState {
	constructor({ ownPlayerId, ownNodeId }) { this.ownPlayerId = ownPlayerId; this.ownNodeId = ownNodeId; this.state = null; this.received = 0; this.sentSequence = -1; }
	observe(input) {
		const state = validateState(input);
		if (state.playerId === this.ownPlayerId || state.nodeId === this.ownNodeId) throw new Error('Self state is not remote');
		if (this.state && (state.playerId !== this.state.playerId || state.nodeId !== this.state.nodeId || state.sequence <= this.state.sequence)) return false;
		this.state = state; this.received++; return true;
	}
	markSent(sequence) { this.sentSequence = sequence; }
	verified() {
		return !!this.state && this.received >= 2 && this.sentSequence >= 1 && this.state.observedRemoteSequence >= 1 && this.state.observedRemoteSequence <= this.sentSequence;
	}
	interpolated(previous, alpha) {
		if (!this.state) return null;
		if (!previous) return this.state;
		const t = Math.max(0, Math.min(1, alpha));
		return { ...this.state, position: this.state.position.map((v, i) => previous.position[i] + (v - previous.position[i]) * t) };
	}
}
