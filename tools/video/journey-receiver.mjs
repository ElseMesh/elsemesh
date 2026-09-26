import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'artifacts', 'video');
fs.mkdirSync(output, { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5189');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method === 'GET' && req.url === '/script') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' })
      .end(fs.readFileSync(path.join(root, 'tools', 'video', 'journey-capture.js')));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/capture') { res.writeHead(404).end(); return; }
  const target = path.join(output, 'island-journey-capture.webm');
  const file = fs.createWriteStream(target);
  req.pipe(file);
  file.on('finish', () => res.writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ ok: true, bytes: fs.statSync(target).size })));
}).listen(5190, '127.0.0.1', () => console.log('Journey capture receiver ready on 5190'));
