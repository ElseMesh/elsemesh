export const WORLD_ID = 'bh:burning-horizons';
export const SECTOR_ID = 'bh:ISLAND-01';
export const PLAYER_IDS = Object.freeze({ loz: 'player:loz', ed: 'player:ed' });
export const PLAYER_PROTOCOL = 'bh.player-state/1';

export function makeState({ playerId, nodeId, sequence, player, observedRemoteSequence = -1 }) {
	return {
		protocol: PLAYER_PROTOCOL, worldId: WORLD_ID, sectorId: SECTOR_ID,
		playerId, nodeId, sequence, observedRemoteSequence,
		position: [ player.position.x, player.position.y, player.position.z ],
		yaw: player.yaw, moving: player.velocity.lengthSq() > 0.12,
		mode: player.mode, timestamp: Date.now(),
	};
}

export function validateState(state) {
	if (!state || state.protocol !== PLAYER_PROTOCOL || state.worldId !== WORLD_ID || state.sectorId !== SECTOR_ID) throw new Error('Incompatible world or sector');
	if (!Object.values(PLAYER_IDS).includes(state.playerId) || !/^bh-node:[0-9a-f]{64}$/.test(state.nodeId)) throw new Error('Invalid player or node identity');
	if (!Number.isSafeInteger(state.sequence) || state.sequence < 0 || !Number.isSafeInteger(state.observedRemoteSequence) || state.observedRemoteSequence < -1) throw new Error('Invalid sequence');
	if (!Array.isArray(state.position) || state.position.length !== 3 || !state.position.every((v) => Number.isFinite(v) && Math.abs(v) < 10000)) throw new Error('Invalid position');
	if (!Number.isFinite(state.yaw) || Math.abs(state.yaw) > 1000 || typeof state.moving !== 'boolean' || !['walk', 'swim', 'deck', 'boat'].includes(state.mode)) throw new Error('Invalid pose');
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
