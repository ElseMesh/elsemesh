import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { loadWorldPackage, registerWorldPackageCollisions, unregisterWorldPackageCollisions } from '../src/network/WorldPackage.js';
import { validateWorldSource } from '../src/network/WorldSource.js';
import { Colliders } from '../src/world/Colliders.js';

const temporaryRoot = process.env.PREFIX ? path.join( process.env.PREFIX, 'tmp' ) : '/var/tmp';
const output = await mkdtemp( path.join( temporaryRoot, 'elsemesh-island-export-' ) );

try {
	const checkedInDir = path.resolve( 'worlds/island' );
	const checkedInSource = validateWorldSource( JSON.parse( await readFile( path.join( checkedInDir, 'world-source.json' ), 'utf8' ) ) );
	const checkedInIDs = new Set( checkedInSource.objects.map( ( object ) => object.assetId ) );
	const checkedInFiles = ( await readdir( path.join( checkedInDir, 'assets' ) ) ).sort();
	assert.deepEqual( checkedInFiles, [ ...checkedInIDs ].map( ( id ) => id.slice( 'sha256:'.length ) ).sort(), 'checked-in island package stores exactly its referenced assets' );
	let checkedInBytes = 0;
	for ( const id of checkedInIDs ) {
		const bytes = await readFile( path.join( checkedInDir, 'assets', id.slice( 'sha256:'.length ) ) );
		checkedInBytes += bytes.length;
		assert.equal( `sha256:${createHash( 'sha256' ).update( bytes ).digest( 'hex' )}`, id, `checked-in package asset bytes must match ${id}` );
	}
	assert.ok( checkedInBytes <= checkedInSource.rules.maxPackageBytes, 'checked-in assets fit the world package budget' );
	assert.ok( checkedInSource.objects.some( ( object ) => object.id === 'tw-object:island-village' ), 'checked-in island source contains the static village GLB instance' );
	const sourcePath = path.join( output, 'world-source.json' );
	execFileSync( process.execPath, [ 'tools/export-island.mjs', '--out', output ], { stdio: 'inherit' } );
	const sourceFirst = await readFile( sourcePath );
	const firstDocument = JSON.parse( sourceFirst );
	const assetPath = path.join( output, 'assets', firstDocument.objects[ 0 ].assetId.slice( 'sha256:'.length ) );
	const assetFirst = await readFile( assetPath );
	const firstAssets = new Map();
	for ( const id of new Set( firstDocument.objects.map( ( object ) => object.assetId ) ) ) firstAssets.set( id, await readFile( path.join( output, 'assets', id.slice( 'sha256:'.length ) ) ) );
	execFileSync( process.execPath, [ 'tools/export-island.mjs', '--out', output ], { stdio: 'inherit' } );
	const sourceBytes = await readFile( sourcePath );
	const source = validateWorldSource( JSON.parse( sourceBytes ) );
	const assetBytes = await readFile( path.join( output, 'assets', source.objects[ 0 ].assetId.slice( 'sha256:'.length ) ) );
	assert.deepEqual( sourceBytes, sourceFirst, 'repeated source generation must be byte-identical' );
	assert.deepEqual( assetBytes, assetFirst, 'repeated GLB generation must be byte-identical' );
	for ( const [ id, bytes ] of firstAssets ) {
		assert.deepEqual( await readFile( path.join( output, 'assets', id.slice( 'sha256:'.length ) ) ), bytes, `repeated generation must preserve bytes for ${id}` );
		assert.equal( `sha256:${createHash( 'sha256' ).update( bytes ).digest( 'hex' )}`, id, `content-addressed asset bytes must match ${id}` );
	}
	const assetFiles = ( await readdir( path.join( output, 'assets' ) ) ).sort();
	assert.deepEqual( assetFiles, [ ...firstAssets.keys() ].map( ( id ) => id.slice( 'sha256:'.length ) ).sort(), 'package asset directory contains exactly the referenced unique assets' );
	assert.equal( `sha256:${createHash( 'sha256' ).update( assetBytes ).digest( 'hex' )}`, source.objects[ 0 ].assetId, 'exported asset path and source hash must match' );
	const parsed = parseGLB( assetBytes.buffer.slice( assetBytes.byteOffset, assetBytes.byteOffset + assetBytes.byteLength ) );
	const primitive = parsed.meshes[ 0 ][ 0 ];
	assert.equal( primitive.mode, 4, 'terrain export must use triangle lists' );
	assert.ok( primitive.attributes.COLOR_0, 'terrain export must carry its deterministic vertex colors' );
	assert.equal( primitive.indices.length, 512 * 512 * 6, 'terrain export must cover the full configured grid' );
	assert.deepEqual( source.rules.requiredFeatures, [ 'tidewater.static-glb/1', 'tidewater.static-glb-quaternion/1' ], 'quaternion transforms declare their required runtime capability' );
	assert.ok( source.rules.maxPackageBytes >= [ ...firstAssets.values() ].reduce( ( total, bytes ) => total + bytes.length, 0 ), 'signed package byte budget covers every unique asset' );
	assert.deepEqual( [ source.objects[ 0 ].collision.columns, source.objects[ 0 ].collision.rows ], [ 513, 513 ], 'terrain source declares the grid used for collision extraction' );
	const villageObject = source.objects.find( ( object ) => object.id === 'tw-object:island-village' );
	assert.ok( villageObject, 'export includes the procedural village and pier as portable content' );
	const villageBytes = firstAssets.get( villageObject.assetId );
	assert.ok( villageBytes?.length > 0, 'village object references its content-addressed GLB' );
	const villageGLB = parseGLB( villageBytes.buffer.slice( villageBytes.byteOffset, villageBytes.byteOffset + villageBytes.byteLength ) );
	assert.ok( villageGLB.meshes[ 0 ].length >= 8, 'village export preserves its separate authored material batches' );
	assert.ok( villageGLB.meshes[ 0 ].reduce( ( count, primitive ) => count + primitive.indices.length, 0 ) > 300000, 'village export includes the complete deterministic structural geometry' );
	assert.ok( villageGLB.meshes[ 0 ].every( ( primitive ) => primitive.attributes.COLOR_0 ), 'village export carries authored per-vertex tint' );
	assert.equal( villageObject.collision.shape, 'compound', 'village source includes the runtime builder collision layout' );
	assert.equal( villageObject.collision.boxes.length, 394, 'village collision layout matches its deterministic walkable and solid boxes' );
	const scannedObjects = source.objects.filter( ( object ) => object.id.startsWith( 'tw-object:scanned-debris-' ) );
	assert.equal( scannedObjects.length, 139, 'export contains the seeded scanned debris placements from the runtime placer' );
	assert.ok( source.objects.every( ( object ) => object.streamingBounds && Number.isFinite( object.streamingBounds.radius ) && object.streamingBounds.radius > 0 ), 'exported island objects include local streaming bounds' );
	assert.ok( scannedObjects.every( ( object ) => Array.isArray( object.transform.rotation ) && Math.abs( Math.hypot( ...object.transform.rotation ) - 1 ) < 1e-4 && object.collision.enabled === false ), 'scanned objects carry normalized collision-free rotations' );
	const scannedAssetIDs = new Set( scannedObjects.map( ( object ) => object.assetId ) );
	assert.equal( scannedAssetIDs.size, 4, 'all four scanned debris assets are included once each' );
	for ( const id of scannedAssetIDs ) {
		const bytes = firstAssets.get( id );
		const parsed = parseGLB( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
		assert.equal( parsed.meshes.length, 1, 'scanned asset export keeps a single LOD mesh' );
		assert.ok( parsed.materials[ 0 ]?.pbrMetallicRoughness?.baseColorTexture, 'scanned asset has a base-color texture' );
		assert.equal( parsed.images[ 0 ]?.mimeType, 'image/jpeg', 'scanned albedo is embedded in the GLB' );
		assert.ok( parsed.images[ 0 ]?.bytes?.length > 0, 'scanned GLB contains embedded image bytes' );
	}
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
	const villagePayload = villageBytes.buffer.slice( villageBytes.byteOffset, villageBytes.byteOffset + villageBytes.byteLength );
	const villageConnector = { worldId: source.worldId, manifest: { assets: [ { id: villageObject.assetId, priority: 'visible' } ], objects: [ villageObject ] } };
	const villageRoot = await loadWorldPackage( villageConnector, { assets: new Map( [ [ villageObject.assetId, villagePayload ] ] ) } );
	let villageRuntimeMeshes = 0;
	villageRoot.traverse( ( object ) => { if ( object.isMesh ) { villageRuntimeMeshes ++; assert.equal( object.material.vertexColors, true, 'village GLB keeps authored tint in hosted rendering' ); } } );
	assert.equal( villageRuntimeMeshes, villageGLB.meshes[ 0 ].length, 'hosted package loader creates each village material batch' );
	const villageColliders = new Colliders();
	registerWorldPackageCollisions( villageRoot, villageColliders );
	assert.equal( villageColliders.boxes.length, villageObject.collision.boxes.length, 'hosted village registers every authored collider' );
	assert.ok( villageColliders.boxes.some( ( box ) => box.walkable ) && villageColliders.boxes.some( ( box ) => ! box.walkable && box.solid ), 'hosted village retains both walkable surfaces and solid obstacles' );
	unregisterWorldPackageCollisions( villageRoot, villageColliders );
	assert.equal( villageColliders.boxes.length, 0, 'hosted village removes all colliders on world handoff' );
	const deferredObject = { ...source.objects[ 0 ], id: 'tw-object:deferred-copy', label: 'Deferred copy', transform: { position: [ 20, 0, 20 ], yaw: 0 }, collision: { shape: 'none', enabled: false } };
	const filteredConnector = { worldId: source.worldId, manifest: { assets: [ { id: source.objects[ 0 ].assetId, priority: 'visible' } ], objects: [ source.objects[ 0 ], deferredObject ] } };
	const filteredRoot = await loadWorldPackage( filteredConnector, { assets: new Map( [ [ source.objects[ 0 ].assetId, payload ] ] ), objectIDs: new Set( [ source.objects[ 0 ].id ] ) } );
	assert.deepEqual( filteredRoot.userData.worldPackage.loadedObjects, new Set( [ source.objects[ 0 ].id ] ), 'view streaming appends only selected instances even when assets are shared' );
	const testRotation = [ 0, 0, Math.SQRT1_2, Math.SQRT1_2 ];
	const rotatedObject = { ...source.objects[ 0 ], transform: { position: [ 1, 2, 3 ], yaw: Math.PI / 2, rotation: testRotation }, collision: { shape: 'none', enabled: false } };
	const rotatedConnector = { worldId: source.worldId, manifest: { assets: [ { id: rotatedObject.assetId, priority: 'visible' } ], objects: [ rotatedObject ] } };
	const rotatedRoot = await loadWorldPackage( rotatedConnector, { assets: new Map( [ [ rotatedObject.assetId, payload ] ] ) } );
	assert.ok( Math.abs( rotatedRoot.children[ 0 ].quaternion.z - Math.SQRT1_2 ) < 1e-6 && Math.abs( rotatedRoot.children[ 0 ].quaternion.w - Math.SQRT1_2 ) < 1e-6, 'runtime package loader applies signed quaternion transforms' );
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
	console.log( 'ok deterministic procedural island terrain and village GLB package' );
} finally {
	await rm( output, { recursive: true, force: true } );
}
