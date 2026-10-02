#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import { access, chmod, lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorldSource } from '../src/network/WorldSource.js';
import { AI_TASK_PROTOCOL, MAX_ASSET_BYTES, MAX_BLEND_BYTES, MAX_SOURCE_BYTES, MAX_TASK_BYTES } from './create-ai-edit-task.mjs';

export const MAX_PLAN_BYTES = 16 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;
export const WORKER_TIMEOUT_MS = 20 * 60 * 1000;
export const WORKER_LIMITS = Object.freeze( { cpuSeconds: 900, addressSpaceBytes: 12 * 1024 * 1024 * 1024, fileBytes: MAX_OUTPUT_BYTES, openFiles: 128, processes: 128 } );
const HASH = /^sha256:[0-9a-f]{64}$/;
const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID = /^tw-object:[\w.-]{1,128}$/;
const PORTAL_ID = /^tw-portal:[\w.-]{1,128}$/;
const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const ACTION_RUNNER = path.join( ROOT, 'tools/blender/world_actions.py' );

function parseArgs(argv) {
	const result = {};
	for ( let i = 0; i < argv.length; i ++ ) {
		const key = argv[ i ];
		if ( ! [ '--task', '--out', '--blender' ].includes( key ) || ! argv[ i + 1 ] ) throw new Error( `Invalid or incomplete option: ${key}` );
		result[ key.slice( 2 ) ] = argv[ ++ i ];
	}
	for ( const key of [ 'task', 'out' ] ) if ( ! result[ key ] ) throw new Error( `Missing --${key}` );
	return result;
}

export function isWithin(parent, child) {
	const relative = path.relative( parent, child );
	return relative === '' || ( relative !== '..' && ! relative.startsWith( `..${path.sep}` ) && ! path.isAbsolute( relative ) );
}

function safeRelative(value, label) {
	if ( typeof value !== 'string' || ! value || path.isAbsolute( value ) || value.includes( '\\' ) || value.split( '/' ).some( ( part ) => ! part || part === '.' || part === '..' ) ) throw new Error( `${label} must be a safe relative path` );
	return value;
}

async function regularFile(file, maximum, label) {
	const info = await lstat( file );
	if ( ! info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > maximum ) throw new Error( `${label} must be a single-link regular file within its size limit` );
	return info;
}

async function digest(file) {
	const hasher = createHash( 'sha256' );
	for await ( const chunk of createReadStream( file ) ) hasher.update( chunk );
	return `sha256:${hasher.digest( 'hex' )}`;
}

async function validateFlatDirectory(directory, expectedFiles, label) {
	const info = await lstat( directory );
	if ( ! info.isDirectory() || info.isSymbolicLink() ) throw new Error( `${label} must be a real directory` );
	const entries = await readdir( directory, { withFileTypes: true } );
	if ( entries.some( ( entry ) => ! entry.isFile() || entry.isSymbolicLink() ) || entries.length !== expectedFiles.size || entries.some( ( entry ) => ! expectedFiles.has( entry.name ) ) ) throw new Error( `${label} may contain only the declared regular files` );
}

