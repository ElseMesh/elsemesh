import assert from 'node:assert/strict';
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
console.log( 'ok   view-driven object streaming, staged priorities, and bounded concurrency' );
