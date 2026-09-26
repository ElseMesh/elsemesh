import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { createOnlineServer } from '../tools/networking/online-server.mjs';
import { makeSpeechEvent, validateSpeechEvent } from '../src/network/SpeechProtocol.js';
import { makeState, validateState } from '../src/network/PlayerProtocol.js';

const node = (c) => `bh-node:${c.repeat(64)}`;
const player = (mode = 'walk') => ({ position: { x: 53, y: 2, z: -70 }, yaw: 0, mode, velocity: { lengthSq: () => 0 }, deckPos: { x: 0.4, y: 0.35, z: -1.5 } });
const waitFor = (ws, predicate) => new Promise((resolve, reject) => {
	const timeout = setTimeout(() => { ws.off('message', receive); reject(new Error('Timed out')); }, 2500);
	const receive = (data) => { const packet = JSON.parse(data); if (!predicate(packet)) return; clearTimeout(timeout); ws.off('message', receive); resolve(packet); };
	ws.on('message', receive);
});
const connect = (base, room, role) => new Promise((resolve, reject) => {
	const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room}&role=${role}${role === 'loz' ? `&hostKey=${'d'.repeat(32)}` : ''}`, { origin: base });
	ws.once('open', () => resolve(ws)); ws.once('error', reject);
});

test('speech schema and host boat state reject invalid authority', () => {
	const event = makeSpeechEvent({ role: 'loz', nodeId: node('a'), text: 'Hello Ed' });
	assert.equal(validateSpeechEvent(event).text, 'Hello Ed');
	assert.throws(() => validateSpeechEvent({ ...event, speakerPlayerId: 'player:ed' }));
	const boat = { position: { x: 51, y: 0, z: -71 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, velocity: { x: 1, y: 0, z: 0 }, driven: true };
	const state = makeState({ playerId: 'player:loz', nodeId: node('a'), sequence: 1, player: player('deck'), boat });
	assert.deepEqual(validateState(state).deckLocal, [0.4, 0.35, -1.5]);
	assert.equal(state.boat.driven, true);
	assert.throws(() => validateState({ ...state, playerId: 'player:ed' }));
});

test('both room peers receive speech and voice; duplicate speech produces one synthesis', async () => {
	let syntheses = 0;
	const wav = Buffer.from('RIFF0000WAVEfmt  ');
	const service = await createOnlineServer({ root: process.cwd(), port: 0, speechProvider: {
		async synthesize() { syntheses++; return { audio: wav, mime: 'audio/wav', provider: 'test', synthesisMs: 12, durationSeconds: 0.1 }; },
	} });
	const base = `http://127.0.0.1:${service.address.port}`;
	const room = 'c'.repeat(32);
	const sockets = [];
	try {
		const host = await connect(base, room, 'loz'); sockets.push(host);
		const guest = await connect(base, room, 'ed'); sockets.push(guest);
		const hostState = waitFor(host, (p) => p.type === 'state');
		host.send(JSON.stringify({ type: 'state', state: makeState({ playerId: 'player:loz', nodeId: node('a'), sequence: 1, player: player() }) }));
		guest.send(JSON.stringify({ type: 'state', state: makeState({ playerId: 'player:ed', nodeId: node('b'), sequence: 1, player: player() }) }));
		await hostState;
		const event = makeSpeechEvent({ role: 'loz', nodeId: node('a'), text: 'Ed, can you hear me?' });
		const hostText = waitFor(host, (p) => p.type === 'speech');
		const guestText = waitFor(guest, (p) => p.type === 'speech');
		const guestAudio = waitFor(guest, (p) => p.type === 'speech-audio');
		host.send(JSON.stringify({ type: 'speech', event }));
		assert.equal((await hostText).event.text, event.text);
		assert.equal((await guestText).event.messageId, event.messageId);
		assert.equal((await guestAudio).audio, wav.toString('base64'));
		host.send(JSON.stringify({ type: 'speech', event }));
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.equal(syntheses, 1);
	} finally { for (const ws of sockets) ws.terminate(); await service.close(); }
});
