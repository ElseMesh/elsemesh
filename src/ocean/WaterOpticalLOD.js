// Experimental optical approximation; the shader still resolves the real
// refracted depth first, so a visible pile, hull or reef shortens the path.
export const WATER_OPTICAL_LOD = Object.freeze( {
	distanceStart: 100, distanceEnd: 180,
	depthStart: 8, depthEnd: 16,
	tauStart: Math.log( 100 ), tauEnd: Math.log( 1000 ),
} );

const smooth = ( a, b, x ) => {
	const t = Math.max( 0, Math.min( 1, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );
};

// CPU reference for the numerical/transition contract, not a per-frame query.
export function waterOpticalLODWeight( { enabled, distance, depth, pathLength, extinction, debug = false } ) {
	if ( ! enabled || debug || ! [ distance, depth, pathLength, ...extinction ].every( Number.isFinite ) ) return 0;
	const p = WATER_OPTICAL_LOD;
	if ( distance <= p.distanceStart || depth <= p.depthStart ) return 0;
	const tau = Math.min( ...extinction ) * pathLength;
	if ( tau <= p.tauStart ) return 0;
	if ( distance >= p.distanceEnd && depth >= p.depthEnd && tau >= p.tauEnd ) return 1;
	return smooth( p.distanceStart, p.distanceEnd, distance ) * smooth( p.depthStart, p.depthEnd, depth ) *
		smooth( p.tauStart, p.tauEnd, tau );
}

const f = n => Number.isInteger( n ) ? n + '.0' : String( n );
const p = WATER_OPTICAL_LOD;
export const WATER_OPTICAL_LOD_WGSL = /* wgsl */`
fn waterOpticalLODWeight( enabled: f32, distance: f32, depth: f32, pathLength: f32, extinction: vec3f, debug: i32 ) -> f32 {
	if ( enabled < 0.5 || debug != 0 ) { return 0.0; }
	// Most shore/harbor pixels cannot converge: avoid transition arithmetic there.
	if ( distance <= ${ f( p.distanceStart ) } || depth <= ${ f( p.depthStart ) } ) { return 0.0; }
	let tau = min( extinction.x, min( extinction.y, extinction.z ) ) * pathLength;
	if ( tau <= ${ f( p.tauStart ) } ) { return 0.0; }
	if ( distance >= ${ f( p.distanceEnd ) } && depth >= ${ f( p.depthEnd ) } && tau >= ${ f( p.tauEnd ) } ) { return 1.0; }
	return smoothstep( ${ f( p.distanceStart ) }, ${ f( p.distanceEnd ) }, distance ) *
		smoothstep( ${ f( p.depthStart ) }, ${ f( p.depthEnd ) }, depth ) *
		smoothstep( ${ f( p.tauStart ) }, ${ f( p.tauEnd ) }, tau );
}
`;
