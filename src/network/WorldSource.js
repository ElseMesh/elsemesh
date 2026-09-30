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
	if ( ! Array.isArray( source.objects ) || ! Array.isArray( source.portals ) || source.objects.length > 10000 || source.portals.length > 1024 ) throw new Error( 'Invalid world object or portal list' );
	const ids = new Set();
	for ( const object of source.objects ) {
		if ( typeof object.id !== 'string' || ! /^tw-object:[\w.-]{1,128}$/.test( object.id ) || ids.has( object.id ) || object.kind !== 'asset-instance' || ! object.transform || ! validVector( object.transform.position ) || ! Number.isFinite( object.transform.yaw ) || ! validVector( object.scale ) ) throw new Error( 'Invalid or duplicate object record' );
		if ( object.assetId !== null && object.assetId !== undefined && ! /^sha256:[0-9a-f]{64}$/.test( object.assetId ) ) throw new Error( 'Invalid object assetId' );
		ids.add( object.id );
	}
	for ( const portal of source.portals ) {
		if ( typeof portal.id !== 'string' || ! /^tw-portal:[\w.-]{1,128}$/.test( portal.id ) || ids.has( portal.id ) || ! /^tw-world:[\w.-]{1,128}$/.test( portal.destinationWorldId || '' ) || typeof portal.destinationPeerId !== 'string' || ! portal.destinationPeerId || ! portal.entry || ! validVector( portal.entry.position ) || ! Number.isFinite( portal.entry.yaw ) || ! portal.exit || ! validVector( portal.exit.position ) || ! Number.isFinite( portal.exit.yaw ) ) throw new Error( 'Invalid or duplicate portal record' );
		ids.add( portal.id );
	}
	return source;
}

function validVector( value ) {
	return Array.isArray( value ) && value.length === 3 && value.every( ( n ) => Number.isFinite( n ) && Math.abs( n ) <= 1e6 );
}
