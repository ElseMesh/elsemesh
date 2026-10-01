#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TerrainData } from '../src/world/TerrainData.js';
import { parseGLB } from '../src/engine/loaders/GLTF.js';
import { Euler, Quaternion } from '../src/engine/index.js';
import { Village } from '../src/world/Village.js';
import { Rocks } from '../src/world/Rocks.js';
import { Colliders } from '../src/world/Colliders.js';
import { Builder } from '../src/world/village/GeoBuilder.js';
import { InstancedProps } from '../src/world/Props.js';
import { DebrisPlacer } from '../src/world/debris/DebrisPlacement.js';
import { SCAN_ASSETS } from '../src/world/debris/ScannedDebris.js';

const REPO = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const args = process.argv.slice( 2 );
let output = path.join( REPO, 'worlds', 'island' );
for ( let i = 0; i < args.length; i ++ ) {
	if ( args[ i ] !== '--out' || ! args[ i + 1 ] ) throw new Error( `Unknown or incomplete option: ${args[ i ]}` );
	output = path.resolve( args[ ++ i ] );
}

const sourcePath = path.join( output, 'world-source.json' );
let updatedAt = '2026-10-01T00:00:00Z';
try {
	const previous = JSON.parse( await readFile( sourcePath, 'utf8' ) );
	if ( typeof previous.updatedAt === 'string' ) updatedAt = previous.updatedAt;
} catch ( error ) {
	if ( error.code !== 'ENOENT' ) throw error;
}
if ( process.env.SOURCE_DATE_EPOCH !== undefined ) {
	const epoch = Number( process.env.SOURCE_DATE_EPOCH );
	if ( ! Number.isSafeInteger( epoch ) || epoch < 0 ) throw new Error( 'SOURCE_DATE_EPOCH must be a non-negative integer' );
	updatedAt = new Date( epoch * 1000 ).toISOString();
}

const terrain = new TerrainData( 7 );
const glb = exportTerrain( terrain, 512 );
const assetId = `sha256:${createHash( 'sha256' ).update( glb ).digest( 'hex' )}`;
const staticAssets = new Map( [ [ assetId, glb ] ] );
const debris = buildScannedDebrisInstances( terrain );
const debrisAssetIDs = new Map();
for ( const assetName of SCAN_ASSETS ) {
	const originalGLB = await readFile( path.join( REPO, 'public', 'models', 'debris', `${assetName}.glb` ) );
	const albedo = await readFile( path.join( REPO, 'public', 'models', 'debris', `${assetName}_albedo.jpg` ) );
	const packagedGLB = exportScannedLOD( originalGLB, albedo, assetName );
	const packagedID = `sha256:${createHash( 'sha256' ).update( packagedGLB ).digest( 'hex' )}`;
	debrisAssetIDs.set( assetName, packagedID );
	staticAssets.set( packagedID, packagedGLB );
}
const assetsPath = path.join( output, 'assets' );
await mkdir( assetsPath, { recursive: true } );
for ( const entry of await readdir( assetsPath, { withFileTypes: true } ) ) {
	if ( entry.isFile() && /^[0-9a-f]{64}$/.test( entry.name ) && ! [ ...staticAssets.keys() ].some( ( id ) => id.slice( 'sha256:'.length ) === entry.name ) ) await rm( path.join( assetsPath, entry.name ) );
}
for ( const [ id, bytes ] of staticAssets ) await writeFile( path.join( assetsPath, id.slice( 'sha256:'.length ) ), bytes );

