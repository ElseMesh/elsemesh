import { WORLD } from './WorldLayout.js';

// The approach runs beside the east edge of the pier and stops short of its head.
// The first position is below the surface, offshore in the pier's open-water channel.
export const KAIJU_ROUTE = Object.freeze({
	start: { x: 86, z: 290 },
	end: { x: 84, z: 54 },
	duration: 92,
	height: 24,
});

const clamp01 = ( v ) => Math.max( 0, Math.min( 1, v ) );
const smooth = ( v ) => v * v * ( 3 - 2 * v );

export function kaijuPoseAt( elapsed, terrain ) {
	const route = KAIJU_ROUTE;
	const progress = clamp01( elapsed / route.duration );
	// Ease into the shallows; the distant creature is initially wholly underwater.
	const travel = smooth( progress );
	const x = route.start.x + ( route.end.x - route.start.x ) * travel;
	const z = route.start.z + ( route.end.z - route.start.z ) * travel;
	const ground = terrain.heightAt( x, z );
	const rise = smooth( clamp01( progress / 0.27 ) );
	const feet = - 28 * ( 1 - rise ) + ground * rise;
	const exposed = clamp01( ( feet + route.height - 0.3 ) / route.height );
	return { x, z, feet, progress, exposed, moving: progress < 1, pierClearance: x - ( WORLD.pier.x + WORLD.pier.headWidth / 2 ) };
}
