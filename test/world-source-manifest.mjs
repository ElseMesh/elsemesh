import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateWorldRequirements } from '../src/network/WorldRules.js';
import { validateWorldSource } from '../src/network/WorldSource.js';
import { gravityAcceleration, movementParameters } from '../src/network/WorldRules.js';
import { encodeVegetationPlacements, VEGETATION_PLACEMENT_KINDS } from '../src/network/VegetationPlacements.js';

const temporaryRoot = process.env.PREFIX ? path.join( process.env.PREFIX, 'tmp' ) : '/var/tmp';
const root = await mkdtemp( path.join( temporaryRoot, 'elsemesh-manifest-test-' ) );

try {
	const sourcePath = path.join( root, 'world-source.json' );
	const assetsPath = path.join( root, 'assets' );
	await mkdir( assetsPath );
	const boundedAssetBytes = Buffer.from( 'mesh' );
	const boundedAssetID = `sha256:${createHashForTest( boundedAssetBytes )}`;
	await writeFile( path.join( assetsPath, boundedAssetID.slice( 'sha256:'.length ) ), boundedAssetBytes );
	const emptyVegetation = Object.fromEntries( [ ...VEGETATION_PLACEMENT_KINDS.map( ( kind ) => [ kind, [] ] ), [ 'villagePalms', 0 ] ] );
	const placementBytes = Buffer.from( encodeVegetationPlacements( emptyVegetation, 7 ) );
	const placementAssetID = `sha256:${createHashForTest( placementBytes )}`;
	await writeFile( path.join( assetsPath, placementAssetID.slice( 'sha256:'.length ) ), placementBytes );
	await writeFile( sourcePath, JSON.stringify( {
		protocol: 'tidewater.world-source/1',
		worldId: 'tw-world:manifest-test',
		title: 'Manifest test',
		coordinateSystem: 'right-handed-y-up-meters',
		styleGuide: '',
		rules: { gravity: 1, avatarComplexity: 20000, physicsProfile: 'default', movement: { walkSpeed: 2.5, sprintSpeed: 7, jumpSpeed: 4.2 }, maxPackageBytes: 1024, requiredFeatures: [ 'tidewater.portal-handoff/1', 'tidewater.procedural-island-vegetation/1' ] },
		hosts: [ { peerId: '12D3KooWAbcdefghijk1234567890123456', scopes: [ 'content-cache', 'failover-authority' ], expiresAt: 1900000000, epoch: 3, failoverAfter: 1800000000, failoverSeconds: 300 } ],
		objects: [ { id: 'tw-object:bounded', kind: 'asset-instance', label: 'Bounded', assetId: boundedAssetID, priority: 'nearby', streamingBounds: { center: [ 1, 2, 3 ], radius: 4 }, transform: { position: [ 0, 0, 0 ], yaw: 0 }, scale: [ 1, 1, 1 ], collision: { shape: 'none', enabled: false } } ],
		components: [ { id: 'tw-component:test-vegetation', type: 'tidewater.procedural-island-vegetation/1', seed: 7, priority: 'portal-preview', placementAssetId: placementAssetID } ],
		portals: [],
		updatedAt: '2026-09-30T12:34:56Z',
	} ) );

	const outputs = [ 'first.json', 'second.json' ];
	for ( const output of outputs ) {
		execFileSync( process.execPath, [
			'tools/world-source-to-manifest.mjs',
			'--source', sourcePath,
			'--owner', 'owner-peer',
			'--assets', assetsPath,
			'--out', path.join( root, output ),
		], { stdio: 'ignore' } );
	}

	const [ first, second ] = await Promise.all( outputs.map( ( output ) => readFile( path.join( root, output ) ) ) );
	assert.deepEqual( first, second, 'same source must produce byte-identical manifests' );
	const manifest = JSON.parse( first );
	assert.equal( manifest.updatedAt, 1790771696, 'runtime timestamp must come from the source snapshot' );
	assert.equal( manifest.discoverable, false, 'world publication is private by default' );
	assert.deepEqual( manifest.hosts, [ { peerId: '12D3KooWAbcdefghijk1234567890123456', scopes: [ 'content-cache', 'failover-authority' ], expiresAt: 1900000000, epoch: 3, failoverAfter: 1800000000, failoverSeconds: 300 } ], 'owner-granted cache and failover authority survive conversion' );
	assert.deepEqual( manifest.rules.requiredFeatures, [ 'tidewater.portal-handoff/1', 'tidewater.procedural-island-vegetation/1' ], 'runtime feature requirements survive deterministic conversion' );
	assert.deepEqual( manifest.components, [ { id: 'tw-component:test-vegetation', type: 'tidewater.procedural-island-vegetation/1', seed: 7, priority: 'portal-preview', placementAssetId: placementAssetID } ], 'versioned procedural components and their placement asset survive deterministic conversion' );
	assert.ok( manifest.assets.some( ( asset ) => asset.id === placementAssetID && asset.kind === 'vegetation-placement/1' && asset.priority === 'portal-preview' ), 'component placement data is included as a hash-verified early-stream asset' );
	assert.deepEqual( manifest.rules.movement, { walkSpeed: 2.5, sprintSpeed: 7, jumpSpeed: 4.2 }, 'world movement rules survive deterministic conversion' );
	assert.equal( manifest.rules.maxPackageBytes, 1024, 'aggregate content budget survives deterministic conversion' );
	assert.deepEqual( manifest.objects[ 0 ].streamingBounds, { center: [ 1, 2, 3 ], radius: 4 }, 'object streaming bounds survive deterministic conversion' );
	assert.equal( manifest.objects[ 0 ].priority, 'nearby', 'per-object streaming priority survives deterministic conversion' );
	const oversizedBytes = Buffer.from( 'over budget' );
	const oversizedAssetID = `sha256:${createHashForTest( oversizedBytes )}`;
	await writeFile( path.join( assetsPath, oversizedAssetID.slice( 'sha256:'.length ) ), oversizedBytes );
	const oversizedSource = JSON.parse( await readFile( sourcePath, 'utf8' ) );
	oversizedSource.worldId = 'tw-world:over-budget';
	oversizedSource.rules.maxPackageBytes = 1;
	oversizedSource.objects = [ { id: 'tw-object:asset', kind: 'asset-instance', label: 'Asset', assetId: oversizedAssetID, transform: { position: [ 0, 0, 0 ], yaw: 0 }, scale: [ 1, 1, 1 ], collision: { shape: 'none', enabled: false }, priority: 'visible' } ];
	const oversizedSourcePath = path.join( root, 'over-budget-source.json' );
	await writeFile( oversizedSourcePath, JSON.stringify( oversizedSource ) );
	let converterRejectedBudget = false;
	try {
		execFileSync( process.execPath, [ 'tools/world-source-to-manifest.mjs', '--source', oversizedSourcePath, '--owner', 'owner-peer', '--assets', assetsPath, '--out', path.join( root, 'over-budget.json' ) ], { stdio: 'pipe' } );
	} catch ( error ) {
		converterRejectedBudget = String( error.stderr ).includes( 'over its declared' );
	}
	assert.equal( converterRejectedBudget, true, 'source converter refuses to publish assets over the declared byte budget' );
	assert.doesNotThrow( () => validateWorldRequirements( manifest ), 'client accepts requirements it implements' );
	assert.throws( () => validateWorldRequirements( { ...manifest, rules: { ...manifest.rules, requiredFeatures: [ 'tidewater.water-simulation/2' ] } } ), /does not support required world feature/, 'client must not silently ignore an unsupported required feature' );
	assert.throws( () => validateWorldRequirements( { ...manifest, rules: { ...manifest.rules, physicsProfile: 'custom-physics' } } ), /invalid runtime rules/, 'client rejects a physics profile without implemented semantics' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:duplicate-feature', title: 'Rules', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'default', requiredFeatures: [ 'tidewater.portal-handoff/1', 'tidewater.portal-handoff/1' ] }, objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /required world features/, 'authoring source rejects duplicate required features' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:custom-profile', title: 'Rules', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'custom-physics' }, objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /unsupported world rules/, 'authoring source rejects a profile without implemented semantics' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:fast-player', title: 'Rules', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'default', movement: { walkSpeed: 12, sprintSpeed: 12, jumpSpeed: 4 } }, objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /movement rules/, 'authoring source rejects out-of-range movement values' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:bad-host', title: 'Grant', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'default' }, hosts: [ { peerId: '12D3KooWAbcdefghijk1234567890123456', scopes: [ 'failover-authority' ], expiresAt: 1900000000, epoch: 1, failoverAfter: 1800000000 } ], objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /failover window/, 'failover grants require a bounded duration' );
	assert.equal( gravityAcceleration( { gravity: 1 } ), 9.81, 'default world gravity preserves the built-in movement physics' );
	assert.equal( gravityAcceleration( { gravity: 0.5 } ), 4.905, 'world gravity multiplier affects player acceleration' );
	assert.throws( () => gravityAcceleration( { gravity: 2.1 } ), /gravity multiplier/, 'gravity outside the validated range is rejected' );
	assert.deepEqual( movementParameters( {} ), { walkSpeed: 3, sprintSpeed: 6.2, jumpSpeed: 4.6 }, 'older manifests retain existing controller movement defaults' );
	assert.throws( () => movementParameters( { movement: { walkSpeed: 5, sprintSpeed: 4, jumpSpeed: 2 } } ), /movement speeds/, 'sprint speed cannot be lower than walk speed' );
	assert.throws( () => validateWorldRequirements( { ...manifest, assets: [ { bytes: 1025 } ] } ), /exceeds its declared byte budget/, 'client rejects a package larger than its signed byte budget before downloading' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:bad-budget', title: 'Budget', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'default', maxPackageBytes: 0 }, objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /byte budget/, 'authoring source rejects an invalid package budget' );
	const quaternionSource = { protocol: 'tidewater.world-source/1', worldId: 'tw-world:quaternion', title: 'Quaternion', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'default' }, objects: [ { id: 'tw-object:rotated', kind: 'asset-instance', label: 'Rotated', transform: { position: [ 0, 0, 0 ], yaw: 0, rotation: [ 0, 0, 0, 1 ] }, scale: [ 1, 1, 1 ], collision: { shape: 'none', enabled: false } } ], portals: [], updatedAt: '2026-09-30T12:00:00Z' };
	assert.doesNotThrow( () => validateWorldSource( quaternionSource ), 'collision-free objects accept normalized quaternion transforms' );
	const boundedSource = structuredClone( quaternionSource );
	boundedSource.objects[ 0 ].streamingBounds = { center: [ 1, 2, 3 ], radius: 4 };
	boundedSource.objects[ 0 ].priority = 'nearby';
	assert.doesNotThrow( () => validateWorldSource( boundedSource ), 'objects accept validated local streaming bounds and per-object priority' );
	boundedSource.objects[ 0 ].streamingBounds.radius = 0;
	assert.throws( () => validateWorldSource( boundedSource ), /object record/, 'authoring source rejects zero-radius streaming bounds' );
	boundedSource.objects[ 0 ].streamingBounds.radius = 4;
	boundedSource.objects[ 0 ].priority = 'urgent';
	assert.throws( () => validateWorldSource( boundedSource ), /object record/, 'authoring source rejects unknown object streaming priority' );
	quaternionSource.objects[ 0 ].transform.rotation = [ 0, 0, 0, 2 ];
	assert.throws( () => validateWorldSource( quaternionSource ), /object record/, 'authoring source rejects non-normalized quaternions' );
	quaternionSource.objects[ 0 ].transform.rotation = [ 0, 0, 0, 1 ];
	quaternionSource.objects[ 0 ].collision.enabled = true;
	assert.throws( () => validateWorldSource( quaternionSource ), /object record/, 'authoring source rejects quaternion transforms when collision is enabled' );
	const publicOutput = path.join( root, 'discoverable.json' );
	execFileSync( process.execPath, [
		'tools/world-source-to-manifest.mjs', '--source', sourcePath, '--owner', 'owner-peer',
		'--assets', assetsPath, '--out', publicOutput, '--discoverable', 'true',
	], { stdio: 'ignore' } );
	assert.equal( JSON.parse( await readFile( publicOutput, 'utf8' ) ).discoverable, true, 'discoverable must require an explicit author choice' );
	console.log( 'ok deterministic source-to-manifest conversion' );
} finally {
	await rm( root, { recursive: true, force: true } );
}

function createHashForTest( bytes ) {
	return createHash( 'sha256' ).update( bytes ).digest( 'hex' );
}
