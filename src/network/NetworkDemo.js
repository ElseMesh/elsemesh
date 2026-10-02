import { PlayerAvatar } from '../player/PlayerAvatar.js';
import { AgentInput } from './AgentInput.js';
import { browserIdentity } from './BrowserIdentity.js';
import { LocalDemoTransport } from './LocalDemoTransport.js';
import { BridgeTransport } from './BridgeTransport.js';
import { OnlineRoomTransport } from './OnlineRoomTransport.js';
import { makeState, PLAYER_IDS, RemoteState, SECTOR_ID, ONLINE_ROLES, roleLabel } from './PlayerProtocol.js';
import { VideoEvidence } from './VideoEvidence.js';
import { TalkUI } from './TalkUI.js';
import { makeSpeechEvent } from './SpeechProtocol.js';
import { SpeechPresentation } from './SpeechPresentation.js';

const shortId = (id) => id ? `${id.slice(0, 16)}…${id.slice(-6)}` : 'waiting';

export class NetworkDemo {
	static async create(app) {
		const online = app.qs.get('demo') === 'online';
		const requestedRole = app.qs.get('role');
		if (!(online ? ['loz', 'ed', 'guest'] : ['loz', 'ed']).includes(requestedRole)) throw new Error('Invalid network role');
		const credentials = online ? new URLSearchParams(location.hash.slice(1)) : null;
		if (online) app.qs.set('room', credentials.get('room') || ''); // In-memory world seed; not an HTTP query.
		const transport = online ? new OnlineRoomTransport(credentials.get('room') || '', requestedRole, credentials.get('hostKey')) : null;
		const role = online ? await transport.ready : requestedRole;
		const bridge = !online && app.qs.get('transport') === 'bridge' ? await BridgeTransport.connect(role) : null;
		const identity = bridge ? { nodeId: bridge.nodeId } : await browserIdentity(role);
		return new NetworkDemo(app, role, identity, transport || bridge, online);
	}
	constructor(app, role, identity, transport = null, online = false) {
		this.app = app; this.role = role; this.identity = identity;
		this.online = online;
		this.playerId = PLAYER_IDS[role]; this.sequence = 0; this.elapsed = 0;
		this.transport = transport || new LocalDemoTransport(app.qs.get('session') || 'public-local', role);
		this.physical = !!transport;
		if (online) {
			app.game.items.connect(this.transport,role);
			this.remotes = new Map();
			this.transport.onState((state) => this.observeOnline(state));
			this.transport.onPeerLeft((playerId) => this.removeOnline(playerId));
			app.player.canDriveBoat = role === 'loz';
			const heli=app.thirdIsland;
			heli.network=(action)=>this.transport.helicopterAction(action,action==='release'?{...heli.state}:undefined);
			this.transport.onHelicopter((packet)=>{
				if(packet.type==='helicopter-result') {
					if(packet.action==='claim'){heli.pending=false;heli.granted=packet.accepted;if(packet.accepted)heli.enter();else heli.toast('Helicopter unavailable — another pilot may be using it.');}
					if(packet.action==='key' && !packet.accepted){heli.hasKey=false;heli.key.visible=true;heli.toast('Stand beside Loz to collect the key.');}
					return;
				}
				heli.remoteOwner=packet.owner && packet.owner!==role ? packet.owner : null;
				if(!heli.active)Object.assign(heli.state,packet.state);
			});
			this.speech = new SpeechPresentation(app, this.playerId, (id) => this.remotes.get(id)?.avatar);
			this.talk = new TalkUI(app.input, (text) => this.sendSpeech(text));
			this.transport.onSpeech((event, acceptedAt) => this.speech.onSpeech(event, acceptedAt));
			this.transport.onSpeechAudio((packet) => this.speech.onAudio(packet));
			this.transport.onSpeechError((packet) => this.speech.onError(packet));
			if (role !== 'loz') {
				const slot = ONLINE_ROLES.indexOf(role) - 1;
				const x = 53.6 + (slot % 3) * 2.5, z = -68.5 + Math.floor(slot / 3) * 2.5;
				app.player.position.set(x, app.player.groundAt(x, z, 50), z);
				app.player.yaw = 0;
			}
			this.#mountOverlay();
			return;
		}
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
	observeOnline(state) {
		try {
			if (!Object.values(PLAYER_IDS).includes(state?.playerId) || state.playerId === this.playerId) return;
			let entry = this.remotes.get(state.playerId);
			if (!entry) {
				const avatar = new PlayerAvatar(this.app.engine.scene, this.app.boatCtl);
				avatar.group.name = `Remote_${roleLabel(state.playerId.slice(7))}`;
				avatar.group.visible = false;
				entry = { remote: new RemoteState({ ownPlayerId: this.playerId, ownNodeId: this.identity.nodeId }), avatar, previous: null, receivedAt: 0 };
				this.remotes.set(state.playerId, entry);
			}
			const previous = entry.remote.state;
			if (entry.remote.observe(state)) { entry.previous = previous; entry.receivedAt = performance.now(); }
		} catch { /* Discard incompatible or hostile state. */ }
	}
	removeOnline(playerId) {
		const entry = this.remotes.get(playerId);
		if (!entry) return;
		entry.avatar.dispose();
		this.remotes.delete(playerId);
	}
	updateOnline(dt) {
		const now = performance.now();
		const host = this.remotes.get(PLAYER_IDS.loz);
		if (this.role !== 'loz') {
			if (host && now - host.receivedAt < 1500 && host.remote.state?.boat) this.lastHostBoat = host.remote.state.boat;
			this.app.boatCtl.networkReplica = this.lastHostBoat ? { ...this.lastHostBoat, driven: !!host && now - host.receivedAt < 1500 && this.lastHostBoat.driven } : null;
		}
		this.elapsed += dt;
		if (this.elapsed >= 0.1) {
			this.elapsed = 0;
			const state = makeState({ playerId: this.playerId, nodeId: this.identity.nodeId, sequence: this.sequence++, player: this.app.player, boat: this.role === 'loz' ? this.app.boatCtl : null });
			if(this.app.thirdIsland.active)state.helicopter={...this.app.thirdIsland.state};
			this.transport.send(state);
		}
		for (const entry of this.remotes.values()) {
			if (now - entry.receivedAt >= 1500 || !entry.remote.state) { entry.avatar.group.visible = false; entry.avatar.speaking = false; continue; }
			const pose = entry.remote.interpolated(entry.previous, (now - entry.receivedAt) / 100);
			entry.avatar.setAppearance(pose.appearance)?.catch(() => {});
			entry.avatar.cinematic = { x: pose.position[0], y: pose.position[1], z: pose.position[2], yaw: pose.yaw + Math.PI, walk: pose.moving, mode: pose.mode, deckLocal: pose.deckLocal, deckYaw: pose.yaw - (this.app.boatCtl.getYaw() + Math.PI) };
			entry.avatar.update(dt, this.app.player, this.app.camera, this.app.freeCam);
			if(pose.mode==='helicopter')entry.avatar.group.visible=false;
		}
		this.speech.update();
		const visiblePeers = [...this.remotes.values()].filter((entry) => now - entry.receivedAt < 1500).length;
		this.overlay.innerHTML = `<strong>${roleLabel(this.role)} — ONLINE</strong><br>${escapeStatus(this.transport.status)}<br>${visiblePeers} other player${visiblePeers === 1 ? '' : 's'} in view<br>T talk · ${this.role === 'loz' ? 'boat helm' : 'boat passenger'}`;
	}
	openTalk() { return this.talk?.show() ?? false; }
	sendSpeech(text) {
		if (!this.online) return false;
		try { return this.transport.sendSpeech(makeSpeechEvent({ role: this.role, nodeId: this.identity.nodeId, text })); }
		catch { return false; }
	}
	#mountOverlay() {
		const el = document.createElement('div');
		el.className = 'elsemesh-network-overlay';
		el.style.cssText = 'padding:11px 14px;color:#eaffff;font:12px/1.5 system-ui;pointer-events:auto;min-width:205px;text-shadow:0 1px 2px #000;';
		const manager = this.app.ui?.ui?.windows;
		if (manager) {
			const networkWindow = manager.register({ id: 'network', element: el, title: 'Network Status' });
			this.networkWindow = networkWindow;
			const launcher = document.createElement('button');
			launcher.type = 'button';
			launcher.className = 'elsemesh-network-launcher tw-interactive';
			launcher.textContent = 'Network';
			launcher.setAttribute('aria-label', 'Open Network Status');
			launcher.addEventListener('click', () => networkWindow.show());
			(this.app.ui.ui.root || document.body).append(launcher);
			networkWindow.show();
		} else {
			document.body.append(el);
		}
		this.overlay = el;
	}
	update(dt) {
		if (this.online) return this.updateOnline(dt);
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
			this.remoteAvatar.setAppearance(pose.appearance)?.catch(() => {});
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
		this.overlay.innerHTML = `<strong>${this.role.toUpperCase()} — ${this.role === 'loz' ? 'HUMAN' : 'AI'}</strong><br>Player ${this.playerId}<br>Node ${shortId(this.identity.nodeId)}<br>Sector ${SECTOR_ID}<br>Authority ${shortId(authority)}<br>${this.physical ? 'TWO PHYSICAL NODES' : 'LOCAL TWO-NODE DEMO'} · ${connected ? 'DIRECT' : 'WAITING'}<br>Protocol elsemesh.player-state/1<br>RTT unavailable · loss unavailable<br>${verified ? '<strong style="color:#8dffad">NETWORK VERIFIED</strong>' : 'Awaiting bidirectional movement'}${this.agent ? `<br>AGENT ACTION: ${this.agent.command.tool}(${this.agent.command.playerId || ''})<br>Distance ${distance?.toFixed(1) ?? '—'} m` : ''}`;
		window.parent?.postMessage({ type: 'elsemesh-network-demo-status', role: this.role, verified, connected, localNodeId: this.identity.nodeId, remoteNodeId: received?.nodeId, localSequence: this.sequence - 1, remoteSequence: received?.sequence ?? -1 }, location.origin);
	}
}
const escapeStatus = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
