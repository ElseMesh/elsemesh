import { randomUUID } from 'node:crypto';
import { assetId, signObject, verifyObject } from './identity.mjs';

export const PROTOCOL = 'elsemesh';
export const CAPABILITIES = Object.freeze(['elsemesh.peer/1', 'elsemesh.asset/1', 'elsemesh.world-sector/1', 'elsemesh.player-state/1', 'elsemesh.authority/1']);
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const required = (peer, needed) => needed.every((capability) => peer.includes(capability));
const id = (prefix, value) => typeof value === 'string' && new RegExp(`^${prefix}:[a-zA-Z0-9._-]{1,128}$`).test(value);

export function validateEnvelope(message) {
  if (!message || message.protocol !== PROTOCOL || !id('elsemesh-node', message.from) || !id('elsemesh-node', message.to)) throw new Error('Invalid envelope identity');
  if (!['reliable', 'transient'].includes(message.channel) || !Number.isSafeInteger(message.sequence) || message.sequence < 0) throw new Error('Invalid envelope channel/sequence');
  if (typeof message.session !== 'string' || !/^[0-9a-f-]{36}$/.test(message.session)) throw new Error('Invalid session');
  if (Buffer.byteLength(JSON.stringify(message)) > MAX_MESSAGE_BYTES) throw new Error('Oversized message');
  if (typeof message.type !== 'string' || message.type.length > 64) throw new Error('Invalid message type');
  return message;
}

export function envelope(from, to, channel, type, body, sequence, session) {
  return validateEnvelope({ protocol: PROTOCOL, from, to, channel, type, body, sequence, session, sentAt: Date.now() });
}

export class LatestTransient {
  #latest = new Map();
  accept(nodeId, session, sequence) {
    const key = `${nodeId}:${session}`;
    if (sequence <= (this.#latest.get(key) ?? -1)) return false;
    this.#latest.set(key, sequence);
    return true;
  }
}

export class ReplayGuard {
  #seen = new Set();
  #max;
  constructor(max = 4096) { this.#max = max; }
  accept(key) {
    if (this.#seen.has(key)) return false;
    this.#seen.add(key);
    if (this.#seen.size > this.#max) this.#seen.delete(this.#seen.values().next().value);
    return true;
  }
}

export function createHandoff(identity, fields) {
  const { playerId, worldId, sourceSector, targetSector, position, velocity, playerStateHash, inventoryHash, sequence, epoch } = fields;
  if (![playerId, worldId, sourceSector, targetSector].every((v) => id('elsemesh', v)) || ![playerStateHash, inventoryHash].every((v) => /^sha256:[0-9a-f]{64}$/.test(v))) throw new Error('Invalid handoff fields');
  if (![position, velocity].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) throw new Error('Invalid handoff vector');
  if (![sequence, epoch].every((v) => Number.isSafeInteger(v) && v >= 0)) throw new Error('Invalid handoff sequence');
  return signObject({ kind: 'sector-handoff', protocol: PROTOCOL, handoffId: randomUUID(), playerId, worldId, sourceSector, targetSector, position, velocity, playerStateHash, inventoryHash, sequence, epoch, timestamp: Date.now(), sourceAuthority: identity.nodeId }, identity);
}

export function acceptHandoff(handoff, { trustedIds, authority, replay, now = Date.now(), maxAgeMs = 30_000 }) {
  if (!verifyObject(handoff, trustedIds) || handoff.kind !== 'sector-handoff' || handoff.protocol !== PROTOCOL) throw new Error('Bad handoff signature');
  if (handoff.sourceAuthority !== handoff.signer || authority.get(handoff.sourceSector)?.nodeId !== handoff.signer) throw new Error('Wrong sector authority');
  if (!Number.isSafeInteger(handoff.epoch) || handoff.epoch !== authority.get(handoff.sourceSector)?.epoch) throw new Error('Stale authority epoch');
  if (!Number.isFinite(handoff.timestamp) || Math.abs(now - handoff.timestamp) > maxAgeMs) throw new Error('Expired handoff');
  if (!replay.accept(handoff.handoffId)) throw new Error('Replayed handoff');
  return { playerId: handoff.playerId, sectorId: handoff.targetSector, position: handoff.position, velocity: handoff.velocity };
}

export function createManifest(identity, { worldId, sectorId, assets, version = 1 }) {
  if (!id('elsemesh', worldId) || !id('elsemesh', sectorId) || !Number.isSafeInteger(version) || version < 1) throw new Error('Invalid manifest');
  if (!Array.isArray(assets) || assets.length > 1000 || !assets.every((a) => /^sha256:[0-9a-f]{64}$/.test(a.hash) && typeof a.type === 'string' && a.type.length < 80)) throw new Error('Invalid assets');
  return signObject({ kind: 'sector-manifest', protocol: PROTOCOL, worldId, sectorId, version, assets, publisherId: identity.nodeId, createdAt: Date.now() }, identity);
}

export function acceptManifest(manifest, trustedPublishers) {
  if (!verifyObject(manifest, trustedPublishers) || manifest.kind !== 'sector-manifest' || manifest.protocol !== PROTOCOL) throw new Error('Bad manifest signature');
  if (manifest.publisherId !== manifest.signer || !Array.isArray(manifest.assets) || !manifest.assets.every((a) => /^sha256:[0-9a-f]{64}$/.test(a.hash))) throw new Error('Invalid manifest content');
  return manifest;
}

export function acceptAsset(expectedHash, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ASSET_BYTES || assetId(bytes) !== expectedHash) throw new Error('Asset hash mismatch or oversized asset');
  return bytes;
}
