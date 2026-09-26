import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { PLAYER_IDS, validateState } from '../../src/network/PlayerProtocol.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webm': 'video/webm' };
const ROOM = /^[a-f0-9]{32}$/;

export async function createOnlineServer({ root = resolve('dist'), host = '127.0.0.1', port = 5200 } = {}) {
	root = resolve(root);
	const rooms = new Map();
	const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
	const server = createServer(async (request, response) => {
		if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
		try {
			const pathname = new URL(request.url, 'http://localhost').pathname;
			const target = resolve(root, `.${decodeURIComponent(pathname === '/' ? '/play-online.html' : pathname)}`);
			const rel = relative(root, target);
			if (rel.startsWith('..') || rel.includes(':') || rel === '' || extname(target) === '') { response.writeHead(404).end(); return; }
			const info = await stat(target);
			if (!info.isFile()) { response.writeHead(404).end(); return; }
			const bytes = await readFile(target);
			response.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
			response.end(request.method === 'HEAD' ? undefined : bytes);
		} catch { response.writeHead(404).end(); }
	});

	server.on('upgrade', (request, socket, head) => {
		try {
			const url = new URL(request.url, 'http://localhost');
			const origin = new URL(request.headers.origin);
			if (url.pathname !== '/ws' || origin.host !== request.headers.host || !['http:', 'https:'].includes(origin.protocol)) throw new Error('Bad origin');
			const room = url.searchParams.get('room'), role = url.searchParams.get('role');
			if (!ROOM.test(room || '') || !['loz', 'ed'].includes(role)) throw new Error('Bad room');
			wss.handleUpgrade(request, socket, head, (client) => {
				let peers = rooms.get(room);
				if (!peers) { if (rooms.size >= 500) { client.close(1013, 'Server full'); return; } peers = new Map(); rooms.set(room, peers); }
				if (peers.has(role)) { client.close(1008, 'Role already taken'); return; }
				peers.set(role, client);
				let nodeId = null, windowStart = Date.now(), sent = 0;
				const otherRole = role === 'loz' ? 'ed' : 'loz';
				const notify = () => {
					const packet = JSON.stringify({ type: 'peer-status', connected: peers.has('loz') && peers.has('ed') });
					for (const peer of peers.values()) if (peer.readyState === WebSocket.OPEN) peer.send(packet);
				};
				notify();
				client.on('message', (bytes) => {
					try {
						const now = Date.now();
						if (now - windowStart >= 1000) { windowStart = now; sent = 0; }
						if (++sent > 20) return;
						const packet = JSON.parse(bytes.toString());
						if (packet.type !== 'state') return;
						const state = validateState(packet.state);
						if (state.playerId !== PLAYER_IDS[role] || (nodeId && nodeId !== state.nodeId)) return;
						nodeId ||= state.nodeId;
						const peer = peers.get(otherRole);
						if (peer?.readyState === WebSocket.OPEN) peer.send(JSON.stringify({ type: 'state', state }));
					} catch { /* Reject malformed or incompatible state. */ }
				});
				client.on('close', () => {
					if (peers.get(role) !== client) return;
					peers.delete(role);
					if (peers.size) notify(); else rooms.delete(room);
				});
			});
		} catch { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); }
	});

	await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
	return { server, wss, address: server.address(), close: async () => {
		for (const client of wss.clients) client.terminate();
		await new Promise((ok) => wss.close(ok));
		await new Promise((ok) => server.close(ok));
	} };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const root = resolve(fileURLToPath(new URL('../../dist/', import.meta.url)));
	const result = await createOnlineServer({ root, host: process.env.BH_ONLINE_HOST || '127.0.0.1', port: Number(process.env.BH_ONLINE_PORT || 5200) });
	console.log(`Burning Horizons online rooms listening at http://${result.address.address}:${result.address.port}`);
}
