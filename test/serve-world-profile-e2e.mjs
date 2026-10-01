import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const tempBase = process.env.PREFIX?.startsWith( '/data/data/' ) ? path.join( process.env.PREFIX, 'tmp' ) : '/var/tmp';
const tempRoot = await mkdtemp( path.join( tempBase, 'elsemesh-profile-e2e-' ) );
const children = [];

async function unusedPort() {
	const server = net.createServer();
	await new Promise( ( resolve, reject ) => server.once( 'error', reject ).listen( 0, '127.0.0.1', resolve ) );
	const { port } = server.address();
	await new Promise( resolve => server.close( resolve ) );
	return port;
}

function startProfile( binary, worldsDir, profile, sourcePath, assetsPath, httpPort, p2pPort ) {
	const args = [ 'tools/serve-world-profile.mjs', '--worldd', binary, '--worlds-dir', worldsDir, '--profile', profile ];
	if ( sourcePath && assetsPath ) args.push( '--source', sourcePath, '--assets', assetsPath );
	args.push( '--http', `127.0.0.1:${httpPort}`, '--p2p-port', String( p2pPort ) );
	const child = spawn( process.execPath, args, { cwd: root, stdio: [ 'ignore', 'pipe', 'pipe' ] } );
	child.output = '';
	child.stdout.setEncoding( 'utf8' ).on( 'data', data => child.output += data );
	child.stderr.setEncoding( 'utf8' ).on( 'data', data => child.output += data );
	children.push( child );
	return child;
}

async function stop( child ) {
	if ( child.exitCode !== null ) return;
	await new Promise( resolve => {
		const timeout = setTimeout( () => { child.kill( 'SIGKILL' ); resolve(); }, 5000 );
		child.once( 'exit', () => { clearTimeout( timeout ); resolve(); } );
		child.kill( 'SIGTERM' );
	} );
}

async function waitForWorld( child, port, expectedWorldID ) {
	const deadline = Date.now() + 30000;
	let lastError;
	while ( Date.now() < deadline ) {
		if ( child.exitCode !== null ) throw new Error( `Profile process exited early (${child.exitCode}):\n${child.output}` );
		try {
			const response = await fetch( `http://127.0.0.1:${port}/api/world/manifest`, { signal: AbortSignal.timeout( 1500 ) } );
			if ( response.ok ) {
				const { document } = await response.json();
				const payload = typeof document.payload === 'string' ? JSON.parse( document.payload ) : document.payload;
				assert.equal( payload.worldId, expectedWorldID );
				return payload;
			}
			lastError = new Error( `manifest endpoint returned HTTP ${response.status}` );
		} catch ( error ) { lastError = error; }
		await delay( 100 );
	}
	throw new Error( `Timed out waiting for ${expectedWorldID}: ${lastError};\n${child.output}` );
}

try {
	const binary = path.join( tempRoot, 'worldd' );
	const build = spawnSync( 'go', [ 'build', '-o', binary, '.' ], { cwd: path.join( root, 'server/worldd' ), encoding: 'utf8', timeout: 180000 } );
	assert.equal( build.status, 0, `worldd build failed:\n${build.stdout}\n${build.stderr}` );
	const worldsDir = path.join( tempRoot, 'worlds' );
	const assetsPath = path.join( root, 'worlds/island/assets' );
	const source = JSON.parse( await readFile( path.join( root, 'worlds/island/world-source.json' ), 'utf8' ) );
	const firstPath = path.join( tempRoot, 'first.json' );
	const secondPath = path.join( tempRoot, 'second.json' );
	const secondSource = { ...source, worldId: 'tw-world:profile-e2e-second', title: 'Second profile test' };
	await writeFile( firstPath, JSON.stringify( { ...source, worldId: 'tw-world:profile-e2e-first' } ) );
	await writeFile( secondPath, JSON.stringify( secondSource ) );
	const firstHTTP = await unusedPort();
	const secondHTTP = await unusedPort();
	const firstP2P = await unusedPort();
	const secondP2P = await unusedPort();
	let first = startProfile( binary, worldsDir, 'first-world', firstPath, assetsPath, firstHTTP, firstP2P );
	const second = startProfile( binary, worldsDir, 'second-world', secondPath, assetsPath, secondHTTP, secondP2P );
	const [ firstManifest, secondManifest ] = await Promise.all( [
		waitForWorld( first, firstHTTP, 'tw-world:profile-e2e-first' ),
		waitForWorld( second, secondHTTP, 'tw-world:profile-e2e-second' ),
	] );
	assert.notEqual( firstManifest.ownerPeerId, secondManifest.ownerPeerId, 'profiles use independent persistent owner identities' );
	await stop( first );
	first = startProfile( binary, worldsDir, 'first-world', null, null, firstHTTP, firstP2P );
	const restartedManifest = await waitForWorld( first, firstHTTP, 'tw-world:profile-e2e-first' );
	assert.equal( restartedManifest.ownerPeerId, firstManifest.ownerPeerId, 'restarting a profile keeps its owner identity and manifest' );
	const profiles = spawnSync( binary, [ '--worlds-dir', worldsDir, '--list-world-profiles' ], { encoding: 'utf8' } );
	assert.equal( profiles.status, 0, profiles.stderr );
	assert.deepEqual( profiles.stdout.trim().split( '\n' ).sort(), [ 'first-world', 'second-world' ] );
	console.log( 'two signed world packages were provisioned and served concurrently from isolated profiles' );
} finally {
	await Promise.all( children.map( stop ) );
	await rm( tempRoot, { recursive: true, force: true } );
}
