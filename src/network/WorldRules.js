// Runtime capability identifiers are part of the signed world contract. Add an
// identifier only after the browser loader actually implements that capability.
export const SUPPORTED_WORLD_FEATURES = new Set( [
	'tidewater.static-glb/1',
	'tidewater.portal-handoff/1',
	'tidewater.portal-preview-static/1',
] );
export const SUPPORTED_PHYSICS_PROFILES = new Set( [ 'default', 'tidewater-default' ] );

const FEATURE_ID = /^tidewater\.[a-z0-9.-]+\/\d+$/;

export function validateWorldRequirements( manifest ) {
	const rules = manifest?.rules;
	if ( ! rules || ! Number.isFinite( rules.gravity ) || rules.gravity < 0.2 || rules.gravity > 2 || ! Number.isInteger( rules.avatarComplexity ) || rules.avatarComplexity < 1 || rules.avatarComplexity > 100000 || ! SUPPORTED_PHYSICS_PROFILES.has( rules.physicsProfile ) ) {
		throw new Error( 'World manifest contains invalid runtime rules' );
	}
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

export function gravityAcceleration( rules ) {
	if ( ! Number.isFinite( rules?.gravity ) || rules.gravity < 0.2 || rules.gravity > 2 ) throw new Error( 'Invalid world gravity multiplier' );
	return 9.81 * rules.gravity;
}
