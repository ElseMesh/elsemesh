const ROOM = /^[a-f0-9]{32}$/;

export class OnlineRoomTransport {
	constructor(room, role) {
		if (!ROOM.test(room) || !['loz', 'ed'].includes(role)) throw new Error('Invalid room or role');
		this.handlers = new Set();
		this.connected = false;
		this.status = 'Connecting';
		const url = new URL('/ws', location.href);
		url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		url.searchParams.set('room', room);
		url.searchParams.set('role', role);
		this.socket = new WebSocket(url);
		this.socket.onmessage = ({ data }) => {
			try {
				if (typeof data !== 'string' || data.length > 8192) return;
				const packet = JSON.parse(data);
				if (packet.type === 'peer-status') {
					this.connected = !!packet.connected;
					this.status = this.connected ? 'Friend connected' : 'Waiting for friend';
				} else if (packet.type === 'state') {
					for (const fn of this.handlers) fn(packet.state);
				}
			} catch { /* Ignore malformed server data. */ }
		};
		this.socket.onopen = () => { this.status = 'Waiting for friend'; };
		this.socket.onclose = (event) => {
			this.connected = false;
			this.status = event.code === 1008 ? 'Room unavailable or already full' : 'Connection lost — reload to reconnect';
		};
		this.socket.onerror = () => { this.status = 'Connection failed'; };
	}
	onState(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
	send(state) {
		if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'state', state }));
	}
	close() { this.socket.close(); }
}
