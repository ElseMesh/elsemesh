// Build the static, GLB-backed portion of a verified world manifest as a replaceable scene root.
// Dynamic world extensions (terrain simulation, water, wildlife, gameplay) are deliberately not
// inferred from a mesh export; they need explicit, versioned runtime components.

import { Group } from '../engine/scene/Group.js';
import { Mesh } from '../engine/scene/Mesh.js';
import { BufferAttribute } from '../engine/geometry/BufferAttribute.js';
import { BufferGeometry } from '../engine/geometry/BufferGeometry.js';
import { parseGLB, decodeImage } from '../engine/loaders/GLTF.js';
import { Texture, generateMipmaps } from '../engine/webgpu.js';
import { Color } from '../engine/math/Color.js';
import { SRGBColorSpace } from '../engine/constants.js';
import { standard } from '../materials/Materials.js';
import { Vector3 } from '../engine/math/Vector3.js';
import { Matrix4 } from '../engine/math/Matrix4.js';

const COMPONENTS = Object.freeze( {
	POSITION: [ 'position', 3 ],
	NORMAL: [ 'normal', 3 ],
	TEXCOORD_0: [ 'uv', 2 ],
	COLOR_0: [ 'color', 3 ],
} );

export async function loadWorldPackage( connector, { signal, assets: preloadedAssets, objectIDs } = {} ) {

	if ( ! connector.manifest ) throw new Error( 'Load and verify a world manifest first' );
	const assets = preloadedAssets || await connector.preload();
	const root = new Group();
	root.name = `world:${connector.worldId}`;
	root.userData.worldPackage = { parsed: new Map(), loadedObjects: new Set(), connector };
	try {
		await appendWorldPackageAssets( connector, root, assets, { signal, objectIDs } );
		return root;
	} catch ( error ) {
		disposeWorldPackage( root );
		throw error;
	}

}

export async function appendWorldPackageAssets( connector, root, assets, { signal, objectIDs } = {} ) {

	const state = root.userData.worldPackage || ( root.userData.worldPackage = { parsed: new Map(), loadedObjects: new Set() } );
	const objectRecords = connector.manifest.objects || [];
	const selectedObjects = objectIDs ? new Set( objectIDs ) : null;

	for ( const object of objectRecords ) {

		if ( signal?.aborted ) throw signal.reason || new DOMException( 'Aborted', 'AbortError' );
		if ( state.loadedObjects.has( object.id ) ) continue;
		if ( selectedObjects && ! selectedObjects.has( object.id ) ) continue;
		if ( object.kind !== 'asset-instance' ) throw new Error( `Unsupported world object kind: ${object.kind}` );
		const bytes = assets.get( object.assetId );
		if ( ! bytes ) continue;
		let gltf = state.parsed.get( object.assetId );
		if ( ! gltf ) {
			gltf = await buildGLTF( parseGLB( bytes ) );
			state.parsed.set( object.assetId, gltf );
		}
		const instance = cloneScene( gltf );
		instance.name = object.label || object.id;
		instance.userData.worldObjectId = object.id;
		const t = object.transform || {};
		instance.position.set( ...( t.position || [ 0, 0, 0 ] ) );
		if ( t.rotation ) instance.quaternion.set( ...t.rotation );
		else instance.rotation.y = t.yaw || 0;
		instance.scale.set( ...( object.scale || [ 1, 1, 1 ] ) );
		root.add( instance );
		state.loadedObjects.add( object.id );
		if ( object.replacesObjectId ) {
			const replaced = root.children.find( ( child ) => child.userData.worldObjectId === object.replacesObjectId );
			if ( replaced ) replaced.visible = false;
		}
		if ( object.priority === 'portal-preview' && objectRecords.some( ( replacement ) => replacement.replacesObjectId === object.id && state.loadedObjects.has( replacement.id ) ) ) instance.visible = false;

	}
	return root;

}

export function cloneWorldPackageAssets( root, connector, assetIDs ) {
	const preview = new Group();
	preview.name = `${root.name}:portal-preview`;
	if ( ! assetIDs?.size ) return preview;
	const objectAssets = new Map( connector.manifest.objects.map( ( object ) => [ object.id, object.assetId ] ) );
	for ( const child of root.children ) {
		const objectId = child.userData.worldObjectId;
		if ( assetIDs.has( objectAssets.get( objectId ) ) ) preview.add( child.clone( true ) );
	}
	return preview;
}