const source = {
	protocol: 'tidewater.world-source/1',
	worldId: 'tw-world:example-island',
	title: 'Example Island',
	coordinateSystem: 'right-handed-y-up-meters',
	styleGuide: 'Procedural volcanic island terrain. Preserve the coast, central bay, volcanic ridge, beaches, seabed, and terrain color regions.',
	rules: {
		gravity: 1,
		avatarComplexity: 20000,
		physicsProfile: 'tidewater-default',
		requiredFeatures: [ 'tidewater.static-glb/1', 'tidewater.static-glb-quaternion/1' ],
		maxPackageBytes: 64 * 1024 * 1024,
	},
	hosts: [],
	objects: [ {
		id: 'tw-object:island-terrain',
		kind: 'asset-instance',
		label: 'Procedural island terrain',
		assetId,
		priority: 'visible',
		transform: { position: [ 0, 0, 0 ], yaw: 0 },
		scale: [ 1, 1, 1 ],
		collision: { shape: 'heightfield', enabled: true, columns: 513, rows: 513, walkable: true, solid: true },
	}, ...debris.map( ( instance, index ) => {
		const assetName = SCAN_ASSETS[ instance.asset ];
		const rotation = new Quaternion().setFromEuler( new Euler( instance.roll || 0, instance.yaw, instance.pitch || 0, 'YXZ' ) ).toArray();
		return {
			id: `tw-object:scanned-debris-${index}`,
			kind: 'asset-instance',
			label: assetName.replaceAll( '_', ' ' ),
			assetId: debrisAssetIDs.get( assetName ),
			priority: 'visible',
			transform: { position: [ instance.x, instance.y, instance.z ], yaw: instance.yaw, rotation },
			scale: [ instance.sx, instance.sy, instance.sz ],
			collision: { shape: 'none', enabled: false },
		};
	} ) ],
	portals: [],
	updatedAt,
};
await writeFile( sourcePath, `${JSON.stringify( source, null, 2 )}\n` );
console.log( `Wrote ${sourcePath}` );
console.log( `Wrote ${staticAssets.size} content-addressed assets (${debris.length} scanned debris instances)` );

function buildScannedDebrisInstances( terrainData ) {
	const scene = { add() {}, remove() {} };
	// Village's final assembly combines geometry and uploads GPU-backed fish props. The package
	// needs the same CPU-authored building pads and colliders, which are created before assembly.
	class PackageVillage extends Village { _assemble() { this.meshes = []; } }
	const colliders = new Colliders();
	const village = new PackageVillage( { scene, terrain: terrainData, colliders } );
	const rocks = new Rocks( { scene, terrain: terrainData, village, colliders, castShadow: false, sunShadow: false } );
	const B = new Builder();
	const placer = new DebrisPlacer( { B, inst: new InstancedProps( B ), terrain: terrainData, village, rocks, colliders } ).run();
	return placer.scanned;
}

