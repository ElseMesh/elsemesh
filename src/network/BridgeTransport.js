// Localhost bridge for physical two-machine qualification. The bridge owns the
// machine's persistent NodeID; game state still originates in this browser.
export class BridgeTransport {
	static async connect(role) {
		const transport = new BridgeTransport(role);
		await transport.ready;
		return transport;
	}
	constructor(role) {
		this.role = role; this.handlers = new Set(); this.nodeId = null; this.peerNodeId = null; this.connected = false;
		this.socket = new WebSocket('ws://127.0.0.1:42903');
		this.ready = new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('Local node bridge did not respond')), 6000);
			this.socket.onmessage = ({ data }) => {
				try {
					if (typeof data !== 'string' || data.length > 8192) return;
					const packet = JSON.parse(data);
					if (packet.type === 'hello' && packet.role === role && /^bh-node:[0-9a-f]{64}$/.test(packet.nodeId)) {
						this.nodeId = packet.nodeId; this.peerNodeId = packet.peerNodeId; this.connected = !!packet.connected;
						clearTimeout(timer); resolve(this);
					} else if (packet.type === 'peer-status') this.connected = !!packet.connected;
					else if (packet.type === 'state') for (const fn of this.handlers) fn(packet.state);
				} catch { /* discard malformed bridge data */ }
			};
			this.socket.onerror = () => { clearTimeout(timer); reject(new Error('Local node bridge unavailable')); };
			this.socket.onclose = () => { this.connected = false; };
		});
	}
	onState(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
	send(state) { if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'state', state })); }
	close() { this.socket.close(); }
}