export async function validateAITaskBundle(taskPath) {
	const taskRoot = await realpath( taskPath );
	const rootInfo = await lstat( taskPath );
	if ( ! rootInfo.isDirectory() || rootInfo.isSymbolicLink() ) throw new Error( 'task path must be a real directory' );
	const taskManifestPath = path.join( taskRoot, 'task.json' );
	await regularFile( taskManifestPath, MAX_SOURCE_BYTES, 'task.json' );
	const rootEntries = await readdir( taskRoot, { withFileTypes: true } );
	if ( rootEntries.length !== 5 || rootEntries.some( ( entry ) => ! [ 'task.json', 'world-source.json', 'scene.blend', 'plan.json', 'assets' ].includes( entry.name ) || entry.isSymbolicLink() ) || rootEntries.find( ( entry ) => entry.name === 'assets' )?.isDirectory() !== true ) throw new Error( 'task bundle may contain only its declared files and assets directory' );
	const task = JSON.parse( await readFile( taskManifestPath, 'utf8' ) );
	if ( ! task || task.protocol !== AI_TASK_PROTOCOL || ! TASK_ID.test( task.taskId || '' ) || ! HASH.test( task.sourceHash || '' ) || ! HASH.test( task.blendHash || '' ) || typeof task.worldId !== 'string' || ! /^tw-world:[\w.-]{1,128}$/.test( task.worldId ) || typeof task.instruction !== 'string' || ! task.instruction.trim() || task.instruction.length > 8000 || task.actionProtocol !== 'elsemesh.blender-actions/1' ) throw new Error( 'invalid AI edit task header' );
	if ( ! Array.isArray( task.includedObjectIds ) || task.includedObjectIds.length > 128 || new Set( task.includedObjectIds ).size !== task.includedObjectIds.length || task.includedObjectIds.some( ( id ) => ! OBJECT_ID.test( id ) ) || ! Array.isArray( task.includedPortalIds ) || task.includedPortalIds.length > 128 || new Set( task.includedPortalIds ).size !== task.includedPortalIds.length || task.includedPortalIds.some( ( id ) => ! PORTAL_ID.test( id ) ) || ! Array.isArray( task.availableAssetIds ) || task.availableAssetIds.length > 256 || task.availableAssetIds.some( ( id ) => ! HASH.test( id ) ) || new Set( task.availableAssetIds ).size !== task.availableAssetIds.length ) throw new Error( 'invalid task object, portal, or asset allow-list' );
	if ( ! task.files || Object.keys( task.files ).sort().join( ',' ) !== 'assets,blend,plan,source' || safeRelative( task.files.source, 'source path' ) !== 'world-source.json' || safeRelative( task.files.blend, 'blend path' ) !== 'scene.blend' || safeRelative( task.files.assets, 'asset directory' ) !== 'assets' || safeRelative( task.files.plan, 'plan path' ) !== 'plan.json' ) throw new Error( 'task files must use the supported fixed names' );
	const sourcePath = path.join( taskRoot, task.files.source );
	const blendPath = path.join( taskRoot, task.files.blend );
	const planPath = path.join( taskRoot, task.files.plan );
	const assetsPath = path.join( taskRoot, task.files.assets );
	const sourceInfo = await regularFile( sourcePath, MAX_SOURCE_BYTES, 'world source' );
	const blendInfo = await regularFile( blendPath, MAX_BLEND_BYTES, 'Blender scene' );
	const planInfo = await regularFile( planPath, MAX_PLAN_BYTES, 'action plan' );
	if ( sourceInfo.size + blendInfo.size + planInfo.size > MAX_TASK_BYTES ) throw new Error( 'task bundle exceeds the 2 GiB total size limit' );
	const sourceBytes = await readFile( sourcePath );
	if ( `sha256:${createHash( 'sha256' ).update( sourceBytes ).digest( 'hex' )}` !== task.sourceHash ) throw new Error( 'task source snapshot hash mismatch' );
	const source = validateWorldSource( JSON.parse( sourceBytes.toString( 'utf8' ) ) );
	if ( await digest( blendPath ) !== task.blendHash ) throw new Error( 'task Blender scene hash mismatch' );
	if ( source.worldId !== task.worldId ) throw new Error( 'task world ID does not match its source snapshot' );
	const objectIDs = new Set( source.objects.map( ( object ) => object.id ) );
	const portalIDs = new Set( source.portals.map( ( portal ) => portal.id ) );
	if ( task.includedObjectIds.some( ( id ) => ! objectIDs.has( id ) ) || task.includedPortalIds.some( ( id ) => ! portalIDs.has( id ) ) ) throw new Error( 'task includes an object or portal not present in its source snapshot' );
	const sourceAssets = new Set( source.objects.map( ( object ) => object.assetId ).filter( ( id ) => HASH.test( id || '' ) ) );
	for ( const component of source.components || [] ) {
		if ( HASH.test( component.placementAssetId || '' ) ) sourceAssets.add( component.placementAssetId );
		for ( const bed of component.beds || [] ) if ( HASH.test( bed.assetId || '' ) ) sourceAssets.add( bed.assetId );
	}
	if ( task.availableAssetIds.some( ( id ) => ! sourceAssets.has( id ) ) ) throw new Error( 'task asset allow-list contains an asset absent from the source' );
	await validateFlatDirectory( assetsPath, new Set( task.availableAssetIds.map( ( id ) => id.slice( 7 ) ) ), 'task assets' );
	let totalBytes = sourceInfo.size + blendInfo.size + planInfo.size;
	for ( const assetId of task.availableAssetIds ) {
		const assetPath = path.join( assetsPath, assetId.slice( 7 ) );
		const info = await regularFile( assetPath, MAX_ASSET_BYTES, `asset ${assetId}` );
		totalBytes += info.size;
		if ( totalBytes > MAX_TASK_BYTES ) throw new Error( 'task bundle exceeds the 2 GiB total size limit' );
		if ( await digest( assetPath ) !== assetId ) throw new Error( `task asset failed content hash verification: ${assetId}` );
	}
	const plan = JSON.parse( await readFile( planPath, 'utf8' ) );
	if ( ! plan || plan.protocol !== task.actionProtocol || plan.sourceHash !== task.sourceHash || ! Array.isArray( plan.actions ) || plan.actions.length > 256 ) throw new Error( 'action plan protocol, source hash, or action count is invalid' );
	validateScopedActions( plan.actions, task );
	return { taskRoot, task, source, sourceBytes, plan, planPath, sourcePath, blendPath, assetsPath, outputAssetsRequired: plan.actions.some( ( action ) => action?.op === 'mesh.create' ), actionCounts: countActions( plan.actions ) };
}

