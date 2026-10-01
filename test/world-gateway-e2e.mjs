import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldConnector } from '../src/network/WorldConnector.js';

const projectRoot = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const daemonDir = path.join( projectRoot, 'server', 'worldd' );
const tempDirectory = process.env.PREFIX ? path.join( process.env.PREFIX, 'tmp' ) : '/var/tmp';
const tempRoot = await mkdtemp( path.join( tempDirectory, 'elsemesh-world-gateway-' ) );
const processes = [];

try {
	const binary = path.join( tempRoot, 'worldd' );
	const build = spawnSync( 'go', [ 'build', '-o', binary, '.' ], { cwd: daemonDir, encoding: 'utf8', timeout: 180000, env: { ...process.env, GOCACHE: path.join( tempDirectory, 'elsemesh-go-build-cache' ) } } );
	assert.equal( build.status, 0, `worldd build failed:\n${build.stdout}\n${build.stderr}` );

	const ownerData = path.join( tempRoot, 'owner' );
	const cacheData = path.join( tempRoot, 'cache' );
	await Promise.all( [ mkdir( ownerData, { recursive: true, mode: 0o700 } ), mkdir( cacheData, { recursive: true, mode: 0o700 } ) ] );
	const ownerPeerID = runCli( binary, [ '--data', ownerData, '--print-node-id' ] );
	const cachePeerID = runCli( binary, [ '--data', cacheData, '--print-node-id' ] );
	const assetSource = path.join( tempRoot, 'fixture.glb' );
	const assetBytes = Buffer.from( 'ElseMesh live browser-gateway fixture\n'.repeat( 5000 ) );
	await writeFile( assetSource, assetBytes, { mode: 0o600 } );
	const assetID = runCli( binary, [ '--data', ownerData, '--import-asset', assetSource ] );
	const assetHex = assetID.slice( 'sha256:'.length );
	const worldID = 'tw-world:live-gateway-e2e';
	const manifestInput = path.join( tempRoot, 'world-unsigned.json' );
	const manifestPath = path.join( tempRoot, 'world-signed.json' );
	const expiresAt = Math.floor( Date.now() / 1000 ) + 3600;
	await writeFile( manifestInput, JSON.stringify( {
		protocol: 'tidewater.world/1',
		worldId: worldID,
		ownerPeerId: ownerPeerID,
		authorityPeerId: ownerPeerID,
		authorityEpoch: 1,
		discoverable: true,
		version: 1,
		title: 'Live gateway fixture',
		rules: { gravity: 1, avatarComplexity: 20000, physicsProfile: 'tidewater-default' },
		assets: [ { id: assetID, bytes: assetBytes.byteLength, kind: 'glb', priority: 'visible' } ],
		objects: [],
		components: [],
		portals: [],
		hosts: [ { peerId: cachePeerID, scopes: [ 'content-cache' ], expiresAt, epoch: 1 } ],
		updatedAt: Math.floor( Date.now() / 1000 ),
	} ), { mode: 0o600 } );
	runCli( binary, [ '--data', ownerData, '--sign-manifest', manifestInput, '--manifest-out', manifestPath ] );

	const ownerP2PPort = await unusedPort();
	const cacheP2PPort = await unusedPort();
	const ownerHTTPPort = await unusedPort();
	const cacheHTTPPort = await unusedPort();
	const owner = startDaemon( binary, [
		'--data', ownerData, '--manifest', manifestPath, '--p2p-port', String( ownerP2PPort ),
		'--http', `127.0.0.1:${ownerHTTPPort}`, '--dht-mode', 'server',
	] );
	await waitForHTTP( `http://127.0.0.1:${ownerHTTPPort}/healthz`, owner );
	const bootstrap = `/ip4/127.0.0.1/tcp/${ownerP2PPort}/p2p/${ownerPeerID}`;
	const cache = startDaemon( binary, [
		'--data', cacheData, '--manifest', manifestPath, '--p2p-port', String( cacheP2PPort ),
		'--http', `127.0.0.1:${cacheHTTPPort}`, '--dht-mode', 'server', '--bootstrap', bootstrap,
		'--cache-from', ownerPeerID, '--cache-sync-interval', '1s',
	] );
	await waitForHTTP( `http://127.0.0.1:${cacheHTTPPort}/healthz`, cache );
	await waitFor( async () => {
		const pathOnCache = path.join( cacheData, 'assets', assetHex );
		try {
			const cached = await readFile( pathOnCache );
			return cached.equals( assetBytes );
		} catch {
			return false;
		}
	}, 'authorized cache to sync and verify the signed asset', [ owner, cache ] );

	const connector = new WorldConnector( { worldId: worldID, nodeId: ownerPeerID, gateway: `http://127.0.0.1:${cacheHTTPPort}`, chunkBytes: 64 * 1024 } );
	try {
		const manifest = await connector.getManifest();
		assert.equal( manifest.ownerPeerId, ownerPeerID, 'browser connector verifies the owner-signed manifest through the cache gateway' );
		assert.equal( connector.nodeId, ownerPeerID, 'initial manifest is served through the requested owner peer' );

		await stopDaemon( owner );
		const downloaded = await connector.getAsset( assetID );
		assert.deepEqual( Buffer.from( downloaded ), assetBytes, 'browser connector recovers the same content-addressed asset from the authorized cache' );
		assert.equal( connector.nodeId, cachePeerID, 'provider recovery selects the live cache peer after owner shutdown' );
		assert.equal( connector.manifest.ownerPeerId, ownerPeerID, 'cache serves the unchanged owner-signed manifest' );
	} finally {
		connector.close();
	}

	console.log( 'ok   live worldd WebSocket gateway, signed manifest, authorized cache recovery, and asset SHA-256 verification' );
} finally {
	for ( const child of processes.reverse() ) await stopDaemon( child );
	await rm( tempRoot, { recursive: true, force: true } );
}

