import * as THREE from '../engine/index.js';
import { ColliderGrid } from './ColliderGrid.js';

// Lightweight collision world for the character controller and boat.
// Boxes are oriented around Y only. Walkable boxes (decks, floors, stairs) act as ground.
export class Colliders {

	constructor() {

		this.boxes = [];
		this.cylinders = [];
		this._v = new THREE.Vector3();
		// Qualified spatial queries build lazily; false retains the flat comparison path.
		this.optimizeSpatialQueries = true;
		this._spatialDirty = true;
		this._spatial = null;
		this.queryStats = { enabled: false };
		this.resetQueryStats();

	}

	// center: world center, half: half extents (x, y, z) in the box's local frame, rotY: yaw (radians)
	addBox( center, half, rotY = 0, { walkable = false, solid = true, tag = '' } = {} ) {

		const b = {
			center: center.clone(), half: half.clone(), rotY,
			cos: Math.cos( rotY ), sin: Math.sin( rotY ),
			walkable, solid, tag,
			top: center.y + half.y, bottom: center.y - half.y,
			radius: Math.hypot( half.x, half.z ),
		};
		this.boxes.push( b );
		this.invalidateSpatialQueries();
		return b;

	}

	addCylinder( x, z, radius, yMin, yMax, { tag = '' } = {} ) {

		const c = { x, z, radius, yMin, yMax, tag };
		this.cylinders.push( c );
		this.invalidateSpatialQueries();
		return c;

	}

	// Geometry is static in the current world. solid/walkable remain live and do
	// not need invalidation. Call this after in-place center/half/cos/sin/radius
	// edits, same-length element replacement/reordering, or changes through retained
	// geometry references. addBox/addCylinder and collection length/reference
	// changes rebuild automatically. No proxies alter the flat baseline's costs.
	invalidateSpatialQueries() { this._spatialDirty = true; }

	resetQueryStats() {

		Object.assign( this.queryStats, { groundQueries: 0, capsuleQueries: 0, rayQueries: 0,
			boxCandidates: 0, cylinderCandidates: 0, capsuleRequeries: 0, indexRebuilds: 0 } );

	}

	_spatialIndex( stats ) {

		if ( ! this.optimizeSpatialQueries ) return null;
		const s = this._spatial;
		if ( this._spatialDirty || ! s || s.boxes.records !== this.boxes || s.cylinders.records !== this.cylinders ||
			s.boxes.length !== this.boxes.length || s.cylinders.length !== this.cylinders.length ) {

			this._spatial = { boxes: new ColliderGrid( this.boxes, 'box' ), cylinders: new ColliderGrid( this.cylinders, 'cylinder' ) };
			this._spatialDirty = false;
			if ( stats ) stats.indexRebuilds ++;

		}
		return this._spatial;

	}

	_toLocal( b, x, z ) {

		const dx = x - b.center.x, dz = z - b.center.z;
		return [ dx * b.cos - dz * b.sin, dx * b.sin + dz * b.cos ];

	}

	_toWorldDir( b, lx, lz ) {

		return [ lx * b.cos + lz * b.sin, - lx * b.sin + lz * b.cos ];

	}

	// Highest walkable surface under (x, z) not higher than maxY.
	groundHeightAt( x, z, maxY, pad = 0 ) {

		if ( this.optimizeSpatialQueries ) return this._groundHeightAtIndexed( x, z, maxY, pad );
		const stats = this.queryStats.enabled ? this.queryStats : null;
		if ( stats ) { stats.groundQueries ++; stats.boxCandidates += this.boxes.length; }

		let best = - Infinity;
		for ( const b of this.boxes ) {

			if ( ! b.walkable || b.top > maxY ) continue;
			if ( Math.abs( x - b.center.x ) > b.radius + pad + 0.01 || Math.abs( z - b.center.z ) > b.radius + pad + 0.01 ) continue;
			const [ lx, lz ] = this._toLocal( b, x, z );
			if ( Math.abs( lx ) <= b.half.x + pad && Math.abs( lz ) <= b.half.z + pad ) best = Math.max( best, b.top );

		}

		return best;

	}