export function validateScopedActions(actions, task) {
	const allowedObjects = new Set( task.includedObjectIds );
	const allowedPortals = new Set( task.includedPortalIds );
	const availableAssets = new Set( task.availableAssetIds );
	for ( const action of actions ) {
		if ( ! action || typeof action !== 'object' || Array.isArray( action ) ) throw new Error( 'action plan entries must be objects' );
		switch ( action.op ) {
			case 'object.add':
				if ( ! availableAssets.has( action.object?.assetId ) ) throw new Error( 'object.add may use only assets explicitly included in the task bundle' );
				break;
			case 'mesh.create':
			case 'portal.add':
				break;
			case 'object.update':
			case 'object.remove':
				if ( ! allowedObjects.has( action.id ) ) throw new Error( `${action.op} is outside the task object allow-list` );
				if ( action.op === 'object.update' && action.fields?.assetId !== undefined && ! availableAssets.has( action.fields.assetId ) ) throw new Error( 'object.update may use only assets explicitly included in the task bundle' );
				break;
			case 'portal.update':
			case 'portal.remove':
				if ( ! allowedPortals.has( action.id ) ) throw new Error( `${action.op} is outside the task portal allow-list` );
				break;
			default: throw new Error( `unsupported scoped action: ${String( action.op )}` );
		}
	}
}

function countActions(actions) {
	const counts = {};
	for ( const action of actions ) if ( action && typeof action.op === 'string' ) counts[ action.op ] = ( counts[ action.op ] || 0 ) + 1;
	return counts;
}

export function buildSandboxCommand({ bwrap, prlimit, blender, runner = ACTION_RUNNER, taskRoot, outputRoot, outputAssetsRequired, limits = WORKER_LIMITS }) {
	const blenderArgs = [ '--background', '--factory-startup', '/task/scene.blend', '--python', '/worker/world_actions.py', '--',
		'--plan', '/task/plan.json', '--source', '/task/world-source.json', '--assets', '/task/assets',
		'--out-source', '/out/candidate.world-source.json', '--out-blend', '/out/candidate.blend',
	];
	if ( outputAssetsRequired ) blenderArgs.push( '--out-assets', '/out/assets' );
	const bubbleArgs = [
		'--die-with-parent', '--new-session', '--unshare-all', '--clearenv',
		'--ro-bind', '/usr', '/usr',
		...( [ '/bin', '/lib', '/lib64' ].filter( ( item ) => existsSync(item) ).flatMap( ( item ) => [ '--ro-bind', item, item ] ) ),
		'--dir', '/etc', ...( existsSync('/etc/ld.so.cache') ? [ '--ro-bind', '/etc/ld.so.cache', '/etc/ld.so.cache' ] : [] ),
		'--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/tmp/home', '--dir', '/tmp/config',
		'--setenv', 'HOME', '/tmp/home', '--setenv', 'TMPDIR', '/tmp', '--setenv', 'PATH', '/usr/bin:/bin',
		'--setenv', 'BLENDER_USER_CONFIG', '/tmp/config', '--setenv', 'BLENDER_USER_SCRIPTS', '/tmp/config/scripts',
		'--setenv', 'BLENDER_USER_DATAFILES', '/tmp/config/datafiles', '--setenv', 'PYTHONDONTWRITEBYTECODE', '1',
		'--ro-bind', taskRoot, '/task', '--dir', '/worker', '--ro-bind', runner, '/worker/world_actions.py',
		'--bind', outputRoot, '/out', '--chdir', '/task', '--', blender, ...blenderArgs,
	];
	return { command: prlimit, args: [
		`--cpu=${limits.cpuSeconds}`, `--as=${limits.addressSpaceBytes}`, `--fsize=${limits.fileBytes}`,
		`--nofile=${limits.openFiles}`, `--nproc=${limits.processes}`, '--', bwrap, ...bubbleArgs,
	] };
}

function existsSync(file) { try { return lstatSync( file ).isDirectory() || lstatSync( file ).isFile() || lstatSync( file ).isSymbolicLink(); } catch { return false; } }

