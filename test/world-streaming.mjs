import assert from 'node:assert/strict';
import { WorldConnector } from '../src/network/WorldConnector.js';

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
const remainder = await connector.preload( { after: 'visible', concurrency: 2 } );
assert.equal( remainder.size, 4, 'background load contains nearby and background tiers only' );
assert.deepEqual( requested.map( ( id ) => connector.manifest.assets.find( ( asset ) => asset.id === id ).priority ), [ 'nearby', 'nearby', 'background', 'background' ], 'remainder tiers preserve priority order' );
console.log( 'ok   staged world asset priority and bounded concurrency' );
