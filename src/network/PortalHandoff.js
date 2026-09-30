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

function localX( x, z, originX, originZ, yaw ) {
	const dx = x - originX, dz = z - originZ;
	return dx * Math.cos( yaw ) - dz * Math.sin( yaw );
}

function localZ( x, z, originX, originZ, yaw ) {
	const dx = x - originX, dz = z - originZ;
	return dx * Math.sin( yaw ) + dz * Math.cos( yaw );
}
