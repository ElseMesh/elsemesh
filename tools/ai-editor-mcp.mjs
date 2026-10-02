#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmod, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { MAX_PLAN_BYTES, runAIEditWorker, validateAITaskBundle, validateScopedActions } from './run-ai-edit-worker.mjs';

function parseArgs(argv) {
	const result = {};
	for ( let i = 0; i < argv.length; i ++ ) {
		const key = argv[ i ];
		if ( ! [ '--task', '--out', '--blender', '--blender-prefix' ].includes( key ) || ! argv[ i + 1 ] ) throw new Error( `Invalid or incomplete option: ${key}` );
		result[ key.slice( 2 ) ] = argv[ ++ i ];
	}
	for ( const key of [ 'task', 'out' ] ) if ( ! result[ key ] ) throw new Error( `Missing --${key}` );
	return result;
}

function sha256(bytes) {
	return `sha256:${createHash( 'sha256' ).update( bytes ).digest( 'hex' )}`;
}

export async function readAIEditTaskContext(taskPath) {
	const bundle = await validateAITaskBundle( taskPath, { requirePlan: false } );
	const includedObjects = new Set( bundle.task.includedObjectIds );
	const includedPortals = new Set( bundle.task.includedPortalIds );
	const context = {
		protocol: 'elsemesh.ai-edit-context/1',
		task: bundle.task,
		world: {
			id: bundle.source.worldId,
			title: bundle.source.title,
			styleGuide: bundle.source.styleGuide,
			rules: bundle.source.rules,
			objectCount: bundle.source.objects.length,
			portalCount: bundle.source.portals.length,
			componentTypes: ( bundle.source.components || [] ).map( ( item ) => item.type ),
		},
		editableObjects: bundle.source.objects.filter( ( object ) => includedObjects.has( object.id ) ),
		editablePortals: bundle.source.portals.filter( ( portal ) => includedPortals.has( portal.id ) ),
		availableAssets: bundle.task.availableAssetIds,
		actions: [ 'mesh.create', 'object.add', 'object.update', 'object.remove', 'portal.add', 'portal.update', 'portal.remove' ],
		worker: { isolation: 'Bubblewrap private namespaces, no network, bounded resources', ownerKeysAvailable: false, publicationAvailable: false },
	};
	return context;
}

export async function submitAIEditPlan(taskPath, actions) {
	if ( ! Array.isArray( actions ) || actions.length > 256 ) throw new Error( 'actions must be an array with at most 256 entries' );
	const bundle = await validateAITaskBundle( taskPath, { requirePlan: false } );
	validateScopedActions( actions, bundle.task );
	const plan = { protocol: bundle.task.actionProtocol, sourceHash: bundle.task.sourceHash, actions };
	const bytes = Buffer.from( `${JSON.stringify( plan, null, 2 )}\n` );
	if ( bytes.length > MAX_PLAN_BYTES ) throw new Error( 'action plan exceeds the 16 MiB size limit' );
	const planPath = path.join( bundle.taskRoot, 'plan.json' );
	await writeFile( planPath, bytes, { flag: 'wx', mode: 0o400 } );
	await chmod( planPath, 0o400 );
	return { taskId: bundle.task.taskId, sourceHash: bundle.task.sourceHash, planHash: sha256( bytes ), actionCount: actions.length };
}

export function createAIEditorMcpServer({ taskPath, outputPath, blender, blenderPrefix, worker = runAIEditWorker }) {
	const server = new McpServer( { name: 'elsemesh-ai-editor', version: '1.0.0' } );
	server.registerTool( 'get_task_context', {
		description: 'Read the configured, owner-scoped Blender editing task and its allow-listed source context.',
		inputSchema: z.object( {} ).strict(),
	}, async () => ( { content: [ { type: 'text', text: JSON.stringify( await readAIEditTaskContext( taskPath ) ) } ] } ) );
	server.registerTool( 'submit_action_plan', {
		description: 'Submit one typed Blender action plan for the configured task. Only allow-listed object and portal IDs and task assets are accepted. The plan cannot be replaced.',
		inputSchema: z.object( { actions: z.array( z.record( z.string(), z.unknown() ) ).max( 256 ) } ).strict(),
	}, async ( { actions } ) => ( { content: [ { type: 'text', text: JSON.stringify( await submitAIEditPlan( taskPath, actions ) ) } ] } ) );
	server.registerTool( 'run_candidate', {
		description: 'Run the submitted action plan in the isolated Blender worker and return its unsigned review report. This does not sign, accept, or publish the candidate.',
		inputSchema: z.object( {} ).strict(),
	}, async () => {
		const report = await worker( { taskPath, outputPath, blender, blenderPrefix } );
		return { content: [ { type: 'text', text: JSON.stringify( { report, reviewHTML: path.join( path.resolve( outputPath ), 'review.html' ), candidateBlend: path.join( path.resolve( outputPath ), 'candidate.blend' ), published: false } ) } ] };
	} );
	return server;
}

async function main() {
	const args = parseArgs( process.argv.slice( 2 ) );
	const taskInfo = await lstat( args.task );
	if ( ! taskInfo.isDirectory() || taskInfo.isSymbolicLink() ) throw new Error( '--task must be an existing, real task directory' );
	await readAIEditTaskContext( args.task );
	await serveStdio( () => createAIEditorMcpServer( { taskPath: args.task, outputPath: args.out, blender: args.blender, blenderPrefix: args.blenderPrefix } ) );
}

if ( process.argv[ 1 ] && path.resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) main().catch( ( error ) => { process.stderr.write( `${error.message}\n` ); process.exitCode = 1; } );