	// Push a vertical capsule (feet at pos.y) out of solid geometry. Returns true if collided.
	resolveCapsule( pos, radius, height, stepHeight = 0.35 ) {

		if ( this.optimizeSpatialQueries ) return this._resolveCapsuleIndexed( pos, radius, height, stepHeight );
		const stats = this.queryStats.enabled ? this.queryStats : null;
		if ( stats ) { stats.capsuleQueries ++; stats.boxCandidates += this.boxes.length; stats.cylinderCandidates += this.cylinders.length; }

		let hit = false;
		for ( const b of this.boxes ) {

			if ( ! b.solid ) continue;
			if ( pos.y + height < b.bottom || pos.y + stepHeight > b.top ) continue;
			if ( Math.abs( pos.x - b.center.x ) > b.radius + radius || Math.abs( pos.z - b.center.z ) > b.radius + radius ) continue;
			const [ lx, lz ] = this._toLocal( b, pos.x, pos.z );
			const cx = Math.max( - b.half.x, Math.min( b.half.x, lx ) );
			const cz = Math.max( - b.half.z, Math.min( b.half.z, lz ) );
			let dx = lx - cx, dz = lz - cz;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= radius * radius ) continue;
			let nx, nz, pen;
			if ( d2 > 1e-8 ) {

				const d = Math.sqrt( d2 );
				nx = dx / d; nz = dz / d; pen = radius - d;

			} else {

				// center inside box: push out along the smallest axis
				const px = b.half.x - Math.abs( lx ), pz = b.half.z - Math.abs( lz );
				if ( px < pz ) { nx = Math.sign( lx ) || 1; nz = 0; pen = px + radius; } else { nx = 0; nz = Math.sign( lz ) || 1; pen = pz + radius; }

			}

			const [ wx, wz ] = this._toWorldDir( b, nx, nz );
			pos.x += wx * pen;
			pos.z += wz * pen;
			hit = true;

		}

