import assert from 'node:assert/strict';
import { ShaderModule } from '../src/engine/gpu/Shader.js';
import { WaterMaterial } from '../src/ocean/WaterMaterial.js';
import { WaterSurface } from '../src/ocean/WaterSurface.js';

function makeSurface( seaLevel = null ) {
	const fft = { cascades: 1, sizes: [ 64 ], module: new ShaderModule( { name: 'testOcean' } ) };
	const cdlod = { module: new ShaderModule( { name: 'testCdlod' } ) };
	return new WaterSurface( { fft, cdlod, foamTexture: null, seaLevel } );
}

function makeMaterial( surface ) {
	const material = new WaterMaterial( { surface, sky: null, sceneCopy: { texture: {}, depthTexture: {} } } );
	material._build();
	return material;
}

const hostedSurface = makeSurface( 12.5 );
assert.match( hostedSurface.module.code, /var y = waterSurface\.seaLevel \+ total\.y;/, 'hosted water vertex uses the authored world sea level' );
assert.doesNotMatch( hostedSurface.module.code, /frame\.seaLevel/, 'hosted water shader does not inherit the source portal world level' );
const hostedMaterial = makeMaterial( hostedSurface );
assert.match( hostedMaterial.output, /_waterSSR\( posV, Rv, pos\.y, Rraw\.y, waterSurface\.seaLevel \)/, 'hosted water reflections use their own sea level' );
assert.match( hostedMaterial.modules.find( ( module ) => module.name === 'waterHelpers' ).code, /fn _waterSSR\( posV: vec3f, Rv: vec3f, y0: f32, ry: f32, seaLevel: f32 \)/, 'reflection helper accepts a surface-specific level' );

const legacySurface = makeSurface();
assert.match( legacySurface.module.code, /var y = frame\.seaLevel \+ total\.y;/, 'legacy island water continues using its unchanged frame sea level' );
const legacyMaterial = makeMaterial( legacySurface );
assert.match( legacyMaterial.output, /_waterSSR\( posV, Rv, pos\.y, Rraw\.y, frame\.seaLevel \)/, 'legacy island reflections continue using the frame level' );

console.log( 'ok   hosted water uses its destination sea level; legacy island water keeps frame sea level' );
