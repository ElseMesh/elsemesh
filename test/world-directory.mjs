import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { WorldConnector } from '../src/network/WorldConnector.js';

globalThis.crypto ||= webcrypto;

function canonical( value ) {
	if ( Array.isArray( value ) ) return `[${value.map( canonical ).join( ',' )}]`;
	if ( value && typeof value === 'object' ) return `{${Object.keys( value ).sort().map( ( key ) => `${JSON.stringify( key )}:${canonical( value[ key ] )}` ).join( ',' )}}`;
	return JSON.stringify( value );
}

function base58( bytes ) {
	const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
	let value = 0n;
	for ( const byte of bytes ) value = value * 256n + BigInt( byte );
	let encoded = '';
	while ( value > 0n ) { encoded = alphabet[ Number( value % 58n ) ] + encoded; value /= 58n; }
	for ( const byte of bytes ) { if ( byte !== 0 ) break; encoded = `1${encoded}`; }
	return encoded;
}

async function identity() {
	const pair = await crypto.subtle.generateKey( { name: 'Ed25519' }, true, [ 'sign', 'verify' ] );
	const raw = new Uint8Array( await crypto.subtle.exportKey( 'raw', pair.publicKey ) );
	const protobuf = Uint8Array.from( [ 8, 1, 18, 32, ...raw ] );
	const peerHash = Uint8Array.from( [ 0, protobuf.length, ...protobuf ] );
	return { pair, protobuf, peerId: base58( peerHash ) };
}

async function signedDocument( protocol, payload, id ) {
	const unsigned = { protocol, signer: id.peerId, publicKey: Buffer.from( id.protobuf ).toString( 'base64' ), payload };
	const signature = new Uint8Array( await crypto.subtle.sign( 'Ed25519', id.pair.privateKey, new TextEncoder().encode( canonical( unsigned ) ) ) );
	return { ...unsigned, signature: Buffer.from( signature ).toString( 'base64' ) };
}

function emit( socket, type, data ) {
	const event = new Event( type );
	Object.defineProperty( event, 'data', { value: data } );
	socket.dispatchEvent( event );
}

const first = await identity();
const second = await identity();
const now = Math.floor( Date.now() / 1000 );
const grantEpoch = 4;
const failoverAfter = now - 30;
const failoverSeconds = 120;
const expiresAt = now + 3600;
const providers = [];
for ( const [ id, gateway ] of [ [ first, 'https://offline.example' ], [ second, 'https://online.example' ] ] ) {
	providers.push( await signedDocument( 'tidewater.node/1', {
		protocol: 'tidewater.node/1', nodeId: id.peerId, gateway,
		worldIds: [ 'tw-world:directory-test' ], issuedAt: now, expiresAt: now + 3600,
	}, id ) );
}
let manifest = await signedDocument( 'tidewater.world/1', {
	protocol: 'tidewater.world/1', worldId: 'tw-world:directory-test', ownerPeerId: second.peerId,
	authorityPeerId: second.peerId, authorityEpoch: 1, version: 1, discoverable: true,
	title: 'Directory test', rules: { gravity: 1, avatarComplexity: 1000, physicsProfile: 'tidewater-default' },
	assets: [], objects: [], portals: [], hosts: [ { peerId: first.peerId, scopes: [ 'failover-authority' ], expiresAt, epoch: grantEpoch, failoverAfter, failoverSeconds } ], updatedAt: now,
}, second );
const validManifest = manifest;
let authorityLease = await signedDocument( 'tidewater.authority/2', {
	worldId: 'tw-world:directory-test', authorityPeerId: first.peerId, epoch: 2, grantEpoch,
	notBefore: failoverAfter, expiresAt: Math.min( expiresAt, failoverAfter + failoverSeconds ),
}, first );
const validAuthorityLease = authorityLease;

const oldFetch = globalThis.fetch;
const OldWebSocket = globalThis.WebSocket;
globalThis.fetch = async () => ( { ok: true, json: async () => ( { worldId: 'tw-world:directory-test', providers } ) } );
globalThis.WebSocket = class extends EventTarget {
	static OPEN = 1;
	static CONNECTING = 0;
	static CLOSING = 2;
	static CLOSED = 3;
	constructor( url ) {
		super();
		this.url = String( url );
		this.readyState = WebSocket.CONNECTING;
		queueMicrotask( () => {
			if ( this.url.includes( 'offline.example' ) ) emit( this, 'error' );
			else { this.readyState = WebSocket.OPEN; emit( this, 'open' ); }
		} );
	}
	send( value ) {
		const request = JSON.parse( value );
		if ( request.type === 'connect' ) {
			if ( this.url.includes( 'offline.example' ) || request.targetPeerId === first.peerId ) emit( this, 'message', JSON.stringify( { type: 'error', error: 'world_unreachable' } ) );
			else emit( this, 'message', JSON.stringify( { type: 'connected', worldId: request.worldId } ) );
		}
		else emit( this, 'message', JSON.stringify( { type: 'manifest', worldId: request.worldId, requestId: request.requestId, document: manifest, authorityLease } ) );
	}
	close() { this.readyState = WebSocket.CLOSED; emit( this, 'close' ); }
};