export function registerWorldPackageCollisions( root, colliders ) {
	if ( ! colliders ) return;
	const state = root.userData.worldPackage;
	if ( ! state ) return;
	state.activeColliders ||= new Map();
	for ( const object of state.connector?.manifest?.objects || [] ) {
		const collision = object.collision;
		if ( ! state.loadedObjects.has( object.id ) || ! collision?.enabled || state.activeColliders.has( object.id ) ) continue;
		const instance = root.children.find( ( child ) => child.userData.worldObjectId === object.id );
		if ( ! instance ) continue;
		if ( collision.shape === 'heightfield' ) {
			const meshes = [];
			instance.traverse( ( child ) => { if ( child.isMesh ) meshes.push( child ); } );
			if ( meshes.length !== 1 ) throw new Error( `World object ${object.id} heightfield must have exactly one mesh` );
			const attribute = meshes[ 0 ].geometry.getAttribute( 'position' );
			if ( ! attribute || attribute.count !== collision.columns * collision.rows ) throw new Error( `World object ${object.id} heightfield vertex count does not match its dimensions` );
			root.updateMatrixWorld( true );
			const relative = new Matrix4().copy( instance.matrixWorld ).invert().multiply( meshes[ 0 ].matrixWorld );
			const positions = new Float32Array( attribute.count * 3 );
			const point = new Vector3();
			for ( let index = 0; index < attribute.count; index ++ ) {
				point.fromBufferAttribute( attribute, index ).applyMatrix4( relative );
				positions[ index * 3 ] = point.x;
				positions[ index * 3 + 1 ] = point.y;
				positions[ index * 3 + 2 ] = point.z;
			}
			const field = colliders.addHeightfield( positions, collision.columns, collision.rows, {
				position: new Vector3( ...object.transform.position ), scale: new Vector3( ...( object.scale || [ 1, 1, 1 ] ) ),
				yaw: object.transform.yaw || 0, tag: `world:${object.id}`,
			} );
			state.activeColliders.set( object.id, { shape: 'heightfield', collider: field } );
			continue;
		}
		if ( collision.shape === 'compound' ) {
			if ( ! Array.isArray( collision.boxes ) || collision.boxes.length === 0 || collision.boxes.length > 2048 || ! collision.boxes.every( ( item ) => item && Array.isArray( item.center ) && item.center.length === 3 && item.center.every( ( value ) => Number.isFinite( value ) && Math.abs( value ) <= 1e6 ) && Array.isArray( item.halfExtents ) && item.halfExtents.length === 3 && item.halfExtents.every( ( value ) => Number.isFinite( value ) && value > 0 && value <= 1000 ) && Number.isFinite( item.yaw ) && Math.abs( item.yaw ) <= 360 && typeof item.walkable === 'boolean' && typeof item.solid === 'boolean' ) ) throw new Error( `World object ${object.id} has invalid compound collision boxes` );
			const scale = object.scale || [ 1, 1, 1 ];
			const yaw = object.transform?.yaw || 0;
			const cos = Math.cos( yaw ), sin = Math.sin( yaw );
			const boxes = [];
			for ( const item of collision.boxes ) {
				const localX = item.center[ 0 ] * scale[ 0 ], localY = item.center[ 1 ] * scale[ 1 ], localZ = item.center[ 2 ] * scale[ 2 ];
				const center = new Vector3(
					object.transform.position[ 0 ] + localX * cos + localZ * sin,
					object.transform.position[ 1 ] + localY,
					object.transform.position[ 2 ] - localX * sin + localZ * cos,
				);
				const half = new Vector3( item.halfExtents[ 0 ] * scale[ 0 ], item.halfExtents[ 1 ] * scale[ 1 ], item.halfExtents[ 2 ] * scale[ 2 ] );
				boxes.push( colliders.addBox( center, half, yaw + item.yaw, { walkable: item.walkable, solid: item.solid, tag: `world:${object.id}` } ) );
			}
			state.activeColliders.set( object.id, { shape: 'compound', collider: boxes } );
			continue;
		}
		if ( collision.shape !== 'box' || ! Array.isArray( collision.center ) || collision.center.length !== 3 || ! collision.center.every( Number.isFinite ) || ! Array.isArray( collision.halfExtents ) || collision.halfExtents.length !== 3 || ! collision.halfExtents.every( ( value ) => Number.isFinite( value ) && value > 0 ) ) throw new Error( `World object ${object.id} has invalid collision bounds` );
		const scale = object.scale || [ 1, 1, 1 ];
		const yaw = object.transform?.yaw || 0;
		const cos = Math.cos( yaw ), sin = Math.sin( yaw );
		const localX = collision.center[ 0 ] * scale[ 0 ], localY = collision.center[ 1 ] * scale[ 1 ], localZ = collision.center[ 2 ] * scale[ 2 ];
		const center = new Vector3(
			object.transform.position[ 0 ] + localX * cos + localZ * sin,
			object.transform.position[ 1 ] + localY,
			object.transform.position[ 2 ] - localX * sin + localZ * cos,
		);
		const half = new Vector3( collision.halfExtents[ 0 ] * scale[ 0 ], collision.halfExtents[ 1 ] * scale[ 1 ], collision.halfExtents[ 2 ] * scale[ 2 ] );
		const box = colliders.addBox( center, half, yaw, { walkable: collision.walkable, solid: collision.solid, tag: `world:${object.id}` } );
		state.activeColliders.set( object.id, { shape: 'box', collider: box } );
	}
}

