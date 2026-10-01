import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { accountConfiguration, createAccountProofMessage } from '../src/network/AccountClient.js';

assert.equal( accountConfiguration(), null, 'account sign-in stays disabled without explicit deployment config' );
assert.equal( accountConfiguration( { accountd: 'http://accounts.example.org', googleClientId: 'client' } ), null, 'account broker must use HTTPS' );
assert.equal( accountConfiguration( { accountd: 'https://user:pass@accounts.example.org', googleClientId: 'client' } ), null, 'account broker URL must not contain credentials' );
assert.equal( accountConfiguration( { accountd: 'https://accounts.example.org/api?debug=1', googleClientId: 'client' } ), null, 'account broker URL must not contain query parameters' );
assert.deepEqual( accountConfiguration( { accountd: 'https://accounts.example.org/accountd/', googleClientId: '  client-id  ' } ), {
	accountd: 'https://accounts.example.org/accountd', googleClientId: 'client-id',
}, 'valid account settings are normalized' );

const challenge = { challengeId: 'one-time-id', nonce: 'fresh-nonce' };
const message = createAccountProofMessage( challenge, 'https://game.example' );
assert.equal( new TextDecoder().decode( message ), 'elsemesh.account-proof/1\none-time-id\nfresh-nonce\nhttps://game.example', 'proof message matches accountd protocol bytes' );
const pair = await webcrypto.subtle.generateKey( { name: 'Ed25519' }, false, [ 'sign', 'verify' ] );
const signature = await webcrypto.subtle.sign( { name: 'Ed25519' }, pair.privateKey, message );
assert.equal( await webcrypto.subtle.verify( { name: 'Ed25519' }, pair.publicKey, signature, message ), true, 'non-extractable account key signs the expected message' );
assert.equal( pair.privateKey.extractable, false, 'account private key is non-extractable' );
assert.equal( pair.publicKey.extractable, true, 'account public key remains exportable for broker registration' );

console.log( 'Browser account client configuration and proof protocol passed.' );
