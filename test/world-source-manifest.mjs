import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateWorldRequirements } from '../src/network/WorldRules.js';
import { validateWorldSource } from '../src/network/WorldSource.js';

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
	assert.deepEqual( manifest.rules.requiredFeatures, [ 'tidewater.portal-handoff/1' ], 'runtime feature requirements survive deterministic conversion' );
	assert.doesNotThrow( () => validateWorldRequirements( manifest ), 'client accepts requirements it implements' );
	assert.throws( () => validateWorldRequirements( { ...manifest, rules: { ...manifest.rules, requiredFeatures: [ 'tidewater.water-simulation/2' ] } } ), /does not support required world feature/, 'client must not silently ignore an unsupported required feature' );
	assert.throws( () => validateWorldSource( { protocol: 'tidewater.world-source/1', worldId: 'tw-world:duplicate-feature', title: 'Rules', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '', rules: { gravity: 1, avatarComplexity: 100, physicsProfile: 'default', requiredFeatures: [ 'tidewater.portal-handoff/1', 'tidewater.portal-handoff/1' ] }, objects: [], portals: [], updatedAt: '2026-09-30T12:00:00Z' } ), /required world features/, 'authoring source rejects duplicate required features' );
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
