import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AgentInput } from '../src/network/AgentInput.js';
import { makeState, RemoteState, validateState } from '../src/network/PlayerProtocol.js';

const lozNode = `bh-node:${'a'.repeat(64)}`;
const edNode = `bh-node:${'b'.repeat(64)}`;
const player = (x, z, moving = true) => ({ position: { x, y: 0, z }, yaw: 0, mode: 'walk', velocity: { lengthSq: () => moving ? 1 : 0 } });

test('two player identities and node identities remain distinct', () => {
	const loz = makeState({ playerId: 'player:loz', nodeId: lozNode, sequence: 1, player: player(1, 2) });
	const ed = makeState({ playerId: 'player:ed', nodeId: edNode, sequence: 1, player: player(8, 2) });
	assert.notEqual(loz.playerId, ed.playerId);
	assert.notEqual(loz.nodeId, ed.nodeId);
	assert.deepEqual(validateState(JSON.parse(JSON.stringify(loz))), loz);
	assert.throws(() => validateState({ ...loz, position: [Infinity, 0, 0] }), /position/);
	assert.throws(() => validateState({ ...loz, sectorId: 'bh:OTHER' }), /sector/);
});

test('remote sequence and interpolation reject stale movement', () => {
	const remote = new RemoteState({ ownPlayerId: 'player:loz', ownNodeId: lozNode });
	const first = makeState({ playerId: 'player:ed', nodeId: edNode, sequence: 1, player: player(0, 0) });
	const second = makeState({ playerId: 'player:ed', nodeId: edNode, sequence: 2, player: player(10, 0) });
	assert.equal(remote.observe(first), true);
	assert.equal(remote.observe(second), true);
	assert.equal(remote.observe(first), false);
	assert.equal(remote.interpolated(first, 0.5).position[0], 5);
	assert.throws(() => remote.observe({ ...second, sequence: 3, nodeId: lozNode }), /Self/);
});

test('verification requires bidirectional advanced sequences and same world sector', () => {
	const remote = new RemoteState({ ownPlayerId: 'player:loz', ownNodeId: lozNode });
	remote.markSent(2);
	remote.observe(makeState({ playerId: 'player:ed', nodeId: edNode, sequence: 1, player: player(0, 0), observedRemoteSequence: 0 }));
	assert.equal(remote.verified(), false);
	remote.observe(makeState({ playerId: 'player:ed', nodeId: edNode, sequence: 2, player: player(1, 0), observedRemoteSequence: 2 }));
	assert.equal(remote.verified(), true);
});

test('Ed uses the Player input contract to turn and follow, then stop', () => {
	const p = player(0, 0);
	const input = new AgentInput(p);
	input.follow_player();
	input.setTarget({ position: [0, 0, -10] });
	assert.equal(input.moveAxes().y, 1);
	assert.equal(input.consumeLook(1 / 60).x, 0);
	input.setTarget({ position: [0, 0, -2] });
	assert.equal(input.moveAxes().y, 0);
	input.stop();
	assert.equal(input.moveAxes().y, 0);
});