function runCli( binary, args ) {
	const result = spawnSync( binary, args, { encoding: 'utf8', timeout: 30000 } );
	assert.equal( result.status, 0, `${path.basename( binary )} ${args.join( ' ' )} failed:\n${result.stdout}\n${result.stderr}` );
	return result.stdout.trim();
}

function startDaemon( binary, args ) {
	const child = spawn( binary, args, { cwd: daemonDir, stdio: [ 'ignore', 'pipe', 'pipe' ] } );
	child.output = '';
	child.stdout.setEncoding( 'utf8' ).on( 'data', ( value ) => { child.output += value; } );
	child.stderr.setEncoding( 'utf8' ).on( 'data', ( value ) => { child.output += value; } );
	processes.push( child );
	return child;
}

async function waitForHTTP( url, child ) {
	await waitFor( async () => {
		try { return ( await fetch( url, { signal: AbortSignal.timeout( 1000 ) } ) ).ok; }
		catch { return false; }
	}, `${url} readiness`, [ child ] );
}

async function waitFor( condition, label, children = [] ) {
	const deadline = Date.now() + 30000;
	while ( Date.now() < deadline ) {
		for ( const child of children ) assert.equal( child.exitCode, null, `worldd exited while waiting for ${label}:\n${child.output}` );
		if ( await condition() ) return;
		await new Promise( ( resolve ) => setTimeout( resolve, 150 ) );
	}
	assert.fail( `timed out waiting for ${label}${children.length ? `:\n${children.map( ( child ) => child.output ).join( '\n' )}` : ''}` );
}

async function unusedPort() {
	const server = net.createServer();
	await new Promise( ( resolve, reject ) => server.listen( 0, '127.0.0.1', resolve ).once( 'error', reject ) );
	const { port } = server.address();
	await new Promise( ( resolve, reject ) => server.close( ( error ) => error ? reject( error ) : resolve() ) );
	return port;
}

async function stopDaemon( child ) {
	if ( ! child || child.exitCode !== null ) return;
	await new Promise( ( resolve ) => {
		const timer = setTimeout( resolve, 5000 );
		child.once( 'exit', () => { clearTimeout( timer ); resolve(); } );
		child.kill( 'SIGTERM' );
	} );
	if ( child.exitCode === null ) {
		child.kill( 'SIGKILL' );
		await new Promise( ( resolve ) => child.once( 'exit', resolve ) );
	}
}
