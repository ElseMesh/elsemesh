// Two separate browser contexts exchange protocol messages through a local channel.
// This is an explicitly labelled local demonstration, not physical network evidence.
export class LocalDemoTransport {
	constructor(session, role) {
		if (!/^[a-zA-Z0-9_-]{1,64}$/.test(session)) throw new Error('Invalid session');
		this.role = role;
		this.channel = new BroadcastChannel(`elsemesh-network-demo-${session}`);
		this.handlers = new Set();
		this.channel.onmessage = ({ data }) => {
			if (data?.role !== this.role && data?.type === 'state') for (const fn of this.handlers) fn(data.state);
		};
	}
	onState(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
	send(state) { this.channel.postMessage({ type: 'state', role: this.role, state }); }
	close() { this.channel.close(); }
}
