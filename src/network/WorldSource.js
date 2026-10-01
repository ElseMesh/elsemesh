import { MAX_WORLD_PACKAGE_BYTES, movementParameters, SUPPORTED_PHYSICS_PROFILES } from './WorldRules.js';

export const WORLD_SOURCE_PROTOCOL = 'tidewater.world-source/1';

export function createWorldSource( { worldId = `tw-world:local-${ crypto.randomUUID() }`, title = 'Untitled world' } = {} ) {
	return {
		protocol: WORLD_SOURCE_PROTOCOL,
		worldId,
		title,
		coordinateSystem: 'right-handed-y-up-meters',
		styleGuide: '',
		rules: { gravity: 1, avatarComplexity: 20000, physicsProfile: 'tidewater-default', movement: { walkSpeed: 3, sprintSpeed: 6.2, jumpSpeed: 4.6 } },
		hosts: [],
		objects: [],
		components: [],
		portals: [],
		updatedAt: new Date().toISOString(),
	};
}

export function validateWorldSource( source ) {
	if ( ! source || source.protocol !== WORLD_SOURCE_PROTOCOL ) throw new Error( 'Unsupported world source format' );
	if ( ! /^tw-world:[\w.-]{1,128}$/.test( source.worldId || '' ) ) throw new Error( 'Invalid worldId' );
	if ( typeof source.title !== 'string' || ! source.title.trim() || source.title.length > 160 ) throw new Error( 'Invalid world title' );
	if ( source.coordinateSystem !== 'right-handed-y-up-meters' ) throw new Error( 'Unsupported world coordinate system' );
	if ( typeof source.styleGuide !== 'string' || source.styleGuide.length > 10000 || ! source.rules || ! Number.isFinite( source.rules.gravity ) || source.rules.gravity < 0.2 || source.rules.gravity > 2 || ! Number.isInteger( source.rules.avatarComplexity ) || source.rules.avatarComplexity < 1 || source.rules.avatarComplexity > 100000 || ! SUPPORTED_PHYSICS_PROFILES.has( source.rules.physicsProfile ) ) throw new Error( 'Invalid or unsupported world rules or style guide' );
	try { movementParameters( source.rules ); } catch { throw new Error( 'Invalid or unsupported world movement rules' ); }
	if ( source.rules.maxPackageBytes !== undefined && ( ! Number.isSafeInteger( source.rules.maxPackageBytes ) || source.rules.maxPackageBytes < 1 || source.rules.maxPackageBytes > MAX_WORLD_PACKAGE_BYTES ) ) throw new Error( 'Invalid world package byte budget' );
	if ( source.rules.requiredFeatures !== undefined && ( ! Array.isArray( source.rules.requiredFeatures ) || source.rules.requiredFeatures.length > 64 || new Set( source.rules.requiredFeatures ).size !== source.rules.requiredFeatures.length || source.rules.requiredFeatures.some( ( feature ) => typeof feature !== 'string' || feature.length > 96 || ! /^tidewater\.[a-z0-9.-]+\/\d+$/.test( feature ) ) ) ) throw new Error( 'Invalid required world features' );
	if ( ! Array.isArray( source.objects ) || ! Array.isArray( source.portals ) || source.objects.length > 10000 || source.portals.length > 1024 || source.hosts !== undefined && ( ! Array.isArray( source.hosts ) || source.hosts.length > 256 ) || source.components !== undefined && ( ! Array.isArray( source.components ) || source.components.length > 128 ) ) throw new Error( 'Invalid world object, portal, component, or host grant list' );
	const hosts = new Set();
	for ( const grant of source.hosts || [] ) {
		if ( ! grant || typeof grant !== 'object' || Array.isArray( grant ) || typeof grant.peerId !== 'string' || grant.peerId.length < 20 || grant.peerId.length > 256 || ! /^[A-Za-z0-9]+$/.test( grant.peerId ) || hosts.has( grant.peerId ) || ! Number.isSafeInteger( grant.epoch ) || grant.epoch < 1 || ! Number.isSafeInteger( grant.expiresAt ) || grant.expiresAt < 1 || ! Array.isArray( grant.scopes ) || grant.scopes.length < 1 || grant.scopes.length > 2 || new Set( grant.scopes ).size !== grant.scopes.length || grant.scopes.some( ( scope ) => ! [ 'content-cache', 'failover-authority' ].includes( scope ) ) ) throw new Error( 'Invalid or duplicate owner host grant' );
		const failover = grant.scopes.includes( 'failover-authority' );
		if ( failover && ( ! Number.isSafeInteger( grant.failoverAfter ) || grant.failoverAfter < 1 || ! Number.isSafeInteger( grant.failoverSeconds ) || grant.failoverSeconds < 1 || grant.failoverSeconds > 3600 || grant.failoverAfter > grant.expiresAt - grant.failoverSeconds ) || ! failover && ( grant.failoverAfter !== undefined || grant.failoverSeconds !== undefined ) ) throw new Error( 'Invalid host grant failover window' );
		hosts.add( grant.peerId );
	}
	const ids = new Set();
	for ( const object of source.objects ) {
		if ( typeof object.id !== 'string' || ! /^tw-object:[\w.-]{1,128}$/.test( object.id ) || ids.has( object.id ) || object.kind !== 'asset-instance' || typeof object.label !== 'string' || object.label.length > 160 || ! object.transform || ! validVector( object.transform.position ) || ! Number.isFinite( object.transform.yaw ) || object.transform.rotation !== undefined && ( ! validQuaternion( object.transform.rotation ) || object.collision?.enabled === true ) || object.streamingBounds !== undefined && ( ! object.streamingBounds || ! validVector( object.streamingBounds.center ) || object.streamingBounds.center.some( ( n ) => Math.abs( n ) > 10000 ) || ! Number.isFinite( object.streamingBounds.radius ) || object.streamingBounds.radius <= 0 || object.streamingBounds.radius > 10000 ) || object.priority !== undefined && ! [ 'portal-preview', 'visible', 'nearby', 'background' ].includes( object.priority ) || ! validVector( object.scale ) || object.scale.some( ( n ) => n <= 0 || n > 1000 ) || ! object.collision || ! [ 'box', 'compound', 'heightfield', 'none' ].includes( object.collision.shape ) || typeof object.collision.enabled !== 'boolean' ) throw new Error( 'Invalid or duplicate object record' );
		if ( object.collision.enabled ) {
			const collision = object.collision;
			const common = typeof collision.walkable === 'boolean' && typeof collision.solid === 'boolean';
			const box = collision.shape === 'box' && validVector( collision.center ) && validVector( collision.halfExtents ) && collision.halfExtents.every( ( n ) => n > 0 && n <= 1000 );
			const heightfield = collision.shape === 'heightfield' && Number.isInteger( collision.columns ) && Number.isInteger( collision.rows ) && collision.columns >= 2 && collision.rows >= 2 && collision.columns <= 4097 && collision.rows <= 4097 && collision.columns * collision.rows <= 4194304 && collision.walkable === true && collision.solid === true;
			const compound = collision.shape === 'compound' && Array.isArray( collision.boxes ) && collision.boxes.length > 0 && collision.boxes.length <= 2048 && collision.boxes.every( ( item ) => item && validVector( item.center ) && item.center.every( ( n ) => Math.abs( n ) <= 1e6 ) && validVector( item.halfExtents ) && item.halfExtents.every( ( n ) => n > 0 && n <= 1000 ) && Number.isFinite( item.yaw ) && Math.abs( item.yaw ) <= 360 && typeof item.walkable === 'boolean' && typeof item.solid === 'boolean' );
			if ( ! box && ! heightfield && ! compound || ( box || heightfield ) && ! common ) throw new Error( 'Enabled object collision requires bounded box, compound, or heightfield data' );
		}
		if ( object.assetId !== null && object.assetId !== undefined && ! /^sha256:[0-9a-f]{64}$/.test( object.assetId ) ) throw new Error( 'Invalid object assetId' );
		if ( object.priority !== undefined && ! [ 'portal-preview', 'visible', 'nearby', 'background' ].includes( object.priority ) ) throw new Error( 'Invalid object streaming priority' );
		ids.add( object.id );
	}
	for ( const portal of source.portals ) {
		if ( typeof portal.id !== 'string' || ! /^tw-portal:[\w.-]{1,128}$/.test( portal.id ) || ids.has( portal.id ) || ! /^tw-world:[\w.-]{1,128}$/.test( portal.destinationWorldId || '' ) || typeof portal.destinationPeerId !== 'string' || portal.destinationPeerId.length < 20 || portal.destinationPeerId.length > 128 || ( portal.destinationGateway !== undefined && ! validGateway( portal.destinationGateway ) ) || ! portal.entry || ! validVector( portal.entry.position ) || ! Number.isFinite( portal.entry.yaw ) || portal.entry.rotation !== undefined || ! portal.exit || ! validVector( portal.exit.position ) || ! Number.isFinite( portal.exit.yaw ) || portal.exit.rotation !== undefined || typeof portal.openView !== 'boolean' || typeof portal.enabled !== 'boolean' ) throw new Error( 'Invalid or duplicate portal record' );
		ids.add( portal.id );
	}
	let islandOceanCount = 0;
	for ( const component of source.components || [] ) {
		const vegetation = component?.type === 'tidewater.procedural-island-vegetation/1' && component.seed === 7 && ( component.placementAssetId === undefined || /^sha256:[0-9a-f]{64}$/.test( component.placementAssetId ) );
		const islandOcean = component?.type === 'tidewater.island-ocean/1';
		const allowedKeys = vegetation ? [ 'id', 'type', 'seed', 'priority', 'placementAssetId' ] : islandOcean ? [ 'id', 'type', 'priority' ] : [];
		if ( ! component || typeof component.id !== 'string' || ! /^tw-component:[\w.-]{1,128}$/.test( component.id ) || ids.has( component.id ) || ( ! vegetation && ! islandOcean ) || component.priority !== undefined && ! [ 'portal-preview', 'visible', 'nearby', 'background' ].includes( component.priority ) || Object.keys( component ).some( ( key ) => ! allowedKeys.includes( key ) ) ) throw new Error( 'Invalid or duplicate world component' );
		if ( islandOcean && ++ islandOceanCount > 1 ) throw new Error( 'A world may declare only one island ocean component' );
		if ( ! source.rules.requiredFeatures?.includes( component.type ) ) throw new Error( `World component ${component.type} must be listed in requiredFeatures` );
		ids.add( component.id );
	}
	return source;
}

function validVector( value ) {
	return Array.isArray( value ) && value.length === 3 && value.every( ( n ) => Number.isFinite( n ) && Math.abs( n ) <= 1e6 );
}

function validQuaternion( value ) {
	return Array.isArray( value ) && value.length === 4 && value.every( Number.isFinite ) && Math.abs( Math.hypot( ...value ) - 1 ) <= 1e-4;
}

function validGateway( value ) {
	if ( typeof value !== 'string' ) return false;
	try {
		const gateway = new URL( value );
		return [ 'https:', 'wss:' ].includes( gateway.protocol ) && ! gateway.username && ! gateway.password && ( gateway.pathname === '' || gateway.pathname === '/' ) && ! gateway.search && ! gateway.hash;
	} catch {
		return false;
	}
}
