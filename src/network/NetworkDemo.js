import { PlayerAvatar } from '../player/PlayerAvatar.js';
import { AgentInput } from './AgentInput.js';
import { browserIdentity } from './BrowserIdentity.js';
import { LocalDemoTransport } from './LocalDemoTransport.js';
import { BridgeTransport } from './BridgeTransport.js';
import { makeState, PLAYER_IDS, RemoteState, SECTOR_ID } from './PlayerProtocol.js';
import { VideoEvidence } from './VideoEvidence.js';

const shortId = (id) => id ? `${id.slice(0, 16)}…${id.slice(-6)}` : 'waiting';

export class NetworkDemo {
	static async create(app) {
		const role = app.qs.get('role');
		if (!['loz', 'ed'].includes(role)) throw new Error('Network demo role must be loz or ed');
		const bridge = app.qs.get('transport') === 'bridge' ? await BridgeTransport.connect(role) : null;
		const identity = bridge ? { nodeId: bridge.nodeId } : await browserIdentity(role);
		return new NetworkDemo(app, role, identity, bridge);
	}
	constructor(app, role, identity, bridge = null) {
		this.app = app; this.role = role; this.identity = identity;
		this.playerId = PLAYER_IDS[role]; this.sequence = 0; this.elapsed = 0;
		this.transport = bridge || new LocalDemoTransport(app.qs.get('session') || 'public-local', role);
		this.physical = !!bridge;
		this.remote = new RemoteState({ ownPlayerId: this.playerId, ownNodeId: identity.nodeId });
		this.remotePrevious = null; this.remoteReceivedAt = 0; this.remoteMoved = false; this.localMoved = false;
		this.transport.onState((state) => {
			try {
				const before = this.remote.state;
				if (this.remote.observe(state)) {
					this.remotePrevious = before; this.remoteReceivedAt = performance.now();
					this.remoteMoved ||= state.moving || (before && Math.hypot(state.position[0] - before.position[0], state.position[2] - before.position[2]) > 0.1);
					if (this.agent) this.agent.setTarget(state);
				}
			} catch { /* hostile or incompatible state is discarded */ }
		});
		this.remoteAvatar = new PlayerAvatar(app.engine.scene, app.boatCtl);
		if (app.qs.has('record')) this.video = new VideoEvidence(this);
		this.remoteAvatar.group.name = `Remote_${role === 'loz' ? 'Ed' : 'Loz'}`;
		this.remoteAvatar.group.visible = false;
		if (role === 'ed') {
			const player = app.player;
			player.position.set(53.6, player.groundAt(53.6, -68.5, 50), -68.5);
			player.yaw = 0;
			this.agent = new AgentInput(player);
			this.agent.follow_player('player:loz');
			player.input = this.agent;
		}
		this.#mountOverlay();
	}
	#mountOverlay() {
		const el = document.createElement('div');
		el.className = 'bh-network-overlay';
		el.style.cssText = 'position:fixed;top:12px;left:12px;z-index:1100;padding:11px 14px;background:rgba(4,18,28,.82);border:1px solid #6bd6df;border-radius:8px;color:#eaffff;font:12px/1.5 system-ui;pointer-events:none;min-width:205px;text-shadow:0 1px 2px #000;';
		document.body.append(el); this.overlay = el;
	}
	update(dt) {
		const player = this.app.player;
		this.localMoved ||= player.velocity.lengthSq() > 0.12;
		this.elapsed += dt;
		if (this.elapsed >= 0.1) {
			this.elapsed = 0;
			const state = makeState({ playerId: this.playerId, nodeId: this.identity.nodeId, sequence: this.sequence++, player, observedRemoteSequence: this.remote.state?.sequence ?? -1 });
			this.remote.markSent(state.sequence);
			this.transport.send(state);
		}
		const received = this.remote.state;
		const connected = !!received && performance.now() - this.remoteReceivedAt < 1500 && (!this.physical || this.transport.connected);
		if (connected) {
			if (this.agent && this.agent.command.tool === 'stop') this.agent.follow_player('player:loz');
			const pose = this.remote.interpolated(this.remotePrevious, (performance.now() - this.remoteReceivedAt) / 100);
			this.remoteAvatar.cinematic = { x: pose.position[0], y: pose.position[1], z: pose.position[2], yaw: pose.yaw + Math.PI, walk: pose.moving };
			this.remoteAvatar.update(dt, player, this.app.camera, this.app.freeCam);
			if (this.agent) this.agent.setTarget(received);
		} else {
			this.remoteAvatar.group.visible = false;
			if (this.agent) this.agent.stop();
		}
		const verified = connected && this.localMoved && this.remoteMoved && this.remote.verified();
		if (verified && this.video && !this.video.started) this.video.start();
		const authority = this.role === 'loz' ? this.identity.nodeId : received?.nodeId;
		const distance = received ? Math.hypot(received.position[0] - player.position.x, received.position[2] - player.position.z) : null;
		this.overlay.innerHTML = `<strong>${this.role.toUpperCase()} — ${this.role === 'loz' ? 'HUMAN' : 'AI'}</strong><br>Player ${this.playerId}<br>Node ${shortId(this.identity.nodeId)}<br>Sector ${SECTOR_ID}<br>Authority ${shortId(authority)}<br>${this.physical ? 'TWO PHYSICAL NODES' : 'LOCAL TWO-NODE DEMO'} · ${connected ? 'DIRECT' : 'WAITING'}<br>Protocol bh.player-state/1<br>RTT unavailable · loss unavailable<br>${verified ? '<strong style="color:#8dffad">NETWORK VERIFIED</strong>' : 'Awaiting bidirectional movement'}${this.agent ? `<br>AGENT ACTION: ${this.agent.command.tool}(${this.agent.command.playerId || ''})<br>Distance ${distance?.toFixed(1) ?? '—'} m` : ''}`;
		window.parent?.postMessage({ type: 'bh-network-demo-status', role: this.role, verified, connected, localNodeId: this.identity.nodeId, remoteNodeId: received?.nodeId, localSequence: this.sequence - 1, remoteSequence: received?.sequence ?? -1 }, location.origin);
	}
}
