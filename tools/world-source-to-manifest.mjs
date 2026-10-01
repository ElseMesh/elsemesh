#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { validateWorldSource } from '../src/network/WorldSource.js';

function options(argv) {
	const result = {};
	for ( let i = 0; i < argv.length; i ++ ) {
		const key = argv[ i ];
		if ( ! [ '--source', '--owner', '--assets', '--out', '--version' ].includes( key ) || ! argv[ i + 1 ] ) throw new Error( `Invalid or incomplete option: ${key}` );
		result[ key.slice( 2 ) ] = argv[ ++ i ];
	}
	for ( const key of [ 'source', 'owner', 'assets', 'out' ] ) if ( ! result[ key ] ) throw new Error( `Missing --${key}` );
	return result;
}

async function main() {
	const args = options( process.argv.slice( 2 ) );
	const source = validateWorldSource( JSON.parse( await readFile( args.source, 'utf8' ) ) );
	const version = args.version === undefined ? 1 : Number( args.version );
	if ( ! Number.isSafeInteger( version ) || version < 1 ) throw new Error( '--version must be a positive integer' );
	if ( source.styleGuide.length > 512 ) throw new Error( 'styleGuide exceeds the runtime manifest limit of 512 characters' );
	const updatedAt = Date.parse( source.updatedAt );
	const validTimestamp = typeof source.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test( source.updatedAt ) && Number.isFinite( updatedAt );
	if ( ! validTimestamp ) throw new Error( 'source updatedAt must be a valid ISO date-time' );
	const assets = new Map();
	for ( const object of source.objects ) {
		if ( ! object.assetId ) throw new Error( `Object ${object.id} has no assetId; add/export its GLB and import it with worldd --import-asset` );
		const id = object.assetId;
		let ref = assets.get( id );
		if ( ! ref ) {
			const assetPath = path.join( args.assets, id.slice( 'sha256:'.length ) );
			const info = await stat( assetPath );
			if ( ! info.isFile() || info.size > 2 * 1024 * 1024 * 1024 ) throw new Error( `Invalid or oversized asset ${id}` );
			const hasher = createHash( 'sha256' );
			for await ( const chunk of createReadStream( assetPath ) ) hasher.update( chunk );
			const digest = hasher.digest( 'hex' );
			if ( `sha256:${digest}` !== id ) throw new Error( `Hash mismatch for imported asset ${id}` );
			ref = { id, bytes: info.size, kind: 'glb', priority: 'background' };
			assets.set( id, ref );
		}
		const priority = object.priority || 'visible';
		if ( ! [ 'portal-preview', 'visible', 'nearby', 'background' ].includes( priority ) ) throw new Error( `Invalid stream priority on ${object.id}` );
		const rank = [ 'portal-preview', 'visible', 'nearby', 'background' ];
		if ( rank.indexOf( priority ) < rank.indexOf( ref.priority ) ) ref.priority = priority;
	}
	const manifest = {
		protocol: 'tidewater.world/1',
		worldId: source.worldId,
		ownerPeerId: args.owner,
		authorityPeerId: args.owner,
		authorityEpoch: 1,
		discoverable: false,
		version,
		title: source.title,
		rules: { ...source.rules, styleGuide: source.styleGuide },
		assets: [ ...assets.values() ],
		objects: source.objects.map( ( { id, kind, label, assetId, transform, scale, collision } ) => ( { id, kind, label, assetId, transform, scale, collision } ) ),
		portals: source.portals,
		hosts: [],
		updatedAt: Math.floor( updatedAt / 1000 ),
	};
	await writeFile( args.out, `${JSON.stringify( manifest, null, 2 )}\n`, { flag: 'wx' } );
	console.log( `Wrote unsigned manifest for ${manifest.worldId} with ${manifest.objects.length} objects, ${manifest.portals.length} portals and ${manifest.assets.length} assets.` );
}

main().catch( ( error ) => { console.error( error.message ); process.exitCode = 1; } );
