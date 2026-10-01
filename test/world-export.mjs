import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { loadWorldPackage, registerWorldPackageCollisions, unregisterWorldPackageCollisions } from '../src/network/WorldPackage.js';
import { validateWorldSource } from '../src/network/WorldSource.js';
import { Colliders } from '../src/world/Colliders.js';

const temporaryRoot = process.env.PREFIX ? path.join( process.env.PREFIX, 'tmp' ) : '/var/tmp';
const output = await mkdtemp( path.join( temporaryRoot, 'elsemesh-island-export-' ) );

try {
	const sourcePath = path.join( output, 'world-source.json' );
	execFileSync( process.execPath, [ 'tools/export-island.mjs', '--out', output ], { stdio: 'inherit' } );
	const sourceFirst = await readFile( sourcePath );
	const firstDocument = JSON.parse( sourceFirst );
	const assetPath = path.join( output, 'assets', firstDocument.objects[ 0 ].assetId.slice( 'sha256:'.length ) );
	const assetFirst = await readFile( assetPath );
	execFileSync( process.execPath, [ 'tools/export-island.mjs', '--out', output ], { stdio: 'inherit' } );
	const sourceBytes = await readFile( sourcePath );
	const source = validateWorldSource( JSON.parse( sourceBytes ) );
	const assetBytes = await readFile( path.join( output, 'assets', source.objects[ 0 ].assetId.slice( 'sha256:'.length ) ) );
	assert.deepEqual( sourceBytes, sourceFirst, 'repeated source generation must be byte-identical' );
	assert.deepEqual( assetBytes, assetFirst, 'repeated GLB generation must be byte-identical' );
	assert.equal( `sha256:${createHash( 'sha256' ).update( assetBytes ).digest( 'hex' )}`, source.objects[ 0 ].assetId, 'exported asset path and source hash must match' );
	const parsed = parseGLB( assetBytes.buffer.slice( assetBytes.byteOffset, assetBytes.byteOffset + assetBytes.byteLength ) );
	const primitive = parsed.meshes[ 0 ][ 0 ];
	assert.equal( primitive.mode, 4, 'terrain export must use triangle lists' );
	assert.ok( primitive.attributes.COLOR_0, 'terrain export must carry its deterministic vertex colors' );
	assert.equal( primitive.indices.length, 512 * 512 * 6, 'terrain export must cover the full configured grid' );
	assert.deepEqual( source.rules.requiredFeatures, [ 'tidewater.static-glb/1' ] );
	assert.deepEqual( [ source.objects[ 0 ].collision.columns, source.objects[ 0 ].collision.rows ], [ 513, 513 ], 'terrain source declares the grid used for collision extraction' );
	const payload = assetBytes.buffer.slice( assetBytes.byteOffset, assetBytes.byteOffset + assetBytes.byteLength );
	const connector = { worldId: source.worldId, manifest: { assets: [ { id: source.objects[ 0 ].assetId, priority: 'visible' } ], objects: source.objects } };
	const root = await loadWorldPackage( connector, { assets: new Map( [ [ source.objects[ 0 ].assetId, payload ] ] ) } );
	let runtimeMeshes = 0;
	root.traverse( ( object ) => {
		if ( object.isMesh ) {
			runtimeMeshes ++;
			assert.equal( object.material.vertexColors, true, 'hosted GLB renderer must enable exported vertex colors' );
		}
	} );
	assert.equal( runtimeMeshes, 1, 'runtime package loader must instantiate the exported terrain mesh' );
	const colliders = new Colliders();
	registerWorldPackageCollisions( root, colliders );
	assert.equal( colliders.heightfields.length, 1, 'hosted terrain package registers its heightfield collision' );
	let terrainPosition;
	root.children[ 0 ].traverse( ( object ) => { if ( object.isMesh ) terrainPosition = object.geometry.getAttribute( 'position' ); } );
	assert.ok( terrainPosition, 'terrain package exposes its GLB vertex positions to collision extraction' );
	const sample = 128 * 513 + 256;
	const px = terrainPosition.getX( sample ), py = terrainPosition.getY( sample ), pz = terrainPosition.getZ( sample );
	assert.ok( Math.abs( colliders.groundHeightAt( px, pz, Infinity ) - py ) < 1e-4, 'heightfield collision matches exported GLB terrain vertex height' );
	unregisterWorldPackageCollisions( root, colliders );
	assert.equal( colliders.heightfields.length, 0, 'world handoff removes the hosted terrain heightfield' );
	console.log( 'ok deterministic procedural island terrain GLB package' );
} finally {
	await rm( output, { recursive: true, force: true } );
}
