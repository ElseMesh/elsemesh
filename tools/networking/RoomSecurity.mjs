import { createHash } from 'node:crypto';
const LOOPBACK = new Set(['127.0.0.1', '::1']);

export const roomForHostKey = key => createHash('sha256').update(`elsemesh.online-room/2:${key}`).digest('hex').slice(0, 32);

// TLS terminates at the explicitly configured same-machine proxy. Never trust
// arbitrary forwarded headers or expose this plaintext listener on the LAN.
export function roomSecurity({ host, publicOrigin, production }) {
	if (!LOOPBACK.has(host)) throw new Error('Online rooms must bind to a loopback IP; use an HTTPS reverse proxy');
	if (production && !publicOrigin) throw new Error('Production requires ELSEMESH_PUBLIC_ORIGIN and an HTTPS reverse proxy');
	if (publicOrigin) {
		const url = new URL(publicOrigin);
		if (url.protocol !== 'https:' || url.origin !== publicOrigin) throw new Error('Public origin must be an exact HTTPS origin without path or credentials');
	}
	return {
		accept(request, port) {
			const expected = publicOrigin || `http://${host === '::1' ? '[::1]' : host}:${port}`;
			return request.headers.origin === expected && request.headers.host === new URL(expected).host;
		},
	};
}

export const MAX_BUFFERED_BYTES = 3_000_000;
export function sendBounded(peer, data) {
	if (peer.readyState !== 1) return false;
	if (peer.bufferedAmount + Buffer.byteLength(data) > MAX_BUFFERED_BYTES) {
		peer.terminate(); // Do not enqueue even a close frame behind a slow consumer.
		return false;
	}
	peer.send(data);
	return true;
}
