import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WorldConnector } from '../src/network/WorldConnector.js';
import { selectWorldObjectsForView } from '../src/network/WorldStreaming.js';
import { PerspectiveCamera } from '../src/engine/scene/Camera.js';

const connector = new WorldConnector( { worldId: 'tw-world:stream-test', nodeId: 'peer', gateway: 'https://example.test' } );
const priorities = [ 'portal-preview', 'visible', 'nearby', 'background' ];
connector.manifest = { assets: priorities.flatMap( ( priority, index ) => [ { id: `sha256:${String( index * 2 + 1 ).padStart( 64, '0' )}`, priority }, { id: `sha256:${String( index * 2 + 2 ).padStart( 64, '0' )}`, priority } ] ) };
const requested = [];
let active = 0, maxActive = 0;
connector.getAsset = async ( id ) => {
	active ++;
	maxActive = Math.max( maxActive, active );
	requested.push( id );
	await new Promise( ( resolve ) => setTimeout( resolve, 1 ) );
	active --;
	return new Uint8Array( [ 1 ] );
};

const visible = await connector.preload( { through: 'visible', concurrency: 3 } );
assert.equal( visible.size, 4, 'initial load includes preview and visible tiers only' );
assert.deepEqual( requested.map( ( id ) => connector.manifest.assets.find( ( asset ) => asset.id === id ).priority ), [ 'portal-preview', 'portal-preview', 'visible', 'visible' ], 'lower-priority tiers wait for higher-priority assets' );
assert.ok( maxActive <= 3 && maxActive > 1, 'same-tier requests run concurrently with the configured bound' );

requested.length = 0;
await connector.preload( { through: 'background', assetIDs: new Set( [ connector.manifest.assets[ 6 ].id ] ) } );
assert.deepEqual( requested, [ connector.manifest.assets[ 6 ].id ], 'view-driven asset selection can request one asset without fetching unrelated tiers' );

const getAssetMock = connector.getAsset;
connector.getAsset = ( id, { signal } ) => new Promise( ( resolve, reject ) => signal.addEventListener( 'abort', () => reject( signal.reason ), { once: true } ) );
const abortController = new AbortController();
const abortedPreload = connector.preload( { assetIDs: [ connector.manifest.assets[ 0 ].id ], signal: abortController.signal } );
abortController.abort( new DOMException( 'View changed', 'AbortError' ) );
await assert.rejects( abortedPreload, { name: 'AbortError' }, 'view changes can cancel pending asset requests' );
connector.getAsset = getAssetMock;

requested.length = 0;
const remainder = await connector.preload( { after: 'visible', concurrency: 2 } );
assert.equal( remainder.size, 4, 'background load contains nearby and background tiers only' );
assert.deepEqual( requested.map( ( id ) => connector.manifest.assets.find( ( asset ) => asset.id === id ).priority ), [ 'nearby', 'nearby', 'background', 'background' ], 'remainder tiers preserve priority order' );

const camera = new PerspectiveCamera( 60, 1, 0.1, 100 );
camera.position.set( 0, 0, 0 ); camera.lookAt( 0, 0, -1 ); camera.updateMatrixWorld( true );
const objects = [
	{ id: 'front', assetId: 'front', priority: 'visible', transform: { position: [ 0, 0, -10 ], yaw: 0 }, scale: [ 1, 1, 1 ], streamingBounds: { center: [ 0, 0, 0 ], radius: 1 } },
	{ id: 'behind', assetId: 'behind', priority: 'visible', transform: { position: [ 0, 0, 10 ], yaw: 0 }, scale: [ 1, 1, 1 ], streamingBounds: { center: [ 0, 0, 0 ], radius: 1 } },
	{ id: 'side', assetId: 'side', priority: 'visible', transform: { position: [ 20, 0, -10 ], yaw: 0 }, scale: [ 1, 1, 1 ], streamingBounds: { center: [ 0, 0, 0 ], radius: 1 } },
	{ id: 'near', assetId: 'near', priority: 'nearby', transform: { position: [ 0, 0, 3 ], yaw: 0 }, scale: [ 1, 1, 1 ], streamingBounds: { center: [ 0, 0, 0 ], radius: 0.5 } },
	{ id: 'legacy', assetId: 'legacy', priority: 'background', transform: { position: [ 0, 0, 10 ], yaw: 0 }, scale: [ 1, 1, 1 ] },
];
const viewIDs = selectWorldObjectsForView( { assets: [], objects }, camera, { nearbyDistance: 5 } ).map( ( object ) => object.id );
assert.deepEqual( viewIDs, [ 'front', 'near', 'legacy' ], 'view selection includes visible and nearby bounds, excludes behind/outside bounds, and preserves legacy unbounded objects' );

