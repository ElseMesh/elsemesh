import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { roomSecurity, roomForHostKey, sendBounded, MAX_BUFFERED_BYTES } from '../tools/networking/RoomSecurity.mjs';
import { createOnlineServer } from '../tools/networking/online-server.mjs';
import { makeState } from '../src/network/PlayerProtocol.js';

test('plaintext listener is loopback-only; production requires exact HTTPS origin', () => {
	for (const host of ['0.0.0.0', '::', '192.0.2.10', 'localhost']) assert.throws(() => roomSecurity({ host }));
	assert.throws(() => roomSecurity({ host: '127.0.0.1', production: true }));
	for (const publicOrigin of ['http://game.test', 'https://game.test/', 'https://user:pass@game.test', 'https://game.test/path']) assert.throws(() => roomSecurity({ host: '127.0.0.1', publicOrigin }));
	const policy = roomSecurity({ host: '127.0.0.1', publicOrigin: 'https://game.test', production: true });
	assert.equal(policy.accept({ headers: { host: 'game.test', origin: 'https://game.test' } }, 0), true);
	for (const origin of ['https://game.test.evil.test', 'http://game.test', 'null', undefined]) assert.equal(policy.accept({ headers: { host: 'game.test', origin } }, 0), false);
});

test('outgoing queue budget terminates slow consumers without another send', () => {
	let sent = 0, terminated = 0;
	const peer = { readyState: 1, bufferedAmount: MAX_BUFFERED_BYTES, send() { sent++; }, terminate() { terminated++; } };
	assert.equal(sendBounded(peer, 'x'), false); assert.equal(sent, 0); assert.equal(terminated, 1);
	peer.bufferedAmount = 0;
	assert.equal(sendBounded(peer, 'x'), true); assert.equal(sent, 1);
});

async function fixture(t) {
	const service = await createOnlineServer({ root: process.cwd(), port: 0 });
	t.after(() => service.close());
	const origin = `http://127.0.0.1:${service.address.port}`;
	return { service, origin, url: `${origin.replace('http', 'ws')}/ws` };
}
async function connect(url, origin, join) {
	const ws = new WebSocket(url, { origin });
	const messages = []; ws.on('message', bytes => messages.push(JSON.parse(bytes)));
	await once(ws, 'open');
	if (join) ws.send(JSON.stringify(join));
	return { ws, messages };
}
async function until(predicate) {
	const end = Date.now() + 2000;
	while (!predicate()) { if (Date.now() > end) throw Error('Expected message missing'); await new Promise(r => setTimeout(r, 5)); }
}

test('real upgrade rejects spoofed origin/host and credential query strings', async t => {
	const { url, origin } = await fixture(t);
	for (const [address, options] of [[url, { origin: 'https://evil.test', headers: { Host: 'evil.test' } }], [url + '?hostKey=secret', { origin }], [url, {}]]) {
		const ws = new WebSocket(address, options);
		const [error] = await once(ws, 'error');
		assert.match(error.message, /403/);
	}
});

test('guest joining first cannot grant an arbitrary key host authority', async t => {
	const { url, origin } = await fixture(t);
	const hostKey = 'a'.repeat(32), room = roomForHostKey(hostKey);
	const guest = await connect(url, origin, { type: 'join', room, role: 'guest' });
	await until(() => guest.messages.some(p => p.type === 'welcome'));
	const attacker = await connect(url, origin);
	const closed = once(attacker.ws, 'close');
	attacker.ws.send(JSON.stringify({ type: 'join', room, role: 'loz', hostKey: 'b'.repeat(32) }));
	assert.equal((await closed)[0], 1008);
	const host = await connect(url, origin, { type: 'join', room, role: 'loz', hostKey });
	await until(() => host.messages.some(p => p.type === 'welcome' && p.role === 'loz'));
});

test('server discards duplicate and stale sequences before state side effects', async t => {
	const { url, origin } = await fixture(t);
	const room = 'c'.repeat(32);
	const a = await connect(url, origin, { type: 'join', room, role: 'ed' });
	const b = await connect(url, origin, { type: 'join', room, role: 'guest' });
	await until(() => b.messages.some(p => p.type === 'welcome'));
	const state = makeState({ playerId: 'player:ed', nodeId: `elsemesh-node:${'a'.repeat(64)}`, sequence: 3, player: { position: { x: 50, y: 2, z: -70 }, yaw: 0, mode: 'walk', velocity: { lengthSq: () => 0 } } });
	for (const sequence of [3, 3, 2, 4]) a.ws.send(JSON.stringify({ type: 'state', state: { ...state, sequence } }));
	await until(() => b.messages.some(p => p.state?.sequence === 4));
	assert.deepEqual(b.messages.filter(p => p.type === 'state').map(p => p.state.sequence), [3, 4]);
});

test('binary and oversized frames close the client without crashing server', async t => {
	const { url, origin } = await fixture(t);
	for (const oversized of [false, true]) {
		const client = await connect(url, origin, { type: 'join', room: 'd'.repeat(32), role: 'guest' });
		await until(() => client.messages.some(p => p.type === 'welcome'));
		const closed = once(client.ws, 'close');
		client.ws.send(oversized ? 'x'.repeat(8193) : Buffer.from('binary'));
		assert.equal((await closed)[0], oversized ? 1009 : 1003);
	}
});
