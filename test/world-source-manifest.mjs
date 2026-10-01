import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
		rules: { gravity: 1, avatarComplexity: 20000, physicsProfile: 'default' },
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
	assert.equal( JSON.parse( first ).updatedAt, 1790771696, 'runtime timestamp must come from the source snapshot' );
	console.log( 'ok deterministic source-to-manifest conversion' );
} finally {
	await rm( root, { recursive: true, force: true } );
}