		for ( const c of this.cylinders ) {

			if ( pos.y + height < c.yMin || pos.y + stepHeight > c.yMax ) continue;
			const dx = pos.x - c.x, dz = pos.z - c.z;
			const r = c.radius + radius;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= r * r ) continue;
			const d = Math.sqrt( d2 ) || 1e-4;
			pos.x = c.x + dx / d * r;
			pos.z = c.z + dz / d * r;
			hit = true;

		}

		return hit;

	}

	// Segment/ray against boxes (XZ-plane rotated) for camera occlusion; returns distance or Infinity.
	raycast( origin, dir, maxDist ) {

		if ( this.optimizeSpatialQueries ) return this._raycastIndexed( origin, dir, maxDist );
		const stats = this.queryStats.enabled ? this.queryStats : null;
		if ( stats ) { stats.rayQueries ++; stats.boxCandidates += this.boxes.length; }

		let best = maxDist;
		for ( const b of this.boxes ) {

			if ( ! b.solid ) continue;
			const ox = origin.x - b.center.x, oz = origin.z - b.center.z, oy = origin.y - b.center.y;
			const lox = ox * b.cos - oz * b.sin, loz = ox * b.sin + oz * b.cos;
			const ldx = dir.x * b.cos - dir.z * b.sin, ldz = dir.x * b.sin + dir.z * b.cos;
			let tmin = 0, tmax = best;
			const slab = ( o, d, h ) => {

				if ( Math.abs( d ) < 1e-8 ) return Math.abs( o ) <= h;
				let t1 = ( - h - o ) / d, t2 = ( h - o ) / d;
				if ( t1 > t2 ) { const t = t1; t1 = t2; t2 = t; }
				tmin = Math.max( tmin, t1 );
				tmax = Math.min( tmax, t2 );
				return tmin <= tmax;

			};

			if ( slab( lox, ldx, b.half.x ) && slab( oy, dir.y, b.half.y ) && slab( loz, ldz, b.half.z ) ) best = Math.min( best, tmin );

		}

		return best;

	}

	// Indexed paths retain the same narrow phase. Keeping flat loops separate
	// avoids per-collider feature/counter branches in the comparison baseline.
	_groundHeightAtIndexed( x, z, maxY, pad = 0 ) {

		const stats = this.queryStats.enabled ? this.queryStats : null;
		if ( stats ) stats.groundQueries ++;
		const index = this._spatialIndex( stats );
		const expand = Math.max( 0, pad ) + 0.01;
		const candidates = index ? index.boxes.query( x - expand, z - expand, x + expand, z + expand ) : null;
		let best = - Infinity;
		for ( let i = 0, n = candidates ? candidates.length : this.boxes.length; i < n; i ++ ) {

			const b = this.boxes[ candidates ? candidates[ i ] : i ];
			if ( stats ) stats.boxCandidates ++;

			if ( ! b.walkable || b.top > maxY ) continue;
			if ( Math.abs( x - b.center.x ) > b.radius + pad + 0.01 || Math.abs( z - b.center.z ) > b.radius + pad + 0.01 ) continue;
			const [ lx, lz ] = this._toLocal( b, x, z );
			if ( Math.abs( lx ) <= b.half.x + pad && Math.abs( lz ) <= b.half.z + pad ) best = Math.max( best, b.top );

		}

		return best;

	}

	// Push a vertical capsule (feet at pos.y) out of solid geometry. Returns true if collided.
	_resolveCapsuleIndexed( pos, radius, height, stepHeight = 0.35 ) {

		const stats = this.queryStats.enabled ? this.queryStats : null;
		if ( stats ) stats.capsuleQueries ++;
		const index = this._spatialIndex( stats );
		const expand = Math.abs( radius );
		let candidates = index ? index.boxes.query( pos.x - expand, pos.z - expand, pos.x + expand, pos.z + expand ) : null;
		let hit = false;
		for ( let i = 0; i < ( candidates ? candidates.length : this.boxes.length ); i ++ ) {

			const order = candidates ? candidates[ i ] : i;
			const b = this.boxes[ order ];
			if ( stats ) stats.boxCandidates ++;

			if ( ! b.solid ) continue;
			if ( pos.y + height < b.bottom || pos.y + stepHeight > b.top ) continue;
			if ( Math.abs( pos.x - b.center.x ) > b.radius + radius || Math.abs( pos.z - b.center.z ) > b.radius + radius ) continue;
			const [ lx, lz ] = this._toLocal( b, pos.x, pos.z );
			const cx = Math.max( - b.half.x, Math.min( b.half.x, lx ) );
			const cz = Math.max( - b.half.z, Math.min( b.half.z, lz ) );
			let dx = lx - cx, dz = lz - cz;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= radius * radius ) continue;
			let nx, nz, pen;
			if ( d2 > 1e-8 ) {

				const d = Math.sqrt( d2 );
				nx = dx / d; nz = dz / d; pen = radius - d;

			} else {

				// center inside box: push out along the smallest axis
				const px = b.half.x - Math.abs( lx ), pz = b.half.z - Math.abs( lz );
				if ( px < pz ) { nx = Math.sign( lx ) || 1; nz = 0; pen = px + radius; } else { nx = 0; nz = Math.sign( lz ) || 1; pen = pz + radius; }

			}

			const [ wx, wz ] = this._toWorldDir( b, nx, nz );
			pos.x += wx * pen;
			pos.z += wz * pen;
			hit = true;
			if ( index ) {

				// A push can leave the original cells. Only later records can now
				// participate, exactly as in the original one-pass array walk.
				candidates = index.boxes.query( pos.x - expand, pos.z - expand, pos.x + expand, pos.z + expand, order );
				i = -1;
				if ( stats ) stats.capsuleRequeries ++;

			}

		}

		candidates = index ? index.cylinders.query( pos.x - expand, pos.z - expand, pos.x + expand, pos.z + expand ) : null;
		for ( let i = 0; i < ( candidates ? candidates.length : this.cylinders.length ); i ++ ) {

			const order = candidates ? candidates[ i ] : i;
			const c = this.cylinders[ order ];
			if ( stats ) stats.cylinderCandidates ++;

			if ( pos.y + height < c.yMin || pos.y + stepHeight > c.yMax ) continue;
			const dx = pos.x - c.x, dz = pos.z - c.z;
			const r = c.radius + radius;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= r * r ) continue;
			const d = Math.sqrt( d2 ) || 1e-4;
			pos.x = c.x + dx / d * r;
			pos.z = c.z + dz / d * r;
			hit = true;
			if ( index ) {

				candidates = index.cylinders.query( pos.x - expand, pos.z - expand, pos.x + expand, pos.z + expand, order );
				i = -1;
				if ( stats ) stats.capsuleRequeries ++;

			}

		}

		return hit;

	}

	// Segment/ray against boxes (XZ-plane rotated) for camera occlusion; returns distance or Infinity.
	_raycastIndexed( origin, dir, maxDist ) {

		const stats = this.queryStats.enabled ? this.queryStats : null;
		if ( stats ) stats.rayQueries ++;
		const index = this._spatialIndex( stats );
		const endX = origin.x + dir.x * maxDist, endZ = origin.z + dir.z * maxDist;
		// The original slab test treats tiny local directions as parallel. Include
		// that maximum drift in the broad-phase segment rather than changing it.
		const pad = Math.abs( maxDist ) * 2e-8 + 1e-7;
		const candidates = index ? index.boxes.query( Math.min( origin.x, endX ) - pad, Math.min( origin.z, endZ ) - pad,
			Math.max( origin.x, endX ) + pad, Math.max( origin.z, endZ ) + pad ) : null;
		let best = maxDist;
		for ( let i = 0, n = candidates ? candidates.length : this.boxes.length; i < n; i ++ ) {

			const b = this.boxes[ candidates ? candidates[ i ] : i ];
			if ( stats ) stats.boxCandidates ++;

			if ( ! b.solid ) continue;
			const ox = origin.x - b.center.x, oz = origin.z - b.center.z, oy = origin.y - b.center.y;
			const lox = ox * b.cos - oz * b.sin, loz = ox * b.sin + oz * b.cos;
			const ldx = dir.x * b.cos - dir.z * b.sin, ldz = dir.x * b.sin + dir.z * b.cos;
			let tmin = 0, tmax = best;
			const slab = ( o, d, h ) => {

				if ( Math.abs( d ) < 1e-8 ) return Math.abs( o ) <= h;
				let t1 = ( - h - o ) / d, t2 = ( h - o ) / d;
				if ( t1 > t2 ) { const t = t1; t1 = t2; t2 = t; }
				tmin = Math.max( tmin, t1 );
				tmax = Math.min( tmax, t2 );
				return tmin <= tmax;

			};

			if ( slab( lox, ldx, b.half.x ) && slab( oy, dir.y, b.half.y ) && slab( loz, ldz, b.half.z ) ) best = Math.min( best, tmin );

		}

		return best;

	}

}
