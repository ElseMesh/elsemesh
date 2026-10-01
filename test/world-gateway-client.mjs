import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WorldConnector } from '../src/network/WorldConnector.js';

const [ worldID, ownerPeerID, cachePeerID, gateway, assetID, assetPath ] = process.argv.slice( 2 );
const connector = new WorldConnector( { worldId: worldID, nodeId: ownerPeerID, gateway, chunkBytes: 64 * 1024 } );

try {
	const manifest = await connector.getManifest();
	assert.equal( manifest.ownerPeerId, ownerPeerID, 'connector verifies the owner-signed manifest through HTTPS/WSS' );
	assert.equal( connector.nodeId, ownerPeerID, 'initial manifest is served by the requested owner peer' );
	process.send( { type: 'manifest-ready' } );
	await new Promise( ( resolve, reject ) => {
		const timeout = setTimeout( () => reject( new Error( 'owner shutdown signal timed out' ) ), 15000 );
		process.once( 'message', ( message ) => {
			clearTimeout( timeout );
			if ( message?.type === 'owner-stopped' ) resolve();
			else reject( new Error( 'unexpected parent test message' ) );
		} );
	} );

	const downloaded = await connector.getAsset( assetID );
	const expected = await readFile( assetPath );
	assert.deepEqual( Buffer.from( downloaded ), expected, 'connector verifies the recovered content-addressed asset hash' );
	assert.equal( connector.nodeId, cachePeerID, 'provider recovery selects the live cache peer after owner shutdown' );
	assert.equal( connector.manifest.ownerPeerId, ownerPeerID, 'cache serves the unchanged owner-signed manifest' );
	process.send( { type: 'result', ok: true, recoveredFrom: connector.nodeId } );
} catch ( error ) {
	process.send( { type: 'result', ok: false, error: error.stack || String( error ) } );
	process.exitCode = 1;
} finally {
	connector.close();
}