function exportScannedLOD( sourceBytes, albedoBytes, name ) {
	const parsed = parseGLB( sourceBytes.buffer.slice( sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength ) );
	const primitive = parsed.meshes[ 1 ]?.[ 0 ];
	if ( ! primitive?.attributes?.POSITION || ! primitive.attributes.NORMAL || ! primitive.attributes.TEXCOORD_0 || ! primitive.indices ) throw new Error( `Scanned asset ${name} has no supported LOD1 triangle mesh` );
	const chunks = [];
	const bufferViews = [];
	const accessors = [];
	let byteLength = 0;
	const append = ( bytes, { target, mimeType } = {} ) => {
		const padding = ( 4 - byteLength % 4 ) % 4;
		if ( padding ) { chunks.push( Buffer.alloc( padding ) ); byteLength += padding; }
		const view = { buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength };
		if ( target !== undefined ) view.target = target;
		if ( mimeType ) view.mimeType = mimeType;
		bufferViews.push( view );
		chunks.push( bytes );
		byteLength += bytes.byteLength;
		return bufferViews.length - 1;
	};
	const addAccessor = ( attribute, type, target, bounds = false ) => {
		const bytes = Buffer.from( attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength );
		const bufferView = append( bytes, { target } );
		const accessor = { bufferView, componentType: attribute.componentType, count: attribute.array.length / attribute.itemSize, type };
		if ( attribute.normalized ) accessor.normalized = true;
		if ( bounds ) {
			const min = [ Infinity, Infinity, Infinity ], max = [ - Infinity, - Infinity, - Infinity ];
			for ( let i = 0; i < attribute.array.length; i += 3 ) for ( let axis = 0; axis < 3; axis ++ ) {
				min[ axis ] = Math.min( min[ axis ], attribute.array[ i + axis ] );
				max[ axis ] = Math.max( max[ axis ], attribute.array[ i + axis ] );
			}
			accessor.min = min; accessor.max = max;
		}
		accessors.push( accessor );
		return accessors.length - 1;
	};
	const attributes = primitive.attributes;
	const position = addAccessor( attributes.POSITION, 'VEC3', 34962, true );
	const normal = addAccessor( attributes.NORMAL, 'VEC3', 34962 );
	const sourceUV = attributes.TEXCOORD_0;
	const uvArray = Float32Array.from( sourceUV.array, ( value ) => Math.min( 0.998, Math.max( 0.002, value ) ) );
	const uv = addAccessor( { ...sourceUV, array: uvArray, componentType: 5126, normalized: false }, 'VEC2', 34962 );
	const indices = addAccessor( { array: primitive.indices, itemSize: 1, componentType: primitive.indices instanceof Uint32Array ? 5125 : 5123 }, 'SCALAR', 34963 );
	const imageView = append( albedoBytes, { mimeType: 'image/jpeg' } );
	const binary = Buffer.concat( chunks );
	const gltf = {
		asset: { version: '2.0', generator: 'ElseMesh island scanned asset exporter/1' },
		scene: 0, scenes: [ { nodes: [ 0 ] } ], nodes: [ { name, mesh: 0 } ],
		meshes: [ { name, primitives: [ { attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: uv }, indices, material: 0, mode: 4 } ] } ],
		materials: [ { name: `${name} albedo`, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } } ],
		textures: [ { sampler: 0, source: 0 } ], samplers: [ { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 } ],
		images: [ { bufferView: imageView, mimeType: 'image/jpeg', name: `${name} albedo` } ],
		accessors, bufferViews, buffers: [ { byteLength: binary.length } ],
	};
	const json = Buffer.from( JSON.stringify( gltf ) );
	const jsonPadded = Buffer.concat( [ json, Buffer.alloc( ( 4 - json.length % 4 ) % 4, 0x20 ) ] );
	const binPadded = Buffer.concat( [ binary, Buffer.alloc( ( 4 - binary.length % 4 ) % 4 ) ] );
	const totalLength = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
	const header = Buffer.alloc( 12 );
	header.writeUInt32LE( 0x46546c67, 0 ); header.writeUInt32LE( 2, 4 ); header.writeUInt32LE( totalLength, 8 );
	const jsonHeader = Buffer.alloc( 8 ); jsonHeader.writeUInt32LE( jsonPadded.length, 0 ); jsonHeader.writeUInt32LE( 0x4e4f534a, 4 );
	const binHeader = Buffer.alloc( 8 ); binHeader.writeUInt32LE( binPadded.length, 0 ); binHeader.writeUInt32LE( 0x004e4942, 4 );
	return Buffer.concat( [ header, jsonHeader, jsonPadded, binHeader, binPadded ] );
}

