import { readFile } from 'node:fs/promises';
import { loadOrCreateIdentity, assetId } from '../../network/identity.mjs';
import { TcpUdpTransport } from '../../network/tcp-udp-transport.mjs';
import { acceptAsset, acceptHandoff, acceptManifest, createHandoff, createManifest, ReplayGuard } from '../../network/protocol.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((_, i, arr) => arr[i].startsWith('--')).map((flag) => [flag.slice(2), process.argv[process.argv.indexOf(flag) + 1]]));
const mode = process.argv[2];
if (!['init', 'serve', 'probe'].includes(mode) || !args.identity) throw new Error('Usage: node peer-demo.mjs init|serve|probe --identity PATH [--trust PATH --host HOST --port PORT --peer NODEID]');
const identity = await loadOrCreateIdentity(args.identity);
if (mode === 'init') {
  console.log(JSON.stringify({ nodeId: identity.nodeId, publicKeyPem: identity.publicKeyPem }));
  process.exit(0);
}
const trust = JSON.parse(await readFile(args.trust, 'utf8'));
const trustedIds = new Set(trust.map((entry) => entry.nodeId));
if (!trustedIds.has(identity.nodeId)) throw new Error('Local identity absent from trust file');
const transport = new TcpUdpTransport({ identity, trustedIds, host: mode === 'serve' ? '0.0.0.0' : '0.0.0.0', port: mode === 'serve' ? Number(args.port) : 0 });
const sampleAsset = Buffer.from('ElseMesh bounded two-node asset proof v1');
const sampleHash = assetId(sampleAsset);
const authority = new Map([['elsemesh:SEA-01', { nodeId: mode === 'serve' ? trust.find((e) => e.nodeId !== identity.nodeId).nodeId : identity.nodeId, epoch: 1 }]]);
const replay = new ReplayGuard();
const start = Date.now();

function waitFor(type, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { transport.off?.('message', listener); reject(new Error(`Timeout waiting for ${type}`)); }, timeout);
    const listener = (message) => {
      if (message.type === type) { clearTimeout(timer); transport.off?.('message', listener); resolve(message); }
    };
    transport.on('message', listener);
  });
}

await transport.start_node();
if (mode === 'serve') {
  console.log(JSON.stringify({ event: 'listening', nodeId: identity.nodeId, port: transport.local_addresses()[0].port }));
  transport.on('message', async (message) => {
    try {
      if (message.type === 'ping') await transport.send_reliable(message.from, 'pong', { nonce: message.body.nonce });
      if (message.type === 'position') await transport.send_unreliable(message.from, 'position-ack', { sequence: message.sequence });
      if (message.type === 'asset-request' && message.body.hash === sampleHash) await transport.send_reliable(message.from, 'asset-reply', { hash: sampleHash, bytes: sampleAsset.toString('base64') });
      if (message.type === 'manifest') {
        const accepted = acceptManifest(message.body, trustedIds);
        await transport.send_reliable(message.from, 'manifest-ack', { sector: accepted.sectorId });
      }
      if (message.type === 'handoff') {
        const accepted = acceptHandoff(message.body, { trustedIds, authority, replay });
        await transport.send_reliable(message.from, 'handoff-ack', { playerId: accepted.playerId, sector: accepted.sectorId });
      }
    } catch (error) { console.error(JSON.stringify({ event: 'rejected', type: message.type, reason: error.message })); }
  });
} else {
  const peer = args.peer;
  const host = args.host;
  const port = Number(args.port);
  await transport.connect_peer(peer, { host, port });
  const establishedMs = Date.now() - start;
  const pongs = [];
  for (let i = 0; i < 8; i++) {
    const promise = waitFor('pong');
    const sent = performance.now();
    await transport.send_reliable(peer, 'ping', { nonce: i });
    const reply = await promise;
    if (reply.body.nonce !== i) throw new Error('Ping nonce mismatch');
    pongs.push(performance.now() - sent);
  }
  const transientPromise = waitFor('position-ack');
  await transport.send_unreliable(peer, 'position', { x: 1, y: 2, z: 3 });
  await transientPromise;
  const assetPromise = waitFor('asset-reply');
  await transport.send_reliable(peer, 'asset-request', { hash: sampleHash });
  const assetReply = await assetPromise;
  acceptAsset(sampleHash, Buffer.from(assetReply.body.bytes, 'base64'));
  let corruptRejected = false;
  try { acceptAsset(sampleHash, Buffer.from('corrupt')); } catch { corruptRejected = true; }
  const manifest = createManifest(identity, { worldId: 'elsemesh:elsemesh', sectorId: 'elsemesh:SEA-01', assets: [{ hash: sampleHash, type: 'application/octet-stream' }] });
  const manifestPromise = waitFor('manifest-ack');
  await transport.send_reliable(peer, 'manifest', manifest);
  await manifestPromise;
  const handoff = createHandoff(identity, { playerId: 'elsemesh:player-demo', worldId: 'elsemesh:elsemesh', sourceSector: 'elsemesh:SEA-01', targetSector: 'elsemesh:UNDERNEATH-01', position: [0, 0, 0], velocity: [1, 0, 0], playerStateHash: sampleHash, inventoryHash: sampleHash, sequence: 1, epoch: 1 });
  const handoffPromise = waitFor('handoff-ack');
  await transport.send_reliable(peer, 'handoff', handoff);
  await handoffPromise;
  const metrics = transport.connection_metrics(peer);
  console.log(JSON.stringify({ event: 'probe-complete', localNodeId: identity.nodeId, peerNodeId: peer, route: { host, port }, establishedMs, rttMs: { min: Math.min(...pongs), median: [...pongs].sort((a, b) => a - b)[4], max: Math.max(...pongs) }, transientAck: true, assetHash: sampleHash, assetVerified: true, corruptRejected, manifestAccepted: true, handoffAccepted: true, metrics }));
  await transport.stop_node();
}
