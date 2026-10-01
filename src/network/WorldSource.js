export const WORLD_SOURCE_PROTOCOL = 'tidewater.world-source/1';

export function createWorldSource( { worldId = `tw-world:local-${ crypto.randomUUID() }`, title = 'Untitled world' } = {} ) {
	return {
		protocol: WORLD_SOURCE_PROTOCOL,
		worldId,
		title,
		coordinateSystem: 'right-handed-y-up-meters',
		styleGuide: '',
		rules: { gravity: 1, avatarComplexity: 20000, physicsProfile: 'tidewater-default' },
		objects: [],
		portals: [],
		updatedAt: new Date().toISOString(),
	};
}

export function validateWorldSource( source ) {
	if ( ! source || source.protocol !== WORLD_SOURCE_PROTOCOL ) throw new Error( 'Unsupported world source format' );
	if ( ! /^tw-world:[\w.-]{1,128}$/.test( source.worldId || '' ) ) throw new Error( 'Invalid worldId' );
	if ( typeof source.title !== 'string' || ! source.title.trim() || source.title.length > 160 ) throw new Error( 'Invalid world title' );
	if ( source.coordinateSystem !== 'right-handed-y-up-meters' ) throw new Error( 'Unsupported world coordinate system' );
	if ( typeof source.styleGuide !== 'string' || source.styleGuide.length > 10000 || ! source.rules || ! Number.isFinite( source.rules.gravity ) || source.rules.gravity < 0.2 || source.rules.gravity > 2 || ! Number.isInteger( source.rules.avatarComplexity ) || source.rules.avatarComplexity < 1 || source.rules.avatarComplexity > 100000 || typeof source.rules.physicsProfile !== 'string' || source.rules.physicsProfile.length > 64 ) throw new Error( 'Invalid world rules or style guide' );
	if ( ! Array.isArray( source.objects ) || ! Array.isArray( source.portals ) || source.objects.length > 10000 || source.portals.length > 1024 ) throw new Error( 'Invalid world object or portal list' );
	const ids = new Set();
	for ( const object of source.objects ) {
		if ( typeof object.id !== 'string' || ! /^tw-object:[\w.-]{1,128}$/.test( object.id ) || ids.has( object.id ) || object.kind !== 'asset-instance' || typeof object.label !== 'string' || object.label.length > 160 || ! object.transform || ! validVector( object.transform.position ) || ! Number.isFinite( object.transform.yaw ) || ! validVector( object.scale ) || object.scale.some( ( n ) => n <= 0 || n > 1000 ) || ! object.collision || ! [ 'box', 'none' ].includes( object.collision.shape ) || typeof object.collision.enabled !== 'boolean' ) throw new Error( 'Invalid or duplicate object record' );
		if ( object.assetId !== null && object.assetId !== undefined && ! /^sha256:[0-9a-f]{64}$/.test( object.assetId ) ) throw new Error( 'Invalid object assetId' );
		if ( object.priority !== undefined && ! [ 'portal-preview', 'visible', 'nearby', 'background' ].includes( object.priority ) ) throw new Error( 'Invalid object streaming priority' );
		ids.add( object.id );
	}
	for ( const portal of source.portals ) {
		if ( typeof portal.id !== 'string' || ! /^tw-portal:[\w.-]{1,128}$/.test( portal.id ) || ids.has( portal.id ) || ! /^tw-world:[\w.-]{1,128}$/.test( portal.destinationWorldId || '' ) || typeof portal.destinationPeerId !== 'string' || portal.destinationPeerId.length < 20 || portal.destinationPeerId.length > 128 || ( portal.destinationGateway !== undefined && ! validGateway( portal.destinationGateway ) ) || ! portal.entry || ! validVector( portal.entry.position ) || ! Number.isFinite( portal.entry.yaw ) || ! portal.exit || ! validVector( portal.exit.position ) || ! Number.isFinite( portal.exit.yaw ) || typeof portal.openView !== 'boolean' || typeof portal.enabled !== 'boolean' ) throw new Error( 'Invalid or duplicate portal record' );
		ids.add( portal.id );
	}
	return source;
}

function validVector( value ) {
	return Array.isArray( value ) && value.length === 3 && value.every( ( n ) => Number.isFinite( n ) && Math.abs( n ) <= 1e6 );
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
