import { Vector3 } from '../engine/index.js';
import { SpeechInbox } from './SpeechProtocol.js';
import { roleLabel } from './PlayerProtocol.js';

const nameOf = (id) => roleLabel(id.slice(7));

export class SpeechPresentation {
	constructor(app, playerId, getAvatar) {
		this.app = app;
		this.playerId = playerId;
		this.getAvatar = getAvatar;
		this.inbox = new SpeechInbox();
		this.messages = new Map();
		this.metrics = [];
		this.audioContext = null;
		this.pendingAudio = [];
		this.active = new Map();
		this.bubble = document.createElement('div');
		this.bubble.style.cssText = 'display:none;position:fixed;z-index:1300;max-width:280px;padding:8px 12px;border-radius:12px;background:#f0ffff;color:#0b2530;font:14px/1.35 system-ui;box-shadow:0 3px 14px #0009;pointer-events:none;transform:translate(-50%,-100%);';
		this.subtitle = document.createElement('div');
		this.subtitle.style.cssText = 'display:none;position:fixed;z-index:1300;bottom:18%;left:50%;transform:translateX(-50%);max-width:min(80vw,580px);padding:8px 14px;border-radius:10px;background:#061b28e8;color:white;font:15px/1.4 system-ui;text-align:center;pointer-events:none;';
		this.enableButton = document.createElement('button');
		this.enableButton.type = 'button';
		this.enableButton.textContent = 'Enable friend voice';
		this.enableButton.style.cssText = 'position:fixed;z-index:1301;top:92px;left:12px;padding:7px 10px;border:1px solid #71d9df;border-radius:7px;background:#09232c;color:white;font:12px system-ui;cursor:pointer;';
		this.enableButton.addEventListener('click', () => this.enableAudio());
		document.body.append(this.bubble, this.subtitle, this.enableButton);
	}
	async enableAudio() {
		try {
			this.audioContext ||= new AudioContext();
			await this.audioContext.resume();
			this.enableButton.style.display = 'none';
			for (const packet of this.pendingAudio.splice(0)) this.playAudio(packet);
		} catch { this.enableButton.textContent = 'Voice unavailable — text still works'; }
	}
	onSpeech(event, acceptedAt) {
		try { if (!this.inbox.accept(event)) return; } catch { return; }
		this.messages.set(event.messageId, { event, acceptedAt, receivedAt: performance.now(), until: performance.now() + 7000, status: 'text' });
		if (this.messages.size > 32) this.messages.delete(this.messages.keys().next().value);
	}
	onError(packet) {
		const message = this.messages.get(packet.messageId);
		if (message) message.status = 'text only';
	}
	onAudio(packet) {
		if (!this.messages.has(packet.messageId) || packet.mime !== 'audio/wav' || typeof packet.audio !== 'string' || packet.audio.length > 2_500_000) return;
		if (!this.audioContext || this.audioContext.state !== 'running') {
			this.pendingAudio.push(packet);
			if (this.pendingAudio.length > 4) this.pendingAudio.shift();
			return;
		}
		this.playAudio(packet);
	}
	async playAudio(packet) {
		const message = this.messages.get(packet.messageId);
		if (!message || !this.audioContext) return;
		try {
			const binary = atob(packet.audio);
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			const decoded = await this.audioContext.decodeAudioData(bytes.buffer);
			const source = this.audioContext.createBufferSource();
			source.buffer = decoded;
			const panner = this.audioContext.createPanner();
			panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
			panner.refDistance = 3; panner.maxDistance = 80; panner.rolloffFactor = 0.7;
			source.connect(panner).connect(this.audioContext.destination);
			const item = { source, panner, speaker: packet.speakerPlayerId };
			this.active.set(packet.messageId, item);
			this.placeAudio(item);
			source.onended = () => { this.active.delete(packet.messageId); const avatar = this.getAvatar(item.speaker); if (avatar) avatar.speaking = [...this.active.values()].some((entry) => entry.speaker === item.speaker); };
			message.status = 'speaking';
			message.until = performance.now() + Math.max(5000, decoded.duration * 1000 + 800);
			if (packet.speakerPlayerId !== this.playerId) { const avatar = this.getAvatar(packet.speakerPlayerId); if (avatar) avatar.speaking = true; }
			const playedAt = performance.now();
			source.start();
			this.metrics.push({ messageId: packet.messageId, speakerPlayerId: packet.speakerPlayerId, synthesisMs: packet.synthesisMs, durationSeconds: decoded.duration, receivedToPlaybackMs: Math.round(playedAt - message.receivedAt), serverToPlaybackMs: Date.now() - message.acceptedAt });
			if (this.metrics.length > 40) this.metrics.shift();
		} catch { message.status = 'text only'; }
	}
	placeAudio(item) {
		if (!this.audioContext) return;
		const camera = this.app.camera;
		const listener = this.audioContext.listener;
		const direction = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
		const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
		listener.positionX.value = camera.position.x; listener.positionY.value = camera.position.y; listener.positionZ.value = camera.position.z;
		listener.forwardX.value = direction.x; listener.forwardY.value = direction.y; listener.forwardZ.value = direction.z;
		listener.upX.value = up.x; listener.upY.value = up.y; listener.upZ.value = up.z;
		const pos = item.speaker === this.playerId ? this.app.player.position : this.getAvatar(item.speaker)?.group.getWorldPosition(new Vector3()) || this.app.player.position;
		item.panner.positionX.value = pos.x; item.panner.positionY.value = pos.y + 1.5; item.panner.positionZ.value = pos.z;
	}
	update() {
		const now = performance.now();
		for (const [id, message] of this.messages) if (now > message.until && !this.active.has(id)) this.messages.delete(id);
		const latest = [...this.messages.values()].at(-1);
		if (!latest) { this.bubble.style.display = 'none'; this.subtitle.style.display = 'none'; }
		else {
			const caption = `${nameOf(latest.event.speakerPlayerId)}: ${latest.event.text}${latest.status === 'text only' ? ' (text only)' : ''}`;
			this.subtitle.textContent = caption; this.subtitle.style.display = 'block';
			const avatar = this.getAvatar(latest.event.speakerPlayerId);
			if (latest.event.speakerPlayerId !== this.playerId && avatar?.group.visible) {
				const point = avatar.group.getWorldPosition(new Vector3()).add(new Vector3(0, 2, 0)).project(this.app.camera);
				if (point.z > -1 && point.z < 1) {
					this.bubble.textContent = latest.event.text;
					this.bubble.style.left = `${(point.x + 1) * innerWidth / 2}px`;
					this.bubble.style.top = `${(1 - point.y) * innerHeight / 2}px`;
					this.bubble.style.display = 'block';
				} else this.bubble.style.display = 'none';
			} else this.bubble.style.display = 'none';
		}
		for (const entry of this.active.values()) this.placeAudio(entry);
	}
}
