// Conservative XZ broad phase. Original array order is significant for capsule
// resolution. Large / malformed entries stay in an always-considered list.
const CELL_SIZE = 16;
const MAX_ENTRY_CELLS = 256;
const MAX_QUERY_CELLS = 4096;
const EPSILON = 1e-7;

export class ColliderGrid {

	constructor( records, kind ) {

		this.records = records;
		this.length = records.length;
		this.columns = new Map();
		this.overflow = [];
		this.bounds = new Array( records.length );
		this.seen = new Uint32Array( records.length );
		this.generation = 0;
		this.candidates = [];
		for ( let i = 0; i < records.length; i ++ ) {

			const r = records[ i ];
			let x, z, rx, rz;
			if ( kind === 'box' ) {

				x = r.center.x; z = r.center.z;
				// Rays use half extents; ground/capsules also use a cached radius.
				// Cover both even when half extents were edited without that radius.
				const det = r.cos * r.cos + r.sin * r.sin;
				rx = Math.max( r.radius, ( Math.abs( r.cos ) * r.half.x + Math.abs( r.sin ) * r.half.z ) / det );
				rz = Math.max( r.radius, ( Math.abs( r.sin ) * r.half.x + Math.abs( r.cos ) * r.half.z ) / det );
				if ( r.half.x < 0 || r.half.z < 0 || Math.abs( det - 1 ) > 1e-6 || det < 1e-12 ) rx = NaN;

			} else {

				x = r.x; z = r.z; rx = rz = r.radius;

			}
			const b = this.bounds[ i ] = [ x - rx - EPSILON, z - rz - EPSILON, x + rx + EPSILON, z + rz + EPSILON ];
			const x0 = Math.floor( b[ 0 ] / CELL_SIZE ), z0 = Math.floor( b[ 1 ] / CELL_SIZE );
			const x1 = Math.floor( b[ 2 ] / CELL_SIZE ), z1 = Math.floor( b[ 3 ] / CELL_SIZE );
			if ( ! b.every( Number.isFinite ) || rx < 0 || rz < 0 ||
				! [ x0, z0, x1, z1 ].every( Number.isSafeInteger ) || ( x1 - x0 + 1 ) * ( z1 - z0 + 1 ) > MAX_ENTRY_CELLS ) {

				this.overflow.push( i );
				continue;

			}
			for ( let cx = x0; cx <= x1; cx ++ ) {

				let column = this.columns.get( cx );
				if ( ! column ) this.columns.set( cx, column = new Map() );
				for ( let cz = z0; cz <= z1; cz ++ ) {

					let cell = column.get( cz );
					if ( ! cell ) column.set( cz, cell = [] );
					cell.push( i );

				}

			}

		}

	}

	// Reusable scratch storage, valid until this grid's next query.
	query( minX, minZ, maxX, maxZ, after = -1 ) {

		const out = this.candidates;
		out.length = 0;
		const x0 = Math.floor( minX / CELL_SIZE ), z0 = Math.floor( minZ / CELL_SIZE );
		const x1 = Math.floor( maxX / CELL_SIZE ), z1 = Math.floor( maxZ / CELL_SIZE );
		if ( ! Number.isSafeInteger( x0 ) || ! Number.isSafeInteger( z0 ) ||
			! Number.isSafeInteger( x1 ) || ! Number.isSafeInteger( z1 ) || x1 < x0 || z1 < z0 ||
			( x1 - x0 + 1 ) * ( z1 - z0 + 1 ) > MAX_QUERY_CELLS ) {

			for ( let i = after + 1; i < this.length; i ++ ) out.push( i );
			return out;

		}
		this.generation = ( this.generation + 1 ) >>> 0;
		if ( ! this.generation ) { this.seen.fill( 0 ); this.generation = 1; }
		const generation = this.generation;
		for ( let cx = x0; cx <= x1; cx ++ ) {

			const column = this.columns.get( cx );
			if ( ! column ) continue;
			for ( let cz = z0; cz <= z1; cz ++ ) {

				const cell = column.get( cz );
				if ( ! cell ) continue;
				for ( const i of cell ) {

					if ( i <= after || this.seen[ i ] === generation ) continue;
					this.seen[ i ] = generation;
					const b = this.bounds[ i ];
					if ( b[ 0 ] <= maxX && b[ 2 ] >= minX && b[ 1 ] <= maxZ && b[ 3 ] >= minZ ) out.push( i );

				}

			}

		}
		for ( const i of this.overflow ) if ( i > after ) out.push( i );
		out.sort( ( a, b ) => a - b );
		return out;

	}

}
