import { PlayerAvatar } from '../player/PlayerAvatar.js';
import { AgentInput } from './AgentInput.js';
import { browserIdentity } from './BrowserIdentity.js';
import { LocalDemoTransport } from './LocalDemoTransport.js';
import { BridgeTransport } from './BridgeTransport.js';
import { OnlineRoomTransport } from './OnlineRoomTransport.js';
import { makeState, PLAYER_IDS, RemoteState, SECTOR_ID } from './PlayerProtocol.js';
import { VideoEvidence } from './VideoEvidence.js';
import { TalkUI } from './TalkUI.js';
import { makeSpeechEvent } from './SpeechProtocol.js';
import { SpeechPresentation } from './SpeechPresentation.js';

const shortId = (id) => id ? `${id.slice(0, 16)}…${id.slice(-6)}` : 'waiting';

export class NetworkDemo {
	static async create(app) {
		const role = app.qs.get('role');
		if (!['loz', 'ed'].includes(role)) throw new Error('Network demo role must be loz or ed');
		const online = app.qs.get('demo') === 'online';
		const bridge = !online && app.qs.get('transport') === 'bridge' ? await BridgeTransport.connect(role) : null;
		const identity = bridge ? { nodeId: bridge.nodeId } : await browserIdentity(role);
		const transport = online ? new OnlineRoomTransport(app.qs.get('room') || '', role) : bridge;
		return new NetworkDemo(app, role, identity, transport, online);
	}
	constructor(app, role, identity, transport = null, online = false) {
		this.app = app; this.role = role; this.identity = identity;
		this.online = online;
		this.playerId = PLAYER_IDS[role]; this.sequence = 0; this.elapsed = 0;
		this.transport = transport || new LocalDemoTransport(app.qs.get('session') || 'public-local', role);
		this.physical = !!transport;
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
		if (app.qs.has('record')) {
			const port = Number(app.qs.get('recordReceiver') || 42907);
			if (Number.isSafeInteger(port) && port >= 1024 && port <= 65535) this.video = new VideoEvidence(this, `ws://127.0.0.1:${port}`);
		}
		this.remoteAvatar.group.name = `Remote_${role === 'loz' ? 'Ed' : 'Loz'}`;
		this.remoteAvatar.group.visible = false;
		if (online) {
			app.player.canDriveBoat = role === 'loz';
			this.speech = new SpeechPresentation(app, this.playerId, this.remoteAvatar);
			this.talk = new TalkUI(app.input, (text) => this.sendSpeech(text));
			this.transport.onSpeech((event, acceptedAt) => this.speech.onSpeech(event, acceptedAt));
			this.transport.onSpeechAudio((packet) => this.speech.onAudio(packet));
			this.transport.onSpeechError((packet) => this.speech.onError(packet));
		}
		if (role === 'ed') {
			const player = app.player;
			player.position.set(53.6, player.groundAt(53.6, -68.5, 50), -68.5);
			player.yaw = 0;
			if (!online) {
				this.agent = new AgentInput(player);
				this.agent.follow_player('player:loz');
				player.input = this.agent;
			}
		}
		this.#mountOverlay();
	}
	openTalk() { return this.talk?.show() ?? false; }
	sendSpeech(text) {
		if (!this.online) return false;
		try { return this.transport.sendSpeech(makeSpeechEvent({ role: this.role, nodeId: this.identity.nodeId, text })); }
		catch { return false; }
	}
	#mountOverlay() {
		const el = document.createElement('div');
		el.className = 'bh-network-overlay';
		el.style.cssText = 'position:fixed;top:12px;left:12px;z-index:1100;padding:11px 14px;background:rgba(4,18,28,.82);border:1px solid #6bd6df;border-radius:8px;color:#eaffff;font:12px/1.5 system-ui;pointer-events:none;min-width:205px;text-shadow:0 1px 2px #000;';
		document.body.append(el); this.overlay = el;
	}
	update(dt) {
		const player = this.app.player;
		if (this.online && !this.transport.connected && this.remote.state) {
			this.remote = new RemoteState({ ownPlayerId: this.playerId, ownNodeId: this.identity.nodeId });
			this.remotePrevious = null;
			this.remoteMoved = false;
		}
		this.localMoved ||= player.velocity.lengthSq() > 0.12;
		if (this.online && this.role === 'ed') {
			const hostBoat = this.remote.state?.boat;
			this.app.boatCtl.networkReplica = this.transport.connected && performance.now() - this.remoteReceivedAt < 1500 ? hostBoat || null : null;
		}
		this.elapsed += dt;
		if (this.elapsed >= 0.1) {
			this.elapsed = 0;
			const state = makeState({ playerId: this.playerId, nodeId: this.identity.nodeId, sequence: this.sequence++, player, boat: this.online && this.role === 'loz' ? this.app.boatCtl : null, observedRemoteSequence: this.remote.state?.sequence ?? -1 });
			this.remote.markSent(state.sequence);
			this.transport.send(state);
		}
		const received = this.remote.state;
		const connected = !!received && performance.now() - this.remoteReceivedAt < 1500 && (!this.physical || this.transport.connected);
		if (connected) {
			if (this.agent && this.agent.command.tool === 'stop') this.agent.follow_player('player:loz');
			const pose = this.remote.interpolated(this.remotePrevious, (performance.now() - this.remoteReceivedAt) / 100);
			this.remoteAvatar.cinematic = { x: pose.position[0], y: pose.position[1], z: pose.position[2], yaw: pose.yaw + Math.PI, walk: pose.moving, mode: pose.mode, deckLocal: pose.deckLocal, deckYaw: pose.yaw - (this.app.boatCtl.getYaw() + Math.PI) };
			this.remoteAvatar.update(dt, player, this.app.camera, this.app.freeCam);
			if (this.agent) this.agent.setTarget(received);
		} else {
			this.remoteAvatar.group.visible = false;
			this.remoteAvatar.speaking = false;
			if (this.agent) this.agent.stop();
		}
		const verified = connected && this.localMoved && this.remoteMoved && this.remote.verified();
		if (verified && this.video && !this.video.started) this.video.start();
		const authority = this.role === 'loz' ? this.identity.nodeId : received?.nodeId;
		const distance = received ? Math.hypot(received.position[0] - player.position.x, received.position[2] - player.position.z) : null;
		this.speech?.update();
		this.overlay.innerHTML = this.online
			? `<strong>${roleLabel(this.role)} — ONLINE</strong><br>${escapeStatus(this.transport.status)}<br>${connected ? `Friend ${distance?.toFixed(1) ?? '—'} m away` : 'Share the invite link to play together'}<br>${verified ? 'Both players moving' : 'World movement is shared'}<br>T talk · ${this.role === 'loz' ? 'boat helm' : 'boat passenger'}`
			: `<strong>${this.role.toUpperCase()} — ${this.role === 'loz' ? 'HUMAN' : 'AI'}</strong><br>Player ${this.playerId}<br>Node ${shortId(this.identity.nodeId)}<br>Sector ${SECTOR_ID}<br>Authority ${shortId(authority)}<br>${this.physical ? 'TWO PHYSICAL NODES' : 'LOCAL TWO-NODE DEMO'} · ${connected ? 'DIRECT' : 'WAITING'}<br>Protocol bh.player-state/1<br>RTT unavailable · loss unavailable<br>${verified ? '<strong style="color:#8dffad">NETWORK VERIFIED</strong>' : 'Awaiting bidirectional movement'}${this.agent ? `<br>AGENT ACTION: ${this.agent.command.tool}(${this.agent.command.playerId || ''})<br>Distance ${distance?.toFixed(1) ?? '—'} m` : ''}`;
		window.parent?.postMessage({ type: 'bh-network-demo-status', role: this.role, verified, connected, localNodeId: this.identity.nodeId, remoteNodeId: received?.nodeId, localSequence: this.sequence - 1, remoteSequence: received?.sequence ?? -1 }, location.origin);
	}
}

const roleLabel = (role) => role === 'loz' ? 'HOST' : 'GUEST';
const escapeStatus = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
