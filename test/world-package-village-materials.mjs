import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadWorldPackage, disposeWorldPackage } from '../src/network/WorldPackage.js';
import { VILLAGE_MATERIAL_PROFILE, VILLAGE_MATERIAL_ROLES } from '../src/network/WorldVillageMaterial.js';

const source = JSON.parse( await readFile( new URL( '../worlds/island/world-source.json', import.meta.url ) ) );
const village = source.objects.find( object => object.id === 'tw-object:island-village' );
const bytes = new Uint8Array( await readFile( new URL( `../worlds/island/assets/${village.assetId.slice( 'sha256:'.length )}`, import.meta.url ) ) );
assert.equal( `sha256:${createHash( 'sha256' ).update( bytes ).digest( 'hex' )}`, village.assetId );
const materials = Object.fromEntries( VILLAGE_MATERIAL_ROLES.map( role => [ role, { name: role, userData: {}, dispose() { this.disposed = true; } } ] ) );
let bakes = 0;
const materialContext = { materials, textures: { bake() { bakes ++; } } };
const makeConnector = requiredFeatures => ( {
	worldId: source.worldId, manifest: { ...source, rules: { ...source.rules, requiredFeatures }, portals: [], assets: [ { id: village.assetId } ] },
	assets: new Map( [ [ village.assetId, bytes ] ] ), getAsset: async id => id === village.assetId ? bytes : null,
} );

await assert.rejects( loadWorldPackage( makeConnector( source.rules.requiredFeatures.filter( feature => feature !== 'tidewater.village-materials/1' ) ), { objectIDs: [ village.id ], assets: new Map( [ [ village.assetId, bytes ] ] ), materialContext } ), /missing tidewater.village-materials\/1/ );
const root = await loadWorldPackage( makeConnector( source.rules.requiredFeatures ), { objectIDs: [ village.id ], assets: new Map( [ [ village.assetId, bytes ] ] ), materialContext } );
const meshes = [];
root.traverse( object => { if ( object.isMesh ) meshes.push( object ); } );
assert.ok( meshes.length >= VILLAGE_MATERIAL_ROLES.length );
const roles = new Set();
for ( const mesh of meshes ) {
	if ( ! mesh.material.userData?.borrowedWorldMaterial ) continue;
	assert.ok( mesh.geometry.getAttribute( 'vdata' )?.itemSize === 4 );
	assert.ok( mesh.geometry.getAttribute( 'color' )?.itemSize === 3 );
	assert.ok( mesh.onBeforeRender );
	mesh.onBeforeRender();
	roles.add( mesh.material.name );
}
assert.deepEqual( roles, new Set( VILLAGE_MATERIAL_ROLES ) );
assert.equal( bakes, meshes.filter( mesh => mesh.material.userData?.borrowedWorldMaterial ).length );
disposeWorldPackage( root );
assert.ok( Object.values( materials ).every( material => ! material.disposed ), 'package cleanup must preserve App-owned procedural materials' );
console.log( 'Hosted island reuses signed trusted village shaders and original vertex parameters without taking ownership' );
