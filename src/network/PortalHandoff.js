// Portal entries face local -Z. Only a front-to-back crossing inside the opening transfers worlds.
export function crossedPortalPlane( previous, current, portal, { halfWidth = 1.25, halfHeight = 2.5 } = {} ) {
	const entry = portal?.entry;
	if ( ! entry?.position || ! Number.isFinite( entry.yaw ) ) return false;
	const [ x, y, z ] = entry.position;
	const beforeZ = localZ( previous.x, previous.z, x, z, entry.yaw );
	const afterZ = localZ( current.x, current.z, x, z, entry.yaw );
	const afterX = localX( current.x, current.z, x, z, entry.yaw );
	return beforeZ > 0 && afterZ <= 0 && Math.abs( afterX ) <= halfWidth && Math.abs( current.y - y ) <= halfHeight;
}

export function rotatePortalVelocity( velocity, entryYaw, exitYaw ) {
	const yaw = exitYaw - entryYaw;
	const cos = Math.cos( yaw ), sin = Math.sin( yaw );
	return { x: velocity.x * cos + velocity.z * sin, z: - velocity.x * sin + velocity.z * cos };
}

// Place destination-world geometry so its signed exit transform meets the local entry.
export function alignPortalPreview( root, entry, exit ) {
	const yaw = entry.yaw - exit.yaw;
	const cos = Math.cos( yaw ), sin = Math.sin( yaw );
	const [ x, y, z ] = exit.position;
	const rotatedX = x * cos + z * sin;
	const rotatedZ = - x * sin + z * cos;
	root.rotation.y = yaw;
	root.position.set( entry.position[ 0 ] - rotatedX, entry.position[ 1 ] - y, entry.position[ 2 ] - rotatedZ );
	return root;
}

function localX( x, z, originX, originZ, yaw ) {
	const dx = x - originX, dz = z - originZ;
	return dx * Math.cos( yaw ) - dz * Math.sin( yaw );
}

function localZ( x, z, originX, originZ, yaw ) {
	const dx = x - originX, dz = z - originZ;
	return dx * Math.sin( yaw ) + dz * Math.cos( yaw );
}
