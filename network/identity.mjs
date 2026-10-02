import { createHash, generateKeyPairSync, sign, verify, createPublicKey } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const assetId = (bytes) => `sha256:${sha256(bytes)}`;
export const nodeId = (publicKeyPem) => `elsemesh-node:${sha256(createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' }))}`;

export function newIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  return {
    nodeId: nodeId(publicKeyPem), publicKeyPem,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

export async function loadOrCreateIdentity(path) {
  try {
    const saved = JSON.parse(await readFile(path, 'utf8'));
    if (nodeId(saved.publicKeyPem) !== saved.nodeId || !saved.privateKeyPem) throw new Error('Invalid saved identity');
    const probe = Buffer.from('elsemesh-key-check');
    if (!verify(null, probe, saved.publicKeyPem, sign(null, probe, saved.privateKeyPem))) throw new Error('Keypair mismatch');
    return saved;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const identity = newIdentity();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
    return identity;
  }
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function signObject(value, identity) {
  const payload = { ...value, signer: identity.nodeId, publicKey: identity.publicKeyPem };
  return { ...payload, signature: sign(null, Buffer.from(canonical(payload)), identity.privateKeyPem).toString('base64') };
}

export function verifyObject(signed, trustedIds) {
  if (!signed || typeof signed !== 'object' || typeof signed.publicKey !== 'string' || typeof signed.signature !== 'string') return false;
  const { signature, ...payload } = signed;
  try {
    if (nodeId(signed.publicKey) !== signed.signer || !trustedIds.has(signed.signer)) return false;
    return verify(null, Buffer.from(canonical(payload)), signed.publicKey, Buffer.from(signature, 'base64'));
  } catch { return false; }
}
