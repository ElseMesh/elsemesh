import { Quaternion, Vector3 } from '../engine/math/index.js';

const _up = new Vector3( 0, 1, 0 );
const _entry = new Vector3();
const _exit = new Vector3();
const _portalRotation = new Quaternion();

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

// Map the visitor's view through the opening into destination coordinates.
export function mapPortalCamera( sourceCamera, destinationCamera, entry, exit ) {
	const yaw = exit.yaw - entry.yaw;
	_entry.fromArray( entry.position );
	_exit.fromArray( exit.position );
	destinationCamera.position.copy( sourceCamera.position ).sub( _entry ).applyAxisAngle( _up, yaw ).add( _exit );
	_portalRotation.setFromAxisAngle( _up, yaw );
	destinationCamera.quaternion.copy( _portalRotation ).multiply( sourceCamera.quaternion );
	destinationCamera.fov = sourceCamera.fov;
	destinationCamera.near = sourceCamera.near;
	destinationCamera.far = sourceCamera.far;
	destinationCamera.aspect = 0.5;
	destinationCamera.updateProjectionMatrix();
	destinationCamera.updateMatrixWorld( true );
	return destinationCamera;
}

// Plane normal points toward the source-side of the exit. Portal rendering discards
// fragments with positive signed distance so only content beyond the threshold shows.
export function portalExitClipPlane( exit ) {
	const nx = Math.sin( exit.yaw ), nz = Math.cos( exit.yaw );
	const [ x, , z ] = exit.position;
	return [ nx, 0, nz, - nx * x - nz * z ];
}

function localX( x, z, originX, originZ, yaw ) {
	const dx = x - originX, dz = z - originZ;
	return dx * Math.cos( yaw ) - dz * Math.sin( yaw );
}

function localZ( x, z, originX, originZ, yaw ) {
	const dx = x - originX, dz = z - originZ;
	return dx * Math.sin( yaw ) + dz * Math.cos( yaw );
}
