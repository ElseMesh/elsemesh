import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from './RoomTestSocket.mjs';
import { createOnlineServer } from '../tools/networking/online-server.mjs';
import { makeState } from '../src/network/PlayerProtocol.js';

const nodeId = (letter) => `elsemesh-node:${letter.repeat(64)}`;
const player = (x) => ({ position: { x, y: 2, z: -70 }, yaw: 0, mode: 'walk', velocity: { lengthSq: () => 1 } });
const receive = (socket, predicate) => new Promise((resolve, reject) => {
	const timeout = setTimeout(() => { socket.off('message', onMessage); reject(new Error('Timed out waiting for room message')); }, 2000);
	const onMessage = (bytes) => {
		const packet = JSON.parse(bytes.toString());
		if (!predicate(packet)) return;
		clearTimeout(timeout); socket.off('message', onMessage); resolve(packet);
	};
	socket.on('message', onMessage);
});
const open = (url, origin) => new Promise((resolve, reject) => {
	const socket = new WebSocket(url, { origin });
	socket.once('open', () => resolve(socket)); socket.once('error', reject);
});

test('two human clients exchange room state; a third room stays isolated', async () => {
	const service = await createOnlineServer({ root: process.cwd(), port: 0 });
	const origin = `http://127.0.0.1:${service.address.port}`;
	const room = roomForHostKey('d'.repeat(32)), other = 'b'.repeat(32);
	const sockets = [];
	try {
		const host = await open(`${origin.replace('http', 'ws')}/ws?room=${room}&role=loz&hostKey=${'d'.repeat(32)}`, origin); sockets.push(host);
		const hostStatus = receive(host, (p) => p.type === 'peer-status' && p.connected);
		const guest = await open(`${origin.replace('http', 'ws')}/ws?room=${room}&role=ed`, origin); sockets.push(guest);
		await hostStatus;
		const observer = await open(`${origin.replace('http', 'ws')}/ws?room=${other}&role=ed`, origin); sockets.push(observer);
		let observerReceived = false; observer.on('message', (bytes) => { if (JSON.parse(bytes.toString()).type === 'state') observerReceived = true; });
		const toGuest = receive(guest, (p) => p.type === 'state');
		const state = makeState({ playerId: 'player:loz', nodeId: nodeId('a'), sequence: 1, player: player(50) });
		host.send(JSON.stringify({ type: 'state', state }));
		assert.deepEqual((await toGuest).state, state);
		const toHost = receive(host, (p) => p.type === 'state');
		guest.send(JSON.stringify({ type: 'state', state: makeState({ playerId: 'player:ed', nodeId: nodeId('b'), sequence: 1, player: player(53) }) }));
		assert.equal((await toHost).state.playerId, 'player:ed');
		await new Promise((ok) => setTimeout(ok, 50));
		assert.equal(observerReceived, false);
	} finally { for (const socket of sockets) socket.terminate(); await service.close(); }
});
import { roomForHostKey } from '../tools/networking/RoomSecurity.mjs';
