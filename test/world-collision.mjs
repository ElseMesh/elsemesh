import assert from 'node:assert/strict';
import { Colliders } from '../src/world/Colliders.js';
import { registerWorldPackageCollisions, unregisterWorldPackageCollisions } from '../src/network/WorldPackage.js';
import { validateWorldSource } from '../src/network/WorldSource.js';

const collision = { shape: 'box', enabled: true, center: [ 1, 1, 1 ], halfExtents: [ 1, 2, 3 ], walkable: true, solid: true };
const object = {
	id: 'tw-object:platform', kind: 'asset-instance', label: 'Platform', assetId: `sha256:${'a'.repeat( 64 )}`,
	transform: { position: [ 10, 20, 30 ], yaw: Math.PI / 2 }, scale: [ 2, 3, 4 ], collision,
};
const source = {
	protocol: 'tidewater.world-source/1', worldId: 'tw-world:test', title: 'Collision', coordinateSystem: 'right-handed-y-up-meters', styleGuide: '',
	rules: { gravity: 1, avatarComplexity: 1000, physicsProfile: 'tidewater-default' }, objects: [ object ], portals: [], updatedAt: '2026-10-01T00:00:00Z',
};
assert.doesNotThrow( () => validateWorldSource( source ), 'enabled box collision with bounded dimensions is valid' );
assert.throws( () => validateWorldSource( { ...source, objects: [ { ...object, collision: { ...collision, halfExtents: [ 1, 0, 3 ] } } ] } ), /bounded box data/, 'zero collision extents are rejected' );

const root = { children: [ { userData: { worldObjectId: object.id } } ], userData: { worldPackage: {
	connector: { manifest: { objects: [ object ] } }, loadedObjects: new Set( [ object.id ] ),
} } };
const colliders = new Colliders();
registerWorldPackageCollisions( root, colliders );
assert.equal( colliders.boxes.length, 1, 'active package registers its authored collider' );
const box = colliders.boxes[ 0 ];
assert.ok( Math.abs( box.center.x - 14 ) < 1e-9 && Math.abs( box.center.y - 23 ) < 1e-9 && Math.abs( box.center.z - 28 ) < 1e-9, 'local collider center follows instance scale, yaw, and translation' );
assert.deepEqual( [ box.half.x, box.half.y, box.half.z ], [ 2, 6, 12 ], 'half extents follow instance scale' );
assert.equal( box.walkable, true );
assert.equal( box.solid, true );
registerWorldPackageCollisions( root, colliders );
assert.equal( colliders.boxes.length, 1, 'streaming registration is idempotent' );
unregisterWorldPackageCollisions( root, colliders );
assert.equal( colliders.boxes.length, 0, 'world handoff removes old-world colliders' );
console.log( 'ok   authored world collisions validate, transform, register, and clean up' );