function exportTerrain( data, segments ) {
	const side = segments + 1;
	const vertexCount = side * side;
	const indexCount = segments * segments * 6;
	const positions = Buffer.allocUnsafe( vertexCount * 3 * 4 );
	const normals = Buffer.allocUnsafe( vertexCount * 3 * 4 );
	const colors = Buffer.allocUnsafe( vertexCount * 3 );
	const indices = Buffer.allocUnsafe( indexCount * 4 );
	const p = new DataView( positions.buffer, positions.byteOffset, positions.byteLength );
	const n = new DataView( normals.buffer, normals.byteOffset, normals.byteLength );
	const indexView = new DataView( indices.buffer, indices.byteOffset, indices.byteLength );
	const normal = { set( x, y, z ) { this.x = x; this.y = y; this.z = z; return this; }, normalize() { const l = Math.hypot( this.x, this.y, this.z ); this.x /= l; this.y /= l; this.z /= l; return this; } };
	const mins = [ Infinity, Infinity, Infinity ], maxs = [ - Infinity, - Infinity, - Infinity ];

	for ( let z = 0; z < side; z ++ ) {
		const sampleZ = z * ( data.res - 1 ) / segments;
		const iz = Math.round( sampleZ );
		const worldZ = data.origin + ( sampleZ + 0.5 ) * data.texel;
		for ( let x = 0; x < side; x ++ ) {
			const sampleX = x * ( data.res - 1 ) / segments;
			const ix = Math.round( sampleX );
			const worldX = data.origin + ( sampleX + 0.5 ) * data.texel;
			const sourceIndex = iz * data.res + ix;
			const height = data.heights[ sourceIndex ];
			const vertex = z * side + x;
			const offset = vertex * 3;
			p.setFloat32( offset * 4, worldX, true );
			p.setFloat32( ( offset + 1 ) * 4, height, true );
			p.setFloat32( ( offset + 2 ) * 4, worldZ, true );
			data.normalAt( worldX, worldZ, normal );
			n.setFloat32( offset * 4, normal.x, true );
			n.setFloat32( ( offset + 1 ) * 4, normal.y, true );
			n.setFloat32( ( offset + 2 ) * 4, normal.z, true );
			const rgb = terrainColor( height, data.rock[ sourceIndex ], data.sand[ sourceIndex ], data.path[ sourceIndex ], data.seagrass[ sourceIndex ], data.rubble[ sourceIndex ], data.scarp[ sourceIndex ] );
			colors[ offset ] = rgb[ 0 ]; colors[ offset + 1 ] = rgb[ 1 ]; colors[ offset + 2 ] = rgb[ 2 ];
			mins[ 0 ] = Math.min( mins[ 0 ], worldX ); maxs[ 0 ] = Math.max( maxs[ 0 ], worldX );
			mins[ 1 ] = Math.min( mins[ 1 ], height ); maxs[ 1 ] = Math.max( maxs[ 1 ], height );
			mins[ 2 ] = Math.min( mins[ 2 ], worldZ ); maxs[ 2 ] = Math.max( maxs[ 2 ], worldZ );
		}
	}

	let cursor = 0;
	for ( let z = 0; z < segments; z ++ ) for ( let x = 0; x < segments; x ++ ) {
		const a = z * side + x, b = a + 1, c = a + side, d = c + 1;
		indexView.setUint32( cursor, a, true ); cursor += 4;
		indexView.setUint32( cursor, c, true ); cursor += 4;
		indexView.setUint32( cursor, b, true ); cursor += 4;
		indexView.setUint32( cursor, b, true ); cursor += 4;
		indexView.setUint32( cursor, c, true ); cursor += 4;
		indexView.setUint32( cursor, d, true ); cursor += 4;
	}

	const colorPadding = Buffer.alloc( ( 4 - colors.length % 4 ) % 4 );
	const bin = Buffer.concat( [ positions, normals, colors, colorPadding, indices ] );
	const bufferViews = [
		{ buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
		{ buffer: 0, byteOffset: positions.length, byteLength: normals.length, target: 34962 },
		{ buffer: 0, byteOffset: positions.length + normals.length, byteLength: colors.length, target: 34962 },
		{ buffer: 0, byteOffset: positions.length + normals.length + colors.length + colorPadding.length, byteLength: indices.length, target: 34963 },
	];
	const gltf = {
		asset: { version: '2.0', generator: 'ElseMesh deterministic island exporter/1' },
		scene: 0,
		scenes: [ { nodes: [ 0 ] } ],
		nodes: [ { name: 'Procedural island terrain', mesh: 0 } ],
		meshes: [ { primitives: [ { attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0, mode: 4 } ] } ],
		materials: [ { name: 'Island terrain vertex colors', pbrMetallicRoughness: { baseColorFactor: [ 1, 1, 1, 1 ], metallicFactor: 0, roughnessFactor: 0.94 }, doubleSided: false } ],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min: mins, max: maxs },
			{ bufferView: 1, componentType: 5126, count: vertexCount, type: 'VEC3' },
			{ bufferView: 2, componentType: 5121, normalized: true, count: vertexCount, type: 'VEC3' },
			{ bufferView: 3, componentType: 5125, count: indexCount, type: 'SCALAR' },
		],
		bufferViews,
		buffers: [ { byteLength: bin.length } ],
	};
	const json = Buffer.from( JSON.stringify( gltf ) );
	const jsonPadded = Buffer.concat( [ json, Buffer.alloc( ( 4 - json.length % 4 ) % 4, 0x20 ) ] );
	const binPadded = Buffer.concat( [ bin, Buffer.alloc( ( 4 - bin.length % 4 ) % 4 ) ] );
	const totalLength = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
	const header = Buffer.alloc( 12 );
	header.writeUInt32LE( 0x46546c67, 0 ); header.writeUInt32LE( 2, 4 ); header.writeUInt32LE( totalLength, 8 );
	const jsonHeader = Buffer.alloc( 8 ); jsonHeader.writeUInt32LE( jsonPadded.length, 0 ); jsonHeader.writeUInt32LE( 0x4e4f534a, 4 );
	const binHeader = Buffer.alloc( 8 ); binHeader.writeUInt32LE( binPadded.length, 0 ); binHeader.writeUInt32LE( 0x004e4942, 4 );
	return Buffer.concat( [ header, jsonHeader, jsonPadded, binHeader, binPadded ] );
}

