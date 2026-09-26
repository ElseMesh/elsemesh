import { WebSocketServer } from 'ws';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const path = process.argv[2];
if (!path) throw new Error('Usage: node evidence-receiver.mjs OUTPUT.webm');
mkdirSync(dirname(path), { recursive: true });
const server = new WebSocketServer({ host: '127.0.0.1', port: 42907, maxPayload: 8 * 1024 * 1024 });
server.on('connection', (socket, request) => {
	if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.origin || '')) return socket.close(1008, 'Local origin only');
	const output = createWriteStream(path, { flags: 'wx' });
	socket.on('message', (bytes) => output.write(bytes));
	socket.on('close', () => output.end());
	console.log(JSON.stringify({ event: 'recording', path }));
});
console.log(JSON.stringify({ event: 'listening', port: 42907 }));
