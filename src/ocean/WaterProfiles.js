export const WATER_BODY_PROFILES = Object.freeze( {
	'deep-ocean': Object.freeze( { amplitude: 1, slopeScale: 1, foamCoverage: 1, foamSharpness: 2.2, foamScale: 0.09 } ),
	'calm-lagoon': Object.freeze( { amplitude: 0.38, slopeScale: 0.58, foamCoverage: 0.55, foamSharpness: 2.8, foamScale: 0.07 } ),
	storm: Object.freeze( { amplitude: 1.45, slopeScale: 1.28, foamCoverage: 1.35, foamSharpness: 1.8, foamScale: 0.11 } ),
} );

export function applyWaterBodyProfile( surface, profile = 'deep-ocean' ) {
	const values = WATER_BODY_PROFILES[ profile ];
	if ( ! values ) throw new Error( `Unsupported water-body material profile: ${profile}` );
	for ( const [ key, value ] of Object.entries( values ) ) surface[ key ].value = value;
	return surface;
}
