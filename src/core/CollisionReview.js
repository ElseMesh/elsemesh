// Development-only CPU query review, called explicitly by the review UI. It does
// not step gameplay, use the GPU, or claim that query timing predicts game FPS.
function random( seed ) {
	return () => { seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0; return seed / 4294967296; };
}

export function createCollisionWorkload( colliders, { seed = 0x517cc1b7, anchors = 192 } = {} ) {

	if ( ! Number.isInteger( anchors ) || anchors < 1 || anchors > 1024 ) throw new RangeError( 'anchors must be between 1 and 1024' );
	const rnd = random( seed ), points = [];
	const total = colliders.boxes.length + colliders.cylinders.length;
	let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
	for ( const b of colliders.boxes ) {
		minX = Math.min( minX, b.center.x ); maxX = Math.max( maxX, b.center.x );
		minZ = Math.min( minZ, b.center.z ); maxZ = Math.max( maxZ, b.center.z );
	}
	for ( const c of colliders.cylinders ) {
		minX = Math.min( minX, c.x ); maxX = Math.max( maxX, c.x );
		minZ = Math.min( minZ, c.z ); maxZ = Math.max( maxZ, c.z );
	}
	if ( ! total ) { minX = minZ = -100; maxX = maxZ = 100; }
	const count = Math.min( total, anchors );
	for ( let i = 0; i < count; i ++ ) {
		const record = Math.floor( i * total / count );
		if ( record < colliders.boxes.length ) {
			const b = colliders.boxes[ record ];
			const lx = i % 3 === 0 ? b.half.x + .1 : ( rnd() * 2 - 1 ) * b.half.x;
			const lz = ( rnd() * 2 - 1 ) * b.half.z;
			points.push( { x: b.center.x + lx * b.cos + lz * b.sin,
				z: b.center.z - lx * b.sin + lz * b.cos,
				y: b.bottom + rnd() * Math.max( 0, b.top - b.bottom ), source: `box:${ record }` } );
		} else {
			const c = colliders.cylinders[ record - colliders.boxes.length ];
			const angle = rnd() * Math.PI * 2, radius = c.radius + ( rnd() - .5 ) * .6;
			points.push( { x: c.x + Math.cos( angle ) * radius, z: c.z + Math.sin( angle ) * radius,
				y: c.yMin + rnd() * Math.max( 0, c.yMax - c.yMin ), source: `cylinder:${ record - colliders.boxes.length }` } );
		}
	}
	const dispersed = Math.max( 16, Math.ceil( count / 4 ) );
	for ( let i = 0; i < dispersed; i ++ ) points.push( {
		x: minX - 100 + rnd() * ( maxX - minX + 200 ), z: minZ - 100 + rnd() * ( maxZ - minZ + 200 ),
		y: rnd() * 20 - 4, source: 'dispersed',
	} );
	return points.map( p => {
		const angle = rnd() * Math.PI * 2, dy = ( rnd() - .5 ) * .6, horizontal = Math.sqrt( 1 - dy * dy );
		return { ...p, radius: .25 + rnd() * .2, height: 1.6, step: 0, pad: rnd() * .2,
			maxY: p.y + 2, dir: { x: Math.cos( angle ) * horizontal, y: dy, z: Math.sin( angle ) * horizontal }, distance: 20 + rnd() * 100 };
	} );

}

// Shared with the Node raw-source comparison. A reused output buffer keeps
// allocation/serialization outside the timed query batches.
export function sampleCollisionWorkload( colliders, queries, repetitions = 1, output = new Float64Array( queries.length * 6 ) ) {

	const pos = { x: 0, y: 0, z: 0 };
	for ( let repeat = 0; repeat < repetitions; repeat ++ ) {
		for ( let i = 0; i < queries.length; i ++ ) {
			const q = queries[ i ], offset = i * 6;
			output[ offset ] = colliders.groundHeightAt( q.x, q.z, q.maxY, q.pad );
			pos.x = q.x; pos.y = q.y; pos.z = q.z;
			output[ offset + 1 ] = +colliders.resolveCapsule( pos, q.radius, q.height, q.step );
			output[ offset + 2 ] = pos.x; output[ offset + 3 ] = pos.y; output[ offset + 4 ] = pos.z;
			output[ offset + 5 ] = colliders.raycast( q, q.dir, q.distance );
		}
	}
	return output;

}

