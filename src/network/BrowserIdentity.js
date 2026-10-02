function openDatabase() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('elsemesh-demo-identities', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('keys');
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
function fromStore(db, method, key, value) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction('keys', method === 'get' ? 'readonly' : 'readwrite');
		const request = method === 'get' ? tx.objectStore('keys').get(key) : tx.objectStore('keys').put(value, key);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
import { ONLINE_ROLES } from './PlayerProtocol.js';

export async function browserIdentity(role) {
	if (!ONLINE_ROLES.includes(role)) throw new Error('Invalid role');
	const db = await openDatabase();
	try {
		let pair = await fromStore(db, 'get', role);
		if (!pair) {
			pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
			await fromStore(db, 'put', role, pair);
		}
		const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
		const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', spki));
		return { nodeId: `elsemesh-node:${Array.from(digest, (n) => n.toString(16).padStart(2, '0')).join('')}`, publicKey: pair.publicKey, privateKey: pair.privateKey };
	} finally { db.close(); }
}
