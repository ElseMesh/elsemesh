// Runtime capability identifiers are part of the signed world contract. Add an
// identifier only after the browser loader actually implements that capability.
export const SUPPORTED_WORLD_FEATURES = new Set( [
	'tidewater.static-glb/1',
	'tidewater.portal-handoff/1',
	'tidewater.portal-preview-static/1',
	'tidewater.static-glb-quaternion/1',
	'tidewater.procedural-island-vegetation/1',
	'tidewater.static-vegetation/1',
	'tidewater.island-ocean/1',
] );
export const SUPPORTED_PHYSICS_PROFILES = new Set( [ 'default', 'tidewater-default' ] );
export const DEFAULT_WORLD_MOVEMENT = Object.freeze( { walkSpeed: 3, sprintSpeed: 6.2, jumpSpeed: 4.6 } );
export const MAX_WORLD_PACKAGE_BYTES = 16 * 1024 * 1024 * 1024;

const FEATURE_ID = /^tidewater\.[a-z0-9.-]+\/\d+$/;

export function validateWorldRequirements( manifest ) {
	const rules = manifest?.rules;
	if ( ! rules || ! Number.isFinite( rules.gravity ) || rules.gravity < 0.2 || rules.gravity > 2 || ! Number.isInteger( rules.avatarComplexity ) || rules.avatarComplexity < 1 || rules.avatarComplexity > 100000 || ! SUPPORTED_PHYSICS_PROFILES.has( rules.physicsProfile ) ) {
		throw new Error( 'World manifest contains invalid runtime rules' );
	}
	validateWorldLevels( rules );
	movementParameters( rules );
	validateWorldPackageBudget( manifest );
	const required = rules.requiredFeatures ?? [];
	if ( ! Array.isArray( required ) || required.length > 64 ) throw new Error( 'World manifest contains an invalid requiredFeatures list' );
	const seen = new Set();
	for ( const feature of required ) {
		if ( typeof feature !== 'string' || feature.length > 96 || ! FEATURE_ID.test( feature ) || seen.has( feature ) ) throw new Error( 'World manifest contains an invalid or duplicate required feature' );
		if ( ! SUPPORTED_WORLD_FEATURES.has( feature ) ) throw new Error( `This client does not support required world feature: ${feature}` );
		seen.add( feature );
	}
	return manifest;
}

export function validateWorldLevels( rules ) {
	for ( const key of [ 'seaLevel', 'atmosphereLevel' ] ) {
		if ( rules?.[ key ] !== undefined && ( ! Number.isFinite( rules[ key ] ) || Math.abs( rules[ key ] ) > 1e6 ) ) throw new Error( `World ${key} must be a finite world-space Y coordinate within +/- 1,000,000 meters` );
	}
	return rules;
}

export function validateWorldPackageBudget( manifest ) {
	const maximum = manifest?.rules?.maxPackageBytes;
	if ( maximum === undefined ) return manifest;
	if ( ! Number.isSafeInteger( maximum ) || maximum < 1 || maximum > MAX_WORLD_PACKAGE_BYTES || ! Array.isArray( manifest.assets ) ) throw new Error( 'World package byte budget is invalid' );
	let declaredBytes = 0;
	for ( const asset of manifest.assets ) {
		if ( ! Number.isSafeInteger( asset?.bytes ) || asset.bytes < 0 || declaredBytes > maximum - asset.bytes ) throw new Error( 'World package exceeds its declared byte budget' );
		declaredBytes += asset.bytes;
	}
	return manifest;
}

export function movementParameters( rules ) {
	const movement = rules?.movement ?? DEFAULT_WORLD_MOVEMENT;
	if ( ! movement || ! Number.isFinite( movement.walkSpeed ) || movement.walkSpeed < 0.5 || movement.walkSpeed > 10 || ! Number.isFinite( movement.sprintSpeed ) || movement.sprintSpeed < movement.walkSpeed || movement.sprintSpeed > 15 || ! Number.isFinite( movement.jumpSpeed ) || movement.jumpSpeed < 0 || movement.jumpSpeed > 10 ) {
		throw new Error( 'World movement speeds are outside the supported range' );
	}
	return { walkSpeed: movement.walkSpeed, sprintSpeed: movement.sprintSpeed, jumpSpeed: movement.jumpSpeed };
}

export function gravityAcceleration( rules ) {
	if ( ! Number.isFinite( rules?.gravity ) || rules.gravity < 0.2 || rules.gravity > 2 ) throw new Error( 'Invalid world gravity multiplier' );
	return 9.81 * rules.gravity;
}
