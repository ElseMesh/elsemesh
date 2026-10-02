import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { TerrainData } from '../../src/world/TerrainData.js';
import { WORLD } from '../../src/world/WorldLayout.js';
import { PATHS } from '../../src/world/terrain/IslandShape.js';

const OUT = path.resolve( process.argv[ 2 ] || 'artifacts/world' );
fs.mkdirSync( OUT, { recursive: true } );

function crc32( data ) {
	let c = 0xffffffff;
	for ( const b of data ) {
		c ^= b;
		for ( let k = 0; k < 8; k ++ ) c = ( c >>> 1 ) ^ ( ( c & 1 ) ? 0xedb88320 : 0 );
	}
	return ( c ^ 0xffffffff ) >>> 0;
}

function chunk( type, data ) {
	const t = Buffer.from( type );
	const out = Buffer.alloc( 12 + data.length );
	out.writeUInt32BE( data.length, 0 ); t.copy( out, 4 ); data.copy( out, 8 );
	out.writeUInt32BE( crc32( Buffer.concat( [ t, data ] ) ), 8 + data.length );
	return out;
}function pngGray( file, width, height, depth, sample ) {
	const bpp = depth === 16 ? 2 : 1;
	const raw = Buffer.alloc( height * ( 1 + width * bpp ) );
	let o = 0;
	for ( let y = 0; y < height; y ++ ) {
		raw[ o ++ ] = 0;
		for ( let x = 0; x < width; x ++ ) {
			const v = sample( x, y );
			if ( depth === 16 ) { raw.writeUInt16BE( v, o ); o += 2; }
			else raw[ o ++ ] = v;
		}
	}
	const ihdr = Buffer.alloc( 13 );
	ihdr.writeUInt32BE( width, 0 ); ihdr.writeUInt32BE( height, 4 );
	ihdr[ 8 ] = depth; ihdr[ 9 ] = 0;
	const sig = Buffer.from( [ 137,80,78,71,13,10,26,10 ] );
	fs.writeFileSync( file, Buffer.concat( [
		sig, chunk( 'IHDR', ihdr ), chunk( 'IDAT', zlib.deflateSync( raw, { level: 9 } ) ),
		chunk( 'IEND', Buffer.alloc( 0 ) ),
	] ) );
}

const t = new TerrainData();
let min = Infinity, max = - Infinity;
for ( const h of t.heights ) { if ( h < min ) min = h; if ( h > max ) max = h; }
const range = max - min || 1;
const clamp8 = ( v ) => Math.max( 0, Math.min( 255, Math.round( v ) ) );pngGray( path.join( OUT, 'heightmap.png' ), t.res, t.res, 16, ( x, y ) => {
	const h = t.heights[ y * t.res + x ];
	return Math.max( 0, Math.min( 65535, Math.round( ( h - min ) / range * 65535 ) ) );
} );
fs.writeFileSync( path.join( OUT, 'heightmap.f32' ), Buffer.from( t.heights.buffer ) );

for ( const [ name, data, scale ] of [
	[ 'rock', t.rock, 255 ],
	[ 'sand', t.sand, 1 ],
	[ 'path', t.path, 1 ],
	[ 'gully', t.gully, 1 ],
	[ 'seagrass', t.seagrass, 1 ],
	[ 'rubble', t.rubble, 1 ],
	[ 'scarp', t.scarp, 1 ],
] ) pngGray( path.join( OUT, `${ name }.png` ), t.res, t.res, 8,
	( x, y ) => clamp8( data[ y * t.res + x ] * scale ) );

const meta = {
	format: 'ElseMesh terrain exchange v1',
	units: 'metres',
	resolution: t.res, size: t.size, texel: t.texel, origin: t.origin,
	minHeight: min, maxHeight: max, seaLevel: 0,
	gameAxes: { x: 'east', y: 'up', z: 'south' },
	blenderAxes: { x: 'east', y: 'north (-game z)', z: 'up (game y)' },
	heightEncoding: { png16: { min, max }, rawFloat32: 'little-endian exact game heights' },
};
fs.writeFileSync( path.join( OUT, 'terrain.json' ), JSON.stringify( meta, null, 2 ) );const features = PATHS.map( ( p, i ) => ( {
	type: 'Feature',
	properties: { kind: 'footpath', id: i, halfWidthMetres: p.w },
	geometry: { type: 'LineString', coordinates: p.pts.map( q => [ q[ 0 ], - q[ 1 ] ] ) },
} ) );
features.push( {
	type: 'Feature',
	properties: { kind: 'spawn', id: 'player-start' },
	geometry: { type: 'Point', coordinates: [ WORLD.start.position.x, - WORLD.start.position.z ] },
} );
fs.writeFileSync( path.join( OUT, 'world-features.geojson' ),
	JSON.stringify( { type: 'FeatureCollection', features }, null, 2 ) );

console.log( `Exported ElseMesh terrain to ${ OUT }` );
console.log( `height ${ min.toFixed( 2 ) } m .. ${ max.toFixed( 2 ) } m, ${ t.res }x${ t.res } @ ${ t.texel } m/texel` );
console.log( 'Files: heightmap.png, heightmap.f32, masks, terrain.json, world-features.geojson' );
