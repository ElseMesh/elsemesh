const ROOM = /^[a-f0-9]{32}$/;

export class OnlineRoomTransport {
	constructor(room, role, hostKey = null) {
		if (!ROOM.test(room) || !['loz', 'ed', 'guest'].includes(role) || (role === 'loz' && !ROOM.test(hostKey || ''))) throw new Error('Invalid room or role');
		this.handlers = new Set();
		this.economyHandlers = new Set();
		this.helicopterHandlers = new Set();
		this.speechHandlers = new Set();
		this.audioHandlers = new Set();
		this.errorHandlers = new Set();
		this.leaveHandlers = new Set();
		this.connected = false;
		this.status = 'Connecting';
		this.count = 0;
		this.capacity = 10;
		this.role = null;
		this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
		const url = new URL('/ws', location.href);
		url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		url.searchParams.set('room', room);
		url.searchParams.set('role', role);
		if (role === 'loz') url.searchParams.set('hostKey', hostKey);
		this.socket = new WebSocket(url);
		this.socket.onmessage = ({ data }) => {
			try {
				if (typeof data !== 'string' || data.length > 3_000_000) return;
				const packet = JSON.parse(data);
				if (packet.type === 'economy' || packet.type === 'economy-result') {
					if(packet.type==='economy')this.economy=packet;
					for(const fn of this.economyHandlers)fn(packet);
				} else if (packet.type === 'helicopter' || packet.type === 'helicopter-result') {
					if(packet.type === 'helicopter') this.helicopter = packet;
					for(const fn of this.helicopterHandlers) fn(packet);
				} else if (packet.type === 'welcome') {
					this.role = packet.role;
					this.capacity = packet.capacity;
					this.resolveReady(packet.role);
				} else if (packet.type === 'peer-status') {
					this.connected = !!packet.connected;
					this.count = packet.count;
					this.status = `${packet.count}/${packet.capacity} players connected`;
				} else if (packet.type === 'state') {
					for (const fn of this.handlers) fn(packet.state);
				} else if (packet.type === 'peer-left') {
					for (const fn of this.leaveHandlers) fn(packet.playerId);
				} else if (packet.type === 'speech') {
					for (const fn of this.speechHandlers) fn(packet.event, packet.acceptedAt);
				} else if (packet.type === 'speech-audio') {
					for (const fn of this.audioHandlers) fn(packet);
				} else if (packet.type === 'speech-error') {
					for (const fn of this.errorHandlers) fn(packet);
				}
			} catch { /* Ignore malformed server data. */ }
		};
		this.socket.onopen = () => { this.status = 'Waiting for friend'; };
		this.socket.onclose = (event) => {
			if (!this.role) this.rejectReady(new Error(event.code === 1008 ? 'Room full or role taken' : 'Room connection failed'));
			this.connected = false;
			this.count = 0;
			this.status = event.code === 1008 ? 'Room full or role taken' : 'Connection lost — reload to reconnect';
		};
		this.socket.onerror = () => { this.status = 'Connection failed'; };
	}
	onState(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
	onEconomy(fn){this.economyHandlers.add(fn);if(this.economy)fn(this.economy);}
	economyAction(action){if(this.socket.readyState!==WebSocket.OPEN)return false;this.socket.send(JSON.stringify({type:'economy-action',...action}));return true;}
	onHelicopter(fn) {this.helicopterHandlers.add(fn);if(this.helicopter)fn(this.helicopter);}
	helicopterAction(action,state) {if(this.socket.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify({type:'helicopter-action',action,state}));}
	onSpeech(fn) { this.speechHandlers.add(fn); return () => this.speechHandlers.delete(fn); }
	onSpeechAudio(fn) { this.audioHandlers.add(fn); return () => this.audioHandlers.delete(fn); }
	onSpeechError(fn) { this.errorHandlers.add(fn); return () => this.errorHandlers.delete(fn); }
	onPeerLeft(fn) { this.leaveHandlers.add(fn); return () => this.leaveHandlers.delete(fn); }
	send(state) {
		if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'state', state }));
	}
	sendSpeech(event) {
		if (!this.connected || this.socket.readyState !== WebSocket.OPEN) return false;
		this.socket.send(JSON.stringify({ type: 'speech', event }));
		return true;
	}
	close() { this.socket.close(); }
}