const originalWebTransport = globalThis.WebTransport;
const originalWebSocket = globalThis.WebSocket;
const bytes = new Uint8Array( [ 11, 22, 33, 44, 55, 66 ] );
const assetId = `sha256:${createHash( 'sha256' ).update( bytes ).digest( 'hex' )}`;
const webTransportRequests = [];
const webSocketRequests = [];
let transportMode = 'interrupted-chunk';
let releaseSharedChunk;
const jsonReadable = ( value ) => new ReadableStream( { start( controller ) { controller.enqueue( new TextEncoder().encode( JSON.stringify( value ) ) ); controller.close(); } } );
let transportStream = 0;
class FakeWebTransport {
	constructor() { this.state = 'connected'; this.ready = Promise.resolve(); this.closed = new Promise( () => {} ); }
	close() { this.state = 'closed'; }
	async createBidirectionalStream() {
		const index = transportStream ++;
		let written = '';
		let readableController;
		const readable = new ReadableStream( { start( controller ) { readableController = controller; } } );
		const writable = new WritableStream( { write( chunk ) { written += new TextDecoder().decode( chunk ); }, async close() {
			const request = JSON.parse( written );
			if ( index > 0 ) webTransportRequests.push( request );
			if ( index === 1 && transportMode === 'shared-download' ) await new Promise( ( resolve ) => { releaseSharedChunk = resolve; } );
			if ( index === 2 && transportMode === 'interrupted-chunk' ) readableController.error( new Error( 'stream reset' ) );
			else if ( index === 0 ) readableController.enqueue( new TextEncoder().encode( JSON.stringify( { type: 'connected', worldId: 'tw-world:retry-test' } ) ) );
			else if ( index === 1 && transportMode === 'gateway-error' ) readableController.enqueue( new TextEncoder().encode( JSON.stringify( { type: 'error', requestId: request.requestId, error: 'asset is not available' } ) ) );
			else {
				const chunk = bytes.slice( request.offset, request.offset + request.length );
				const response = { type: 'asset.chunk', requestId: request.requestId, assetId, offset: request.offset, total: bytes.length, chunk: btoa( String.fromCharCode( ...chunk ) ) };
				readableController.enqueue( new TextEncoder().encode( JSON.stringify( response ) ) );
			}
			if ( index !== 2 || transportMode !== 'interrupted-chunk' ) readableController.close();
		} } );
		return { writable, readable };
	}
}
class FakeWebSocket {
	static OPEN = 1;
	constructor() { this.readyState = FakeWebSocket.OPEN; this.listeners = new Map(); queueMicrotask( () => this.#dispatch( 'open' ) ); }
	addEventListener( type, callback ) { const listeners = this.listeners.get( type ) || []; listeners.push( callback ); this.listeners.set( type, listeners ); }
	send( message ) {
		const request = JSON.parse( message );
		if ( request.type === 'connect' ) { queueMicrotask( () => this.#dispatch( 'message', { data: JSON.stringify( { type: 'connected', worldId: request.worldId } ) } ) ); return; }
		webSocketRequests.push( request );
		const chunk = bytes.slice( request.offset, request.offset + request.length );
		queueMicrotask( () => this.#dispatch( 'message', { data: JSON.stringify( { type: 'asset.chunk', requestId: request.requestId, assetId, offset: request.offset, total: bytes.length, chunk: btoa( String.fromCharCode( ...chunk ) ) } ) } ) );
	}
	close() { this.readyState = 3; this.#dispatch( 'close' ); }
	#dispatch( type, event = {} ) { for ( const callback of this.listeners.get( type ) || [] ) callback( event ); }
}
try {
	globalThis.WebTransport = FakeWebTransport;
	globalThis.WebSocket = FakeWebSocket;
	const retryConnector = new WorldConnector( { worldId: 'tw-world:retry-test', nodeId: 'peer', gateway: 'https://example.test', chunkBytes: 3 } );
	retryConnector.manifest = { assets: [ { id: assetId, bytes: bytes.length } ] };
	const downloaded = await retryConnector.getAsset( assetId );
	assert.deepEqual( downloaded, bytes, 'interrupted WebTransport asset chunks recover over WebSocket' );
	assert.deepEqual( webTransportRequests.filter( ( request ) => request.type === 'asset.get' ).map( ( request ) => request.offset ), [ 0, 3 ], 'WebTransport delivered the first chunk before failing on the second' );
	assert.deepEqual( webSocketRequests.map( ( request ) => request.offset ), [ 3 ], 'WebSocket retries only the interrupted chunk' );
	assert.equal( webSocketRequests[ 0 ].requestId, webTransportRequests[ 1 ].requestId, 'transport fallback preserves the original idempotent request id' );
	retryConnector.close();
	transportStream = 0;
	webTransportRequests.length = 0;
	transportMode = 'shared-download';
	const sharedConnector = new WorldConnector( { worldId: 'tw-world:retry-test', nodeId: 'peer', gateway: 'https://example.test', chunkBytes: 3 } );
	sharedConnector.manifest = { assets: [ { id: assetId, bytes: bytes.length } ] };
	const firstCallerAbort = new AbortController();
	const firstCaller = sharedConnector.getAsset( assetId, { signal: firstCallerAbort.signal } );
	const secondCaller = sharedConnector.getAsset( assetId );
	await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
	assert.equal( webTransportRequests.filter( ( request ) => request.type === 'asset.get' ).length, 1, 'overlapping consumers share one in-flight asset request' );
	firstCallerAbort.abort( new DOMException( 'View changed', 'AbortError' ) );
	await assert.rejects( firstCaller, { name: 'AbortError' }, 'a canceled consumer stops waiting for the shared asset' );
	releaseSharedChunk();
	assert.deepEqual( await secondCaller, bytes, 'remaining consumers keep the shared transfer alive to completion' );
	assert.equal( webTransportRequests.filter( ( request ) => request.type === 'asset.get' ).length, 2, 'the shared transfer requests each asset chunk once' );
	assert.equal( webSocketRequests.length, 1, 'a remaining consumer completes over the shared WebTransport session' );
	sharedConnector.close();
	transportStream = 0;
	transportMode = 'gateway-error';
	const requestCount = webSocketRequests.length;
	const errorConnector = new WorldConnector( { worldId: 'tw-world:retry-test', nodeId: 'peer', gateway: 'https://example.test', chunkBytes: 3 } );
	errorConnector.manifest = { assets: [ { id: assetId, bytes: bytes.length } ] };
	await assert.rejects( errorConnector.getAsset( assetId ), /asset is not available/, 'a gateway error response remains an application error' );
	assert.equal( webSocketRequests.length, requestCount, 'gateway errors do not trigger transport fallback' );
	errorConnector.close();
} finally {
	if ( originalWebTransport === undefined ) delete globalThis.WebTransport; else globalThis.WebTransport = originalWebTransport;
	if ( originalWebSocket === undefined ) delete globalThis.WebSocket; else globalThis.WebSocket = originalWebSocket;
}
console.log( 'ok   view-driven streaming priorities and interrupted WebTransport recovery' );
