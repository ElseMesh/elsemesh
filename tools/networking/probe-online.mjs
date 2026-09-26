import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { makeState } from '../../src/network/PlayerProtocol.js';

const origin = process.argv[2];
if (!origin || !/^https?:\/\//.test(origin)) throw new Error('Usage: node tools/networking/probe-online.mjs https://game-host');
const room = randomUUID().replaceAll('-', '');
const base = new URL(origin);
base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
base.pathname = '/ws';
const sockets = [];
const awaitPacket = (socket, match) => new Promise((resolve, reject) => {
	const timeout = setTimeout(() => { socket.off('message', onMessage); reject(new Error('Timed out waiting for online room')); }, 5000);
	const onMessage = (bytes) => {
		const packet = JSON.parse(bytes.toString());
		if (!match(packet)) return;
		clearTimeout(timeout); socket.off('message', onMessage); resolve(packet);
	};
	socket.on('message', onMessage);
});
const connect = (role) => new Promise((resolve, reject) => {
	const url = new URL(base);
	url.searchParams.set('room', room); url.searchParams.set('role', role);
	const socket = new WebSocket(url, { origin }); sockets.push(socket);
	socket.once('open', () => resolve(socket)); socket.once('error', reject);
});
try {
	const host = await connect('loz');
	const hostReady = awaitPacket(host, (p) => p.type === 'peer-status' && p.connected);
	const guest = await connect('ed');
	await hostReady;
	const guestReceived = awaitPacket(guest, (p) => p.type === 'state');
	const state = makeState({ playerId: 'player:loz', nodeId: `bh-node:${'a'.repeat(64)}`, sequence: 1, player: { position: { x: 50, y: 2, z: -70 }, yaw: 0, mode: 'walk', velocity: { lengthSq: () => 1 } } });
	host.send(JSON.stringify({ type: 'state', state }));
	if ((await guestReceived).state?.sequence !== 1) throw new Error('Guest received wrong state');
	console.log('PASS: public HTTPS endpoint and WebSocket room relayed host movement to guest');
} finally { for (const socket of sockets) socket.terminate(); }
