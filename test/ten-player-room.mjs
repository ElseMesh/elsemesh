import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { createOnlineServer } from '../tools/networking/online-server.mjs';
import { makeState, ONLINE_ROLES, PLAYER_IDS } from '../src/network/PlayerProtocol.js';
import { makeSpeechEvent } from '../src/network/SpeechProtocol.js';

const nodeId = (n) => `bh-node:${n.toString(16).repeat(64)}`;
const player = (n) => ({ position: { x: 50 + n, y: 2, z: -70 }, yaw: 0, mode: 'walk', velocity: { lengthSq: () => 1 } });
const boat = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, velocity: { x: 0, y: 0, z: 0 }, driven: true };

async function connect(url, origin) {
	const socket = new WebSocket(url, { origin });
	const packets = [];
	const waiters = [];
	socket.on('message', (bytes) => {
		const packet = JSON.parse(bytes.toString());
		packets.push(packet);
		for (const waiter of [...waiters]) if (waiter.predicate(packet)) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(packet); }
	});
	await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
	return {
		socket, packets,
		wait(predicate, timeoutMs = 1500) {
			const seen = packets.find(predicate);
			if (seen) return Promise.resolve(seen);
			return new Promise((resolve, reject) => {
				const waiter = { predicate, resolve };
				waiters.push(waiter);
				setTimeout(() => { const i = waiters.indexOf(waiter); if (i >= 0) { waiters.splice(i, 1); reject(new Error('Timed out waiting for packet')); } }, timeoutMs).unref();
			});
		},
	};
}

test('ten room slots relay player, boat and speech state; full rooms reject and freed slots reopen', async () => {
	const service = await createOnlineServer({ root: process.cwd(), port: 0 });
	const origin = `http://127.0.0.1:${service.address.port}`;
	const url = `${origin.replace('http', 'ws')}/ws?room=${'c'.repeat(32)}&role=`;
	const clients = [];
	try {
		for (let i = 0; i < 10; i++) {
			const client = await connect(url + (i ? 'guest' : `loz&hostKey=${'d'.repeat(32)}`), origin);
			clients.push(client);
			const welcome = await client.wait((p) => p.type === 'welcome');
			assert.equal(welcome.role, ONLINE_ROLES[i]);
			assert.equal(welcome.playerId, PLAYER_IDS[ONLINE_ROLES[i]]);
			assert.equal(welcome.capacity, 10);
		}
		await clients[0].wait((p) => p.type === 'peer-status' && p.count === 10);
		const hostState = makeState({ playerId: PLAYER_IDS.loz, nodeId: nodeId(1), sequence: 0, player: player(0), boat });
		clients[0].socket.send(JSON.stringify({ type: 'state', state: hostState }));
		for (const guest of clients.slice(1)) assert.deepEqual((await guest.wait((p) => p.type === 'state' && p.state.playerId === PLAYER_IDS.loz)).state.boat, hostState.boat);
		const last = clients[9];
		last.socket.send(JSON.stringify({ type: 'state', state: { ...makeState({ playerId: PLAYER_IDS.guest9, nodeId: nodeId(10), sequence: 0, player: player(9) }), boat: hostState.boat } }));
		await new Promise((resolve) => setTimeout(resolve, 40));
		assert.equal(clients[0].packets.some((p) => p.type === 'state' && p.state.playerId === PLAYER_IDS.guest9), false, 'guest cannot publish a boat');
		last.socket.send(JSON.stringify({ type: 'state', state: makeState({ playerId: PLAYER_IDS.guest9, nodeId: nodeId(10), sequence: 1, player: player(9) }) }));
		for (const peer of clients.slice(0, 9)) await peer.wait((p) => p.type === 'state' && p.state.playerId === PLAYER_IDS.guest9);
		const speech = makeSpeechEvent({ role: 'guest9', nodeId: nodeId(10), text: 'Meet at the pier' });
		last.socket.send(JSON.stringify({ type: 'speech', event: speech }));
		for (const peer of clients) assert.equal((await peer.wait((p) => p.type === 'speech' && p.event.messageId === speech.messageId)).event.text, speech.text);
		const overflow = await connect(url + 'guest', origin);
		clients.push(overflow);
		const closed = await new Promise((resolve) => overflow.socket.once('close', resolve));
		assert.equal(closed, 1008);
		clients[4].socket.close();
		await clients[0].wait((p) => p.type === 'peer-left' && p.playerId === PLAYER_IDS.guest4);
		const replacement = await connect(url + 'guest', origin);
		clients.push(replacement);
		assert.equal((await replacement.wait((p) => p.type === 'welcome')).role, 'guest4');
		clients[0].socket.close();
		await replacement.wait((p) => p.type === 'peer-left' && p.playerId === PLAYER_IDS.loz);
		const impostor = await connect(url + `loz&hostKey=${'e'.repeat(32)}`, origin);
		clients.push(impostor);
		assert.equal(await new Promise((resolve) => impostor.socket.once('close', resolve)), 1008, 'invitation alone cannot claim the helm');
		const returningHost = await connect(url + `loz&hostKey=${'d'.repeat(32)}`, origin);
		clients.push(returningHost);
		assert.equal((await returningHost.wait((p) => p.type === 'welcome')).role, 'loz');
	} finally {
		for (const client of clients) client.socket.terminate();
		await service.close();
	}
});
