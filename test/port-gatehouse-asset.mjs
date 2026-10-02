import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const file = new URL('../public/models/port/bracken-gatehouse.glb', import.meta.url);
const bytes = readFileSync(file);
const hash = createHash('sha256').update(bytes).digest('hex');
const expected = '5790c83aa43ac623e9b07077c843714b16af4ac328957448622a2d81a4251cc5';

test('physically produced port gatehouse asset is pinned and browser-bounded', () => {
  assert.equal(hash, expected);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.extensionsRequired?.length ?? 0, 0);
  assert.ok(json.meshes.length > 0 && json.meshes.length <= 12);
  assert.ok(json.materials.length > 0 && json.materials.length <= 12);
  assert.equal(json.images?.length ?? 0, 0);
  assert.ok(json.buffers.every(buffer => !buffer.uri));
});
