import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { ONLINE_ROLES, PLAYER_IDS, MAX_ROOM_PLAYERS, validateState } from '../../src/network/PlayerProtocol.js';
import { validateSpeechEvent } from '../../src/network/SpeechProtocol.js';
import { loadPrivateSpeechProvider } from './SpeechProvider.mjs';
import { HelicopterLease } from '../../src/network/HelicopterLease.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webm': 'video/webm' };
const ROOM = /^[a-f0-9]{32}$/;

export async function createOnlineServer({ root = resolve('dist'), host = '127.0.0.1', port = 5200, speechProvider = null } = {}) {
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
			const room = url.searchParams.get('room'), requestedRole = url.searchParams.get('role'), hostKey = url.searchParams.get('hostKey');
			if (!ROOM.test(room || '') || !['loz', 'ed', 'guest'].includes(requestedRole) || (requestedRole === 'loz' && !ROOM.test(hostKey || ''))) throw new Error('Bad room');
			wss.handleUpgrade(request, socket, head, (client) => {
				let peers = rooms.get(room);
				if (!peers) { if (rooms.size >= 500) { client.close(1013, 'Server full'); return; } peers = new Map(); peers.speechIds = new Set(); peers.lastSpeech = new Map(); peers.speechQueue = Promise.resolve(); rooms.set(room, peers); }
				if (requestedRole === 'loz' && peers.hostKey && peers.hostKey !== hostKey) { client.close(1008, 'Host key rejected'); return; }
				const role = requestedRole === 'guest' ? ONLINE_ROLES.slice(1).find((slot) => !peers.has(slot)) : requestedRole;
				if (!role || peers.has(role) || peers.size >= MAX_ROOM_PLAYERS) { client.close(1008, 'Room full or role taken'); return; }
				if (role === 'loz') peers.hostKey = hostKey;
				peers.set(role, client);
				peers.helicopter ||= new HelicopterLease();
				let lastPlayer = null;
				let nodeId = null, windowStart = Date.now(), sent = 0;
				const broadcast = (packet) => {
					const data = JSON.stringify(packet);
					for (const peer of peers.values()) if (peer.readyState === WebSocket.OPEN) peer.send(data);
				};
				client.send(JSON.stringify({ type: 'welcome', role, playerId: PLAYER_IDS[role], capacity: MAX_ROOM_PLAYERS }));
				client.send(JSON.stringify(peers.helicopter.packet()));
				const notify = () => {
					broadcast({ type: 'peer-status', connected: peers.size > 1, count: peers.size, capacity: MAX_ROOM_PLAYERS, roles: [...peers.keys()] });
				};
				notify();
				client.on('message', (bytes) => {
					try {
						const now = Date.now();
						if (now - windowStart >= 1000) { windowStart = now; sent = 0; }
						if (++sent > 20) return;
						const packet = JSON.parse(bytes.toString());
						if (packet.type === 'helicopter-action') {
							if(packet.action==='release' && packet.state) peers.helicopter.update(role,packet.state);
							const accepted = peers.helicopter.action(role, packet.action, lastPlayer);
							client.send(JSON.stringify({type:'helicopter-result',action:packet.action,accepted}));
							broadcast(peers.helicopter.packet()); return;
						}
						if (packet.type === 'state') {
							const state = validateState(packet.state);
							if (state.playerId !== PLAYER_IDS[role] || (role !== 'loz' && state.mode === 'boat') || (nodeId && nodeId !== state.nodeId)) return;
							nodeId ||= state.nodeId;
							if (state.mode === 'helicopter' && peers.helicopter.owner !== role) return;
							lastPlayer = state;
							if (state.helicopter && peers.helicopter.update(role,state.helicopter)) broadcast(peers.helicopter.packet());
							const data = JSON.stringify({ type: 'state', state });
							for (const peer of peers.values()) if (peer !== client && peer.readyState === WebSocket.OPEN) peer.send(data);
						} else if (packet.type === 'speech') {
							const event = validateSpeechEvent(packet.event);
							if (!nodeId || event.nodeId !== nodeId || event.speakerPlayerId !== PLAYER_IDS[role] || peers.size < 2) return;
							if (peers.speechIds.has(event.messageId) || now - (peers.lastSpeech.get(role) || 0) < 1500) return;
							peers.speechIds.add(event.messageId);
							if (peers.speechIds.size > 128) peers.speechIds.delete(peers.speechIds.values().next().value);
							peers.lastSpeech.set(role, now);
							broadcast({ type: 'speech', event, acceptedAt: now });
							if (!speechProvider) { broadcast({ type: 'speech-error', messageId: event.messageId, reason: 'provider_unavailable' }); return; }
							peers.speechQueue = peers.speechQueue.then(async () => {
								try {
									const result = await speechProvider.synthesize(event.text, event.voiceProfile);
									if (!result) { broadcast({ type: 'speech-error', messageId: event.messageId, reason: 'voice_unconfigured' }); return; }
									if (rooms.get(room) !== peers) return;
									broadcast({ type: 'speech-audio', messageId: event.messageId, speakerPlayerId: event.speakerPlayerId, voiceProfile: event.voiceProfile, provider: result.provider, mime: result.mime, audio: result.audio.toString('base64'), synthesisMs: result.synthesisMs, durationSeconds: result.durationSeconds, readyAt: Date.now() });
								} catch (error) {
									console.warn(`Speech synthesis failed for ${event.messageId}: ${error.message}`);
									broadcast({ type: 'speech-error', messageId: event.messageId, reason: 'provider_failed' });
								}
							});
						}
					} catch { /* Reject malformed or incompatible state. */ }
				});
				client.on('close', () => {
					if (peers.get(role) !== client) return;
					peers.delete(role);
					peers.helicopter.disconnect(role); broadcast(peers.helicopter.packet());
					if (peers.size) { broadcast({ type: 'peer-left', role, playerId: PLAYER_IDS[role] }); notify(); }
					else rooms.delete(room);
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
	const speechProvider = await loadPrivateSpeechProvider(process.env.BH_SPEECH_CONFIG);
	const result = await createOnlineServer({ root, host: process.env.BH_ONLINE_HOST || '127.0.0.1', port: Number(process.env.BH_ONLINE_PORT || 5200), speechProvider });
	console.log(`Burning Horizons online rooms listening at http://${result.address.address}:${result.address.port}`);
}
