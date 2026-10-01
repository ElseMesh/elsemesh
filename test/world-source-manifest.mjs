import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateWorldRequirements } from '../src/network/WorldRules.js';
import { validateWorldSource } from '../src/network/WorldSource.js';
import { gravityAcceleration } from '../src/network/WorldRules.js';

const temporaryRoot = process.env.PREFIX ? path.join( process.env.PREFIX, 'tmp' ) : '/var/tmp';
const root = await mkdtemp( path.join( temporaryRoot, 'elsemesh-manifest-test-' ) );

try {
	const sourcePath = path.join( root, 'world-source.json' );
	const assetsPath = path.join( root, 'assets' );
	await mkdir( assetsPath );
	await writeFile( sourcePath, JSON.stringify( {
		protocol: 'tidewater.world-source/1',
		worldId: 'tw-world:manifest-test',
		title: 'Manifest test',
		coordinateSystem: 'right-handed-y-up-meters',
		styleGuide: '',
		rules: { gravity: 1, avatarComplexity: 20000, physicsProfile: 'default', requiredFeatures: [ 'tidewater.portal-handoff/1' ] },
		hosts: [ { peerId: '12D3KooWAbcdefghijk1234567890123456', scopes: [ 'content-cache', 'failover-authority' ], expiresAt: 1900000000, epoch: 3, failoverAfter: 1800000000, failoverSeconds: 300 } ],
		objects: [],
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
	assert.deepEqual( manifest.rules.requiredFeatures, [ 'tidewater.portal-handoff/1' ], 'runtime feature requirements survive deterministic conversion' );
	assert.doesNotThrow( () => validateWorldRequirements( manifest ), 'client accepts requirements it implements' );
	assert.throws( () => validateWorldRequirements( { ...manifest, rules: { ...manifest.rules, requiredFeatures: [ 'tidewater.water-simulation/2' ] } } ), /does not support required world feature/, 'client must not silently ignore an unsupported required feature' );
	assert.throws( () => validateWorldRequirements( { ...manifest, rules: { ...manifest.rules, physicsProfile: 'custom-physics' } } ), /invalid runtime rules/, 'client rejects a physics profile without implemented semantics' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:duplicate-feature', title: 'Rules', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'default', requiredFeatures: [ 'tidewater.portal-handoff/1', 'tidewater.portal-handoff/1' ] }, objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /required world features/, 'authoring source rejects duplicate required features' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:custom-profile', title: 'Rules', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'custom-physics' }, objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /unsupported world rules/, 'authoring source rejects a profile without implemented semantics' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:bad-host', title: 'Grant', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'default' }, hosts: [ { peerId: '12D3KooWAbcdefghijk1234567890123456', scopes: [ 'failover-authority' ], expiresAt: 1900000000, epoch: 1, failoverAfter: 1800000000 } ], objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /failover window/, 'failover grants require a bounded duration' );
	assert.equal( gravityAcceleration( { gravity: 1 } ), 9.81, 'default world gravity preserves the built-in movement physics' );
	assert.equal( gravityAcceleration( { gravity: 0.5 } ), 4.905, 'world gravity multiplier affects player acceleration' );
	assert.throws( () => gravityAcceleration( { gravity: 2.1 } ), /gravity multiplier/, 'gravity outside the validated range is rejected' );
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
