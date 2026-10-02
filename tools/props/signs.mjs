import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export function buildSigns(HERE,OUT) {
const magick=(...args)=>execFileSync(process.env.MAGICK || 'magick',args);
// ---------------------------------------------------------------- signs (2048 x 1024, RGBA)
//   rows: [0, 256) "JOE'S GENERAL SHOP", [256, 512) "MARTA'S CHANDLERY" + "BAIT · TACKLE · FUEL",
//   [512, 1024) left: chalk prices (1024 x 512), right: the scale dial (512 x 512) + spare
const FONT = path.join( HERE, 'fonts' );
const signs = path.join( OUT, 'signs.png' );
magick(
	'-size', '2048x1024', 'xc:none',
	// Joe
	'-font', path.join( FONT, 'PermanentMarker-Regular.ttf' ),
	'-fill', '#f1ead6', '-pointsize', '123', '-gravity', 'NorthWest', '-annotate', '+190+40', 'JOE\'S GENERAL SHOP',
	// a painted fish either side
	'-fill', '#e2a53a', '-draw', 'ellipse 64,130 44,22 0,360', '-draw', 'polygon 100,130 134,106 134,154',
	'-draw', 'ellipse 1968,130 50,24 0,360', '-draw', 'polygon 1928,130 1898,104 1898,156',
	// Marta
	'-fill', '#f4e7c4', '-pointsize', '118', '-annotate', '+110+262', 'MARTA\'S CHANDLERY',
	'-fill', '#e8b04a', '-pointsize', '72', '-annotate', '+300+398', 'BAIT  ·  TACKLE  ·  FUEL',
	// chalk prices
	'-font', path.join( FONT, 'CabinSketch-Bold.ttf' ), '-fill', '#ecebe4',
	'-pointsize', '84', '-annotate', '+60+540', 'TODAY  WE BUY',
	'-pointsize', '54', '-annotate', '+70+650', 'Rods / Tools / Finds',
	'-annotate', '+70+720', 'Watches / Lost Phones',
	'-annotate', '+70+790', 'Trade for CREDITS',
	'-annotate', '+70+860', 'Fish also welcome',
	'-annotate', '+70+930', 'BUY / SELL / TRADE',
	signs,
);
// scale dial: white enamel face, ticks and numbers 0-25 kg, drawn at 512 x 512 and composited
const dial = path.join( OUT, '.dial.png' );
const ticks = [];
for ( let i = 0; i <= 50; i ++ ) {

	const a = ( - 150 + i * 6 ) * Math.PI / 180, r0 = i % 10 === 0 ? 170 : i % 2 === 0 ? 186 : 194, r1 = 210;
	ticks.push( '-draw', `line ${ 256 + Math.sin( a ) * r0 },${ 256 - Math.cos( a ) * r0 } ${ 256 + Math.sin( a ) * r1 },${ 256 - Math.cos( a ) * r1 }` );

}

const nums = [];
for ( let i = 0; i <= 5; i ++ ) {

	// (the text box's top-left corner: centre each number on its spot)
	const a = ( - 150 + i * 60 ) * Math.PI / 180, r = 128, t = String( i * 5 ), w = 24 * t.length;
	nums.push( '-annotate', `+${ Math.round( 256 + Math.sin( a ) * r - w / 2 ) }+${ Math.round( 256 - Math.cos( a ) * r - 30 ) }`, t );

}

magick( '-size', '512x512', 'xc:none', '-fill', '#e9e4d6', '-draw', 'circle 256,256 256,24',
	'-stroke', '#1c1c1c', '-strokewidth', '5', ...ticks, '-stroke', 'none',
	'-fill', '#1c1c1c', '-font', path.join( FONT, 'Oswald.ttf' ), '-pointsize', '52', '-gravity', 'NorthWest', ...nums,
	'-pointsize', '40', '-annotate', '+238+300', 'kg', dial );
magick( signs, dial, '-geometry', '+1536+512', '-composite', signs );
fs.unlinkSync( dial );
console.log( 'signs.png' );

}