function commandPath(name) {
	if ( path.isAbsolute( name ) ) return name;
	for ( const part of ( process.env.PATH || '' ).split( path.delimiter ) ) {
		const candidate = path.join( part, name );
		try { const info = statSync( candidate ); if ( info.isFile() && ( info.mode & 0o111 ) !== 0 ) return candidate; } catch {}
	}
	throw new Error( `${name} is not installed or not executable from PATH` );
}

async function validateWorkerExecutables(blenderArg) {
	const resolveExecutable = async ( name ) => {
		const resolved = await realpath( commandPath( name ) );
		const info = await stat( resolved );
		await access( resolved, 1 );
		if ( ! info.isFile() || ( info.mode & 0o111 ) === 0 ) throw new Error( `${name} is not a regular executable file` );
		if ( ! isWithin( '/usr', resolved ) ) throw new Error( `${name} must be installed under /usr` );
		return resolved;
	};
	const bwrap = await resolveExecutable( 'bwrap' );
	const prlimit = await resolveExecutable( 'prlimit' );
	const blender = await resolveExecutable( blenderArg || 'blender' );
	if ( ! isWithin( '/usr', blender ) ) throw new Error( 'sandbox worker currently supports Blender installed under /usr only' );
	const runnerInfo = await regularFile( ACTION_RUNNER, 1024 * 1024, 'trusted Blender action runner' );
	if ( runnerInfo.size === 0 ) throw new Error( 'trusted Blender action runner is empty' );
	return { bwrap, prlimit, blender };
}

function runLimited(command, args) {
	return new Promise( ( resolve, reject ) => {
		const child = spawn( command, args, { stdio: 'inherit', env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } } );
		let timedOut = false;
		const timer = setTimeout( () => { timedOut = true; child.kill( 'SIGTERM' ); setTimeout( () => child.kill( 'SIGKILL' ), 5000 ).unref(); }, WORKER_TIMEOUT_MS );
		timer.unref();
		child.once( 'error', ( error ) => { clearTimeout( timer ); reject( error ); } );
		child.once( 'close', ( code, signal ) => {
			clearTimeout( timer );
			if ( timedOut ) reject( new Error( 'Blender worker exceeded its 20-minute wall-clock limit' ) );
			else if ( code !== 0 ) reject( new Error( `sandboxed Blender worker failed (${signal || code})` ) );
			else resolve();
		} );
	} );
}

async function scanOutput(outputRoot) {
	const entries = await readdir( outputRoot, { withFileTypes: true } );
	let bytes = 0;
	for ( const entry of entries ) {
		if ( entry.isSymbolicLink() ) throw new Error( 'worker output contains a symlink' );
		const fullPath = path.join( outputRoot, entry.name );
		if ( entry.isFile() ) {
			const info = await regularFile( fullPath, MAX_OUTPUT_BYTES, 'worker output file' );
			bytes += info.size;
		} else if ( entry.isDirectory() && entry.name === 'assets' ) {
			for ( const asset of await readdir( fullPath, { withFileTypes: true } ) ) {
				if ( ! asset.isFile() || asset.isSymbolicLink() || ! /^[0-9a-f]{64}$/.test( asset.name ) ) throw new Error( 'worker output assets must use regular SHA-256-named files' );
				const assetPath = path.join( fullPath, asset.name );
				const info = await regularFile( assetPath, MAX_OUTPUT_BYTES, 'generated asset' );
				bytes += info.size;
				if ( await digest( assetPath ) !== `sha256:${asset.name}` ) throw new Error( `generated asset failed content hash verification: ${asset.name}` );
			}
		} else throw new Error( `unexpected worker output: ${entry.name}` );
		if ( bytes > MAX_OUTPUT_BYTES ) throw new Error( 'worker output exceeded the 1 GiB total limit' );
	}
	return bytes;
}

