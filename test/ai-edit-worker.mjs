import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { createWorldSource } from '../src/network/WorldSource.js';
import { createAITaskBundle } from '../tools/create-ai-edit-task.mjs';
import { buildSandboxCommand, validateAITaskBundle, validateScopedActions } from '../tools/run-ai-edit-worker.mjs';

const temporaryRoot = await mkdtemp( path.join( '/var/tmp', 'elsemesh-ai-edit-' ) );
try {
	const input = path.join( temporaryRoot, 'input' );
	const assets = path.join( input, 'assets' );
	await mkdir( assets, { recursive: true } );
	const assetBytes = Buffer.from( 'glb-content-addressed-fixture' );
	const assetId = `sha256:${createHash( 'sha256' ).update( assetBytes ).digest( 'hex' )}`;
	const world = createWorldSource( { worldId: 'tw-world:ai-worker-test' } );
	world.objects.push( {
		id: 'tw-object:review-target', kind: 'asset-instance', label: 'Review target', assetId,
		priority: 'visible', transform: { position: [ 0, 0, 0 ], yaw: 0 }, scale: [ 1, 1, 1 ],
		collision: { shape: 'none', enabled: false },
	} );
	world.portals.push( {
		id: 'tw-portal:review-target', destinationWorldId: 'tw-world:other',
		entry: { position: [ 1, 0, 0 ], yaw: 0 }, exit: { position: [ 0, 0, 0 ], yaw: 0 },
		openView: true, enabled: true,
	} );
	const sourcePath = path.join( input, 'world-source.json' );
	const blendPath = path.join( input, 'scene.blend' );
	await writeFile( sourcePath, `${JSON.stringify( world, null, 2 )}\n` );
	await writeFile( blendPath, 'not a real blend; bundle tests treat it as opaque bytes' );
	await writeFile( path.join( assets, assetId.slice( 7 ) ), assetBytes );
	const taskDirectory = path.join( temporaryRoot, 'task' );
	const created = await createAITaskBundle( {
		sourcePath, blendPath, assetsPath: assets, instruction: 'Move the selected prop one meter east.', outTaskPath: taskDirectory,
		objectIds: [ 'tw-object:review-target' ], portalIds: [ 'tw-portal:review-target' ],
	} );
	assert.equal( created.worldId, world.worldId );
	assert.deepEqual( created.availableAssetIds, [ assetId ] );
	assert.equal( ( await readFile( path.join( taskDirectory, 'scene.blend' ) ) ).toString(), 'not a real blend; bundle tests treat it as opaque bytes' );
	await writeFile( path.join( taskDirectory, 'plan.json' ), `${JSON.stringify( {
		protocol: 'elsemesh.blender-actions/1', sourceHash: created.sourceHash,
		actions: [ { op: 'object.update', id: 'tw-object:review-target', fields: { transform: { position: [ 1, 0, 0 ], yaw: 0 } } } ],
	} )}\n` );
	const bundle = await validateAITaskBundle( taskDirectory );
	assert.equal( bundle.task.taskId, created.taskId );
	assert.equal( bundle.outputAssetsRequired, false );
	assert.deepEqual( bundle.actionCounts, { 'object.update': 1 } );

	assert.throws( () => validateScopedActions( [ { op: 'object.remove', id: 'tw-object:unselected' } ], created ), /outside the task object allow-list/ );
	assert.throws( () => validateScopedActions( [ { op: 'portal.remove', id: 'tw-portal:unselected' } ], created ), /outside the task portal allow-list/ );
	assert.throws( () => validateScopedActions( [ { op: 'object.add', object: { assetId: 'sha256:' + '0'.repeat( 64 ) } } ], created ), /explicitly included/ );
	assert.doesNotThrow( () => validateScopedActions( [ { op: 'object.update', id: 'tw-object:review-target', fields: { assetId } } ], created ) );

	const output = path.join( temporaryRoot, 'candidate' );
	const command = buildSandboxCommand( {
		bwrap: '/usr/bin/bwrap', prlimit: '/usr/bin/prlimit', blender: '/usr/bin/blender',
		runner: '/repo/tools/blender/world_actions.py', taskRoot: taskDirectory, outputRoot: output,
		outputAssetsRequired: true,
	} );
	assert.equal( command.command, '/usr/bin/prlimit' );
	assert.ok( command.args.includes( '--unshare-all' ) );
	assert.ok( command.args.includes( '--clearenv' ) );
	assert.ok( command.args.includes( '--ro-bind' ) && command.args.includes( taskDirectory ) );
	assert.ok( command.args.includes( '--bind' ) && command.args.includes( output ) );
	assert.ok( command.args.includes( '--out-assets' ) && command.args.includes( '/out/assets' ) );
	assert.ok( command.args.some( ( arg ) => arg.startsWith( '--cpu=' ) ) );
	assert.ok( command.args.some( ( arg ) => arg.startsWith( '--as=' ) ) );
	assert.ok( Number( command.args.find( ( arg ) => arg.startsWith( '--nproc=' ) ).slice( 8 ) ) >= 128 );
	const portableCommand = buildSandboxCommand( {
		bwrap: '/usr/bin/bwrap', prlimit: '/usr/bin/prlimit', blender: '/var/tmp/blender/usr/bin/blender',
		blenderPrefix: '/var/tmp/blender/usr', runner: '/repo/tools/blender/world_actions.py', taskRoot: taskDirectory, outputRoot: output,
		outputAssetsRequired: false,
	} );
	assert.ok( portableCommand.args.includes( '/var/tmp/blender/usr' ) );
	assert.ok( portableCommand.args.includes( '/opt/elsemesh-blender' ) );
	assert.ok( portableCommand.args.includes( '/opt/elsemesh-blender/bin/blender' ) );
	assert.ok( portableCommand.args.includes( 'BLENDER_SYSTEM_RESOURCES' ) );

	await assert.rejects( createAITaskBundle( {
		sourcePath, blendPath, assetsPath: assets, instruction: 'Do not overwrite existing task.', outTaskPath: taskDirectory,
		objectIds: [ 'tw-object:review-target' ],
	} ), /EEXIST/ );
	assert.equal( JSON.parse( await readFile( path.join( taskDirectory, 'task.json' ), 'utf8' ) ).taskId, created.taskId, 'existing task remains intact after a collision' );

	const tamperedPlan = JSON.parse( await readFile( path.join( taskDirectory, 'plan.json' ), 'utf8' ) );
	tamperedPlan.sourceHash = `sha256:${'0'.repeat( 64 )}`;
	await writeFile( path.join( taskDirectory, 'plan.json' ), JSON.stringify( tamperedPlan ) );
	await assert.rejects( validateAITaskBundle( taskDirectory ), /action plan protocol, source hash/ );
	await rm( path.join( taskDirectory, 'plan.json' ) );
	await symlink( sourcePath, path.join( taskDirectory, 'extra.json' ) );
	await assert.rejects( validateAITaskBundle( taskDirectory ), /only its declared files/ );

	console.log( 'ok task bundle source hashing, explicit file scope, action scoping, and sandbox command limits' );
} finally {
	await rm( temporaryRoot, { recursive: true, force: true } );
}
