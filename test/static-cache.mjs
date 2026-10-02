// Agent Control: returning players revalidate assets; compressed responses preserve source bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOnlineServer } from '../tools/networking/online-server.mjs';
test('static asset cache, gzip and HEAD semantics', async () => {
	const service = await createOnlineServer({ root: process.cwd(), port: 0 });
	try {
		const url = `http://127.0.0.1:${service.address.port}/package.json`;
		const r = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
		assert.equal(r.status, 200); assert.equal(r.headers.get('content-encoding'), 'gzip');
		assert.equal(await r.text(), await readFile('package.json', 'utf8'));
		const cached = await fetch(url, { headers: { 'If-None-Match': r.headers.get('etag') } });
		assert.equal(cached.status, 304); assert.equal(await cached.text(), '');
		const head = await fetch(url, { method: 'HEAD', headers: { 'Accept-Encoding': 'identity' } });
		assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert(+head.headers.get('content-length') > 0);
	} finally { await service.close(); }
});