export async function runAIEditWorker({ taskPath, outputPath, blender }) {
	const bundle = await validateAITaskBundle( taskPath );
	const binaries = await validateWorkerExecutables( blender );
	const output = path.resolve( outputPath );
	const parent = await realpath( path.dirname( output ) );
	if ( parent !== path.dirname( output ) ) throw new Error( 'output parent must not be a symlink' );
	if ( isWithin( bundle.taskRoot, output ) || isWithin( output, bundle.taskRoot ) ) throw new Error( 'worker output must be separate from the input task bundle' );
	await mkdir( output, { mode: 0o700 } );
	await chmod( output, 0o700 );
	try {
		const invocation = buildSandboxCommand( { ...binaries, taskRoot: bundle.taskRoot, outputRoot: output, outputAssetsRequired: bundle.outputAssetsRequired } );
		await runLimited( invocation.command, invocation.args );
		const outputBytes = await scanOutput( output );
		const expectedOutput = new Set( [ 'candidate.world-source.json', 'candidate.blend', ...( bundle.outputAssetsRequired ? [ 'assets' ] : [] ) ] );
		const actualOutput = await readdir( output );
		if ( actualOutput.length !== expectedOutput.size || actualOutput.some( ( name ) => ! expectedOutput.has( name ) ) ) throw new Error( 'worker did not produce the exact expected candidate artifacts' );
		const candidatePath = path.join( output, 'candidate.world-source.json' );
		const candidateInfo = await regularFile( candidatePath, MAX_SOURCE_BYTES, 'candidate world source' );
		const candidateBytes = await readFile( candidatePath );
		const candidate = validateWorldSource( JSON.parse( candidateBytes.toString( 'utf8' ) ) );
		if ( candidate.worldId !== bundle.task.worldId ) throw new Error( 'candidate changed the world ID' );
		const originalAssetIds = new Set( bundle.source.objects.map( ( item ) => item.assetId ).filter( ( id ) => HASH.test( id || '' ) ) );
		for ( const object of candidate.objects ) {
			if ( HASH.test( object.assetId || '' ) && ! originalAssetIds.has( object.assetId ) ) {
				const generatedAssetPath = path.join( output, 'assets', object.assetId.slice( 7 ) );
				if ( ! bundle.outputAssetsRequired || await digest( generatedAssetPath ).catch( () => null ) !== object.assetId ) throw new Error( `candidate references a generated asset that is missing or invalid: ${object.assetId}` );
			}
		}
		const baseRecords = new Map( bundle.source.objects.map( ( item ) => [ item.id, item ] ) );
		const basePortals = new Map( bundle.source.portals.map( ( item ) => [ item.id, item ] ) );
		const changedObjects = candidate.objects.filter( ( item ) => JSON.stringify( item ) !== JSON.stringify( baseRecords.get( item.id ) ) ).map( ( item ) => item.id );
		const report = {
			protocol: 'elsemesh.ai-edit-review/1', taskId: bundle.task.taskId, worldId: bundle.task.worldId,
			baseSourceHash: bundle.task.sourceHash, candidateSourceHash: `sha256:${createHash( 'sha256' ).update( candidateBytes ).digest( 'hex' )}`,
			candidateSourceBytes: candidateInfo.size, outputBytes, actionCounts: bundle.actionCounts,
			addedObjectIds: candidate.objects.filter( ( item ) => ! baseRecords.has( item.id ) ).map( ( item ) => item.id ),
			removedObjectIds: [ ...baseRecords.keys() ].filter( ( id ) => ! candidate.objects.some( ( item ) => item.id === id ) ),
			changedObjectIds: changedObjects,
			addedPortalIds: candidate.portals.filter( ( item ) => ! bundle.source.portals.some( ( prior ) => prior.id === item.id ) ).map( ( item ) => item.id ),
			removedPortalIds: bundle.source.portals.filter( ( item ) => ! candidate.portals.some( ( next ) => next.id === item.id ) ).map( ( item ) => item.id ),
			changedPortalIds: candidate.portals.filter( ( item ) => JSON.stringify( item ) !== JSON.stringify( basePortals.get( item.id ) ) ).map( ( item ) => item.id ),
			changedWorldFields: [ 'title', 'styleGuide', 'rules', 'hosts', 'components' ].filter( ( key ) => JSON.stringify( candidate[ key ] ) !== JSON.stringify( bundle.source[ key ] ) ),
			signed: false, published: false,
		};
		await writeFile( path.join( output, 'review.json' ), `${JSON.stringify( report, null, 2 )}\n`, { mode: 0o600, flag: 'wx' } );
		return report;
	} catch ( error ) {
		await rm( output, { recursive: true, force: true } );
		throw error;
	}
}

async function main() {
	const args = parseArgs( process.argv.slice( 2 ) );
	const report = await runAIEditWorker( { taskPath: args.task, outputPath: args.out, blender: args.blender } );
	console.log( `Produced an unsigned candidate for ${report.worldId}: ${report.addedObjectIds.length} objects added, ${report.changedObjectIds.length} changed, ${report.removedObjectIds.length} removed.` );
	console.log( `Review report: ${path.join( path.resolve( args.out ), 'review.json' )}` );
	console.log( 'Nothing was signed or published. The owner must inspect the source diff, Blender scene, and generated assets.' );
}

if ( process.argv[ 1 ] && path.resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) main().catch( ( error ) => { console.error( error.message ); process.exitCode = 1; } );