function terrainColor( height, rock, sand, path, seagrass, rubble, scarp ) {
	const mix = ( a, b, t ) => Math.round( a + ( b - a ) * t );
	const smooth = ( a, b, x ) => { const t = Math.max( 0, Math.min( 1, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t ); };
	const beach = [ 194, 163, 111 ];
	const grass = [ 82, 112, 49 ];
	const darkGrass = [ 52, 75, 38 ];
	const stone = [ 106, 104, 94 ];
	const seabed = [ 76, 91, 75 ];
	const green = [ 39, 87, 57 ];
	const loose = Math.max( 0, Math.min( 1, sand / 255 ) );
	const rockMask = Math.max( Math.max( 0, Math.min( 1, rock ) ), Math.max( 0, Math.min( 1, scarp / 255 ) ) * 0.92 );
	const pathMask = Math.max( 0, Math.min( 1, path / 255 ) ) * 0.82;
	const grassFactor = smooth( 0.3, 5, height );
	let color = beach.map( ( c, i ) => mix( c, grass[ i ], grassFactor ) );
	color = color.map( ( c, i ) => mix( c, darkGrass[ i ], smooth( 24, 54, height ) * 0.3 ) );
	color = color.map( ( c, i ) => mix( c, stone[ i ], rockMask ) );
	color = color.map( ( c, i ) => mix( c, [ 119, 99, 66 ][ i ], pathMask ) );
	color = color.map( ( c, i ) => mix( c, seabed[ i ], ( 1 - smooth( - 22, - 3, height ) ) * ( 1 - loose * 0.3 ) ) );
	const meadow = Math.max( 0, Math.min( 1, seagrass / 255 ) );
	color = color.map( ( c, i ) => mix( c, green[ i ], meadow ) );
	const coralRubble = Math.max( 0, Math.min( 1, rubble / 255 ) );
	color = color.map( ( c, i ) => mix( c, [ 74, 69, 58 ][ i ], coralRubble ) );
	return color;
}
