import { WebSocketServer, WebSocket } from 'ws';
import { loadOrCreateIdentity } from '../../network/identity.mjs';
import { TcpUdpTransport } from '../../network/tcp-udp-transport.mjs';
import { PLAYER_IDS, validateState } from '../../src/network/PlayerProtocol.js';
import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).filter((v) => v.startsWith('--')).map((flag) => [flag.slice(2), process.argv[process.argv.indexOf(flag) + 1]]));
if (!['loz', 'ed'].includes(args.role) || !args.identity || !args.trust || !args.peer) throw new Error('Usage: --role loz|ed --identity PATH --trust PATH --peer NODEID [--listen PORT] [--connect HOST:PORT]');
const identity = await loadOrCreateIdentity(args.identity);
const trustedIds = new Set(JSON.parse(await readFile(args.trust, 'utf8')).map((entry) => entry.nodeId));
if (!trustedIds.has(identity.nodeId) || !trustedIds.has(args.peer) || args.peer === identity.nodeId) throw new Error('Invalid trust pair');
const network = new TcpUdpTransport({ identity, trustedIds, port: Number(args.listen || 0) });
await network.start_node();
const localRole = args.role, remoteRole = localRole === 'loz' ? 'ed' : 'loz';
const clients = new Set();
const wss = new WebSocketServer({ host: '127.0.0.1', port: 42903, maxPayload: 8192 });
const emit = (event) => console.log(JSON.stringify({ time: new Date().toISOString(), nodeId: identity.nodeId, ...event }));
function broadcast(packet) { const data = JSON.stringify(packet); for (const client of clients) if (client.readyState === WebSocket.OPEN) client.send(data); }

wss.on('connection', (client, request) => {
	const origin = request.headers.origin || '';
	if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return client.close(1008, 'Local origin only');
	clients.add(client);
	client.send(JSON.stringify({ type: 'hello', role: localRole, nodeId: identity.nodeId, peerNodeId: args.peer, connected: !!network.connection_metrics(args.peer) }));
	client.on('message', async (bytes) => {
		try {
			if (bytes.length > 8192) throw new Error('Oversized browser message');
			const packet = JSON.parse(bytes.toString());
			if (packet.type !== 'state') return;
			const state = validateState(packet.state);
			if (state.nodeId !== identity.nodeId || state.playerId !== PLAYER_IDS[localRole]) throw new Error('Wrong local origin');
			if (!network.connection_metrics(args.peer)) return;
			await network.send_unreliable(args.peer, 'player-state', state);
			emit({ event: 'state-sent', playerId: state.playerId, sequence: state.sequence, observedRemoteSequence: state.observedRemoteSequence, sectorId: state.sectorId });
		} catch (error) { emit({ event: 'browser-state-rejected', reason: error.message }); }
	});
	client.on('close', () => clients.delete(client));
});
network.on('message', (message) => {
	if (message.type !== 'player-state' || message.from !== args.peer || message.channel !== 'transient') return;
	try {
		const state = validateState(message.body);
		if (state.nodeId !== args.peer || state.playerId !== PLAYER_IDS[remoteRole]) throw new Error('Wrong peer origin');
		broadcast({ type: 'state', state });
		emit({ event: 'state-received', playerId: state.playerId, sequence: state.sequence, observedRemoteSequence: state.observedRemoteSequence, sectorId: state.sectorId });
	} catch (error) { emit({ event: 'network-state-rejected', reason: error.message }); }
});
network.on('peer', (id) => { if (id === args.peer) { broadcast({ type: 'peer-status', connected: true }); emit({ event: 'peer-connected', peerNodeId: id }); } });
network.on('disconnect', (id) => { if (id === args.peer) { broadcast({ type: 'peer-status', connected: false }); emit({ event: 'peer-disconnected', peerNodeId: id }); } });

if (args.connect) {
	const [host, port] = args.connect.split(':');
	const retry = async () => {
		if (network.connection_metrics(args.peer)) return;
		try { await network.connect_peer(args.peer, { host, port: Number(port) }); } catch (error) { emit({ event: 'connect-pending', reason: error.message }); }
	};
	await retry();
	setInterval(retry, 3000);
}
emit({ event: 'bridge-ready', role: localRole, listenPort: network.local_addresses()[0].port, websocketPort: 42903 });