export function unregisterWorldPackageCollisions( root, colliders ) {
	const active = root?.userData?.worldPackage?.activeColliders;
	if ( ! active || ! colliders ) return;
	for ( const { shape, collider } of active.values() ) {
		if ( shape === 'heightfield' ) colliders.removeHeightfield( collider );
		else if ( shape === 'compound' ) for ( const box of collider || [] ) colliders.removeBox( box );
		else colliders.removeBox( collider );
	}
	active.clear();
}

export function disposeWorldPackage( root ) {
	const state = root?.userData?.worldPackage;
	if ( ! root || state?.disposed ) return;
	if ( state ) state.disposed = true;
	const geometries = new Set(), materials = new Set(), textures = new Set();
	const roots = [ root, ...( state?.parsed?.values?.() || [] ) ];
	for ( const packageRoot of roots ) packageRoot.traverse( ( object ) => {
		if ( object.geometry?.dispose ) geometries.add( object.geometry );
		for ( const material of Array.isArray( object.material ) ? object.material : [ object.material ] ) {
			if ( ! material ) continue;
			materials.add( material );
			for ( const binding of Object.values( material.bindings || {} ) ) {
				const texture = binding?.texture || binding;
				if ( texture?.isTexture && texture.destroy ) textures.add( texture );
			}
		}
	} );
	for ( const geometry of geometries ) geometry.dispose();
	for ( const material of materials ) material.dispose?.();
	for ( const texture of textures ) texture.destroy();
	state?.parsed?.clear();
	state?.loadedObjects?.clear();
}

