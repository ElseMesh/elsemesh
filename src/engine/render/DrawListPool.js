// Only render() borrows these lists. Public collect() results remain owned by
// their caller. A lease lasts until every draw/callback of that render finishes,
// so nested renders cannot overwrite an outer list that is still in use.
export class DrawListPool {

	constructor() { this.free = []; }

	acquire() {

		return this.free.pop() || { opaque: [], transparent: [], records: [], used: 0 };

	}

	release( list ) {

		// Keep the record storage, but do not retain a disposed scene through it.
		for ( let i = 0; i < list.used; i ++ ) {

			const item = list.records[ i ];
			item.object = item.geometry = item.material = null;

		}
		list.used = 0;
		list.opaque.length = list.transparent.length = 0;
		this.free.push( list );

	}

}