try {
	const connector = new WorldConnector( { worldId: 'tw-world:directory-test', directory: 'https://thruhold.org' } );
	const loaded = await connector.getManifest();
	assert.equal( loaded.worldId, 'tw-world:directory-test' );
	assert.equal( connector.nodeId, second.peerId, 'unreachable directory providers should fall through to the next signed gateway' );
	assert.equal( connector.gateway, 'https://online.example' );
	assert.equal( connector.authorityLease.grantEpoch, grantEpoch, 'signed temporary authority lease binds to its owner grant revision' );
	connector.close();
	authorityLease = await signedDocument( 'tidewater.authority/2', {
		worldId: 'tw-world:directory-test', authorityPeerId: first.peerId, epoch: 2, grantEpoch: grantEpoch - 1,
		notBefore: failoverAfter, expiresAt: Math.min( expiresAt, failoverAfter + failoverSeconds ),
	}, first );
	const stale = new WorldConnector( { worldId: 'tw-world:directory-test', nodeId: second.peerId, gateway: 'https://online.example' } );
	await assert.rejects( stale.getManifest(), /no matching owner grant/, 'browser rejects a validly signed but stale grant epoch' );
	stale.close();
	authorityLease = await signedDocument( 'tidewater.authority/2', {
		worldId: 'tw-world:directory-test', authorityPeerId: first.peerId, epoch: 3, grantEpoch,
		notBefore: failoverAfter, expiresAt: Math.min( expiresAt, failoverAfter + failoverSeconds ),
	}, first );
	const skippedEpoch = new WorldConnector( { worldId: 'tw-world:directory-test', nodeId: second.peerId, gateway: 'https://online.example' } );
	await assert.rejects( skippedEpoch.getManifest(), /Authority lease is not valid/, 'browser requires failover authority to advance exactly one epoch' );
	skippedEpoch.close();
	authorityLease = await signedDocument( 'tidewater.authority/2', {
		worldId: 'tw-world:directory-test', authorityPeerId: first.peerId, epoch: Number.MAX_SAFE_INTEGER + 1, grantEpoch,
		notBefore: failoverAfter, expiresAt: Math.min( expiresAt, failoverAfter + failoverSeconds ),
	}, first );
	const unsafeEpoch = new WorldConnector( { worldId: 'tw-world:directory-test', nodeId: second.peerId, gateway: 'https://online.example' } );
	await assert.rejects( unsafeEpoch.getManifest(), /Authority lease is not valid/, 'browser rejects authority epochs outside JavaScript safe integer range' );
	unsafeEpoch.close();
	authorityLease = validAuthorityLease;
	manifest = await signedDocument( 'tidewater.world/1', {
		protocol: 'tidewater.world/1', worldId: 'tw-world:directory-test', ownerPeerId: second.peerId,
		authorityPeerId: second.peerId, authorityEpoch: Number.MAX_SAFE_INTEGER + 1, version: 1, discoverable: true,
		title: 'Directory test', rules: { gravity: 1, avatarComplexity: 1000, physicsProfile: 'tidewater-default' },
		assets: [], objects: [], portals: [], hosts: [], updatedAt: now,
	}, second );
	const unsafeManifestEpoch = new WorldConnector( { worldId: 'tw-world:directory-test', nodeId: second.peerId, gateway: 'https://online.example' } );
	await assert.rejects( unsafeManifestEpoch.getManifest(), /Manifest authority epoch/, 'browser rejects a manifest epoch outside safe integer range' );
	unsafeManifestEpoch.close();
	manifest = validManifest;
	globalThis.fetch = async ( input ) => {
		assert.equal( new URL( input ).pathname, '/api/lookup' );
		return { ok: true, json: async () => ( { worldId: 'tw-world:directory-test', providers: [ first.peerId, second.peerId ] } ) };
	};
	const dhtFallback = new WorldConnector( { worldId: 'tw-world:directory-test', gateway: 'https://bootstrap.example' } );
	assert.equal( ( await dhtFallback.getManifest() ).worldId, 'tw-world:directory-test' );
	assert.equal( dhtFallback.nodeId, second.peerId, 'DHT lookup should fall through from an unreachable cache to another provider without a directory' );
	dhtFallback.close();
	console.log( 'ok directory node signatures, provider fallback, and owner-signed manifest verification' );
} finally {
	globalThis.fetch = oldFetch;
	if ( OldWebSocket === undefined ) delete globalThis.WebSocket;
	else globalThis.WebSocket = OldWebSocket;
}