function mismatch( a, b ) {
	for ( let i = 0; i < a.length; i ++ ) if ( ! Object.is( a[ i ], b[ i ] ) ) return { query: Math.floor( i / 6 ), component: i % 6, flat: a[ i ], indexed: b[ i ] };
	return null;
}
function digest( output ) {
	let hash = 2166136261;
	for ( const value of new Uint8Array( output.buffer, output.byteOffset, output.byteLength ) ) hash = Math.imul( hash ^ value, 16777619 );
	return ( hash >>> 0 ).toString( 16 ).padStart( 8, '0' );
}

export function runCollisionReview( colliders, { seed = 0x517cc1b7, anchors = 192, repetitions = 6, warmup = 2 } = {} ) {

	if ( ! Number.isInteger( repetitions ) || repetitions < 1 || repetitions > 32 ||
		! Number.isInteger( warmup ) || warmup < 1 || warmup > 8 ) throw new RangeError( 'Invalid bounded workload repetitions' );
	const savedFlag = colliders.optimizeSpatialQueries, savedStats = { ...colliders.queryStats };
	const queries = createCollisionWorkload( colliders, { seed, anchors } );
	const output = new Float64Array( queries.length * 6 );
	const report = { schema: 'elsemesh.collision-review/v1', valid: false, seed,
		scope: 'Deterministic CPU queries against loaded collider geometry; not gameplay simulation or FPS.',
		world: { boxes: colliders.boxes.length, cylinders: colliders.cylinders.length },
		workload: { anchorLimit: anchors, groups: queries.length, queriesPerBatch: queries.length * 3,
			repetitions, warmup, cycles: 2, order: [ 'flat', 'indexed', 'indexed', 'flat' ],
			timingExcludesIndexBuildAndCounters: true, queries },
		equivalence: null, candidates: {}, samples: [] };
	try {
		colliders.queryStats.enabled = false;
		colliders.optimizeSpatialQueries = false;
		const reference = sampleCollisionWorkload( colliders, queries );
		colliders.optimizeSpatialQueries = true;
		sampleCollisionWorkload( colliders, queries, 1, output ); // build outside timing
		const difference = mismatch( reference, output );
		report.equivalence = { exact: ! difference, difference, flatDigest: digest( reference ), indexedDigest: digest( output ) };
		if ( difference ) return report;
		for ( const enabled of [ false, true ] ) {
			colliders.optimizeSpatialQueries = enabled;
			sampleCollisionWorkload( colliders, queries, warmup, output );
		}
		for ( let cycle = 0; cycle < 2; cycle ++ ) {
			for ( const enabled of [ false, true, true, false ] ) {
				colliders.optimizeSpatialQueries = enabled;
				sampleCollisionWorkload( colliders, queries, 1, output ); // untimed mode warm-up
				const start = performance.now();
				sampleCollisionWorkload( colliders, queries, repetitions, output );
				const durationMs = performance.now() - start;
				const difference = mismatch( reference, output );
				report.samples.push( { cycle, mode: enabled ? 'indexed' : 'flat', durationMs,
					queries: queries.length * 3 * repetitions, outputDigest: digest( output ), exact: ! difference } );
				if ( difference ) { report.equivalence.exact = false; report.equivalence.difference = difference; return report; }
			}
		}
		// Run instrumentation after timing: enabling these branches may itself
		// cause JIT re-optimization, which should not confound the timed samples.
		for ( const enabled of [ false, true ] ) {
			colliders.optimizeSpatialQueries = enabled;
			colliders.resetQueryStats(); colliders.queryStats.enabled = true;
			sampleCollisionWorkload( colliders, queries, 1, output );
			report.candidates[ enabled ? 'indexed' : 'flat' ] = { ...colliders.queryStats };
		}
		report.valid = true;
		return report;
	} finally {
		colliders.optimizeSpatialQueries = savedFlag;
		Object.assign( colliders.queryStats, savedStats );
	}

}