async function buildGLTF( gltf ) {

	const root = new Group();
	const textures = new Map();
	const resolvedMaterials = [];
	for ( let index = 0; index < gltf.materials.length; index ++ ) {

		const source = gltf.materials[ index ];

		const pbr = source.pbrMetallicRoughness || {};
		const textureInfo = pbr.baseColorTexture;
		let albedo = null;
		if ( textureInfo ) {

			const textureSource = gltf.textures[ textureInfo.index ]?.source;
			const image = gltf.images[ textureSource ];
			if ( ! image?.bytes ) throw new Error( `GLB material ${source.name || index} requires an embedded image` );
			if ( ! textures.has( textureSource ) ) {
				const pixels = await decodeImage( image.bytes, image.mimeType );
				const texture = new Texture( { label: `world-albedo-${textureSource}`, width: pixels.width, height: pixels.height, format: 'rgba8unorm-srgb', data: pixels.data, mips: true, usage: [ 'sample', 'copyDst' ], sampler: 'anisoRepeat' } );
				texture.getGPU();
				generateMipmaps( texture );
				textures.set( textureSource, texture );
			}
			albedo = textures.get( textureSource );

		}
		const base = pbr.baseColorFactor || [ 1, 1, 1, 1 ];
		const alphaMode = source.alphaMode || 'OPAQUE';
		const vertexColors = gltf.meshes.some( ( primitives ) => primitives.some( ( primitive ) => primitive.material === index && primitive.attributes.COLOR_0 !== undefined ) );
		resolvedMaterials.push( standard( {
			name: source.name || `world-material-${index}`,
			color: new Color().setRGB( base[ 0 ], base[ 1 ], base[ 2 ], SRGBColorSpace ), opacity: base[ 3 ], roughness: pbr.roughnessFactor ?? 1,
			metalness: pbr.metallicFactor ?? 1, side: source.doubleSided ? 'double' : 'front',
			transparent: alphaMode === 'BLEND', alphaTest: alphaMode === 'MASK' ? ( source.alphaCutoff ?? 0.5 ) : 0, vertexColors,
			textures: albedo ? { worldAlbedo: albedo } : {},
			defines: { WORLD_HAS_ALBEDO: albedo ? 1 : 0 },
			surface: `#if WORLD_HAS_ALBEDO\n\tlet baseColor = textureSample( worldAlbedo, smpAnisoRepeat, in.uv );\n\ts.albedo *= baseColor.rgb;\n\ts.alpha *= baseColor.a;\n#endif\n`,
		} ) );

	}
	const builtMeshes = gltf.meshes.map( ( primitives ) => primitives.map( ( primitive ) => {

		if ( primitive.mode !== 4 ) throw new Error( `GLB primitive mode ${primitive.mode} is not supported (triangle list required)` );
		const geometry = new BufferGeometry();
		for ( const [ gltfName, [ name, size ] ] of Object.entries( COMPONENTS ) ) {
			const attribute = primitive.attributes[ gltfName ];
			if ( ! attribute ) continue;
			const values = floatAttribute( attribute );
			geometry.setAttribute( name, new BufferAttribute( values, gltfName === 'COLOR_0' ? attribute.itemSize : size ) );
		}
		if ( primitive.indices ) geometry.setIndex( new BufferAttribute( asIndexArray( primitive.indices ), 1 ) );
		if ( ! geometry.getAttribute( 'position' ) ) throw new Error( 'GLB primitive has no POSITION attribute' );
		if ( ! geometry.getAttribute( 'normal' ) ) geometry.computeVertexNormals();
		geometry.computeBoundingSphere();
		const material = resolvedMaterials[ primitive.material ] || standard( { name: 'world-default', color: 0xffffff, roughness: 1, metalness: 0 } );
		return new Mesh( geometry, material );

	} ) );
	const nodes = gltf.nodes.map( ( node ) => {

		const object = new Group();
		object.name = node.name;
		object.position.set( ...node.t );
		object.quaternion.set( ...node.r );
		object.scale.set( ...node.s );
		if ( node.mesh !== undefined ) for ( const mesh of builtMeshes[ node.mesh ] || [] ) object.add( mesh );
		return object;

	} );
	for ( let i = 0; i < gltf.nodes.length; i ++ ) for ( const child of gltf.nodes[ i ].children ) nodes[ i ].add( nodes[ child ] );
	for ( const index of gltf.roots ) root.add( nodes[ index ] );
	return root;

}

function cloneScene( source ) {

	const copy = new Group();
	copy.name = source.name;
	for ( const child of source.children ) copy.add( child.clone( true ) );
	return copy;

}

function floatAttribute( attribute ) {

	const { array, componentType, normalized, itemSize } = attribute;
	if ( array instanceof Float32Array ) return array;
	const scale = normalized ? ( componentType === 5121 ? 1 / 255 : componentType === 5123 ? 1 / 65535 : componentType === 5120 ? 1 / 127 : componentType === 5122 ? 1 / 32767 : 1 ) : 1;
	const out = new Float32Array( array.length );
	for ( let i = 0; i < array.length; i ++ ) out[ i ] = normalized && componentType <= 5122 ? Math.max( -1, array[ i ] * scale ) : array[ i ] * scale;
	return out;

}

function asIndexArray( array ) {
	if ( array instanceof Uint16Array || array instanceof Uint32Array ) return array;
	let max = 0;
	for ( const value of array ) if ( value > max ) max = value;
	return max < 65536 ? Uint16Array.from( array ) : Uint32Array.from( array );
}
