import assert from 'node:assert/strict';
import { crossedPortalPlane, rotatePortalVelocity } from '../src/network/PortalHandoff.js';

const portal = { entry: { position: [ 0, 1, 0 ], yaw: 0 } };
assert.equal( crossedPortalPlane( { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: - 0.1 }, portal ), true, 'front-to-back crossing transfers' );
assert.equal( crossedPortalPlane( { x: 0, y: 1, z: - 1 }, { x: 0, y: 1, z: 0.1 }, portal ), false, 'back-to-front crossing does not transfer' );
assert.equal( crossedPortalPlane( { x: 2, y: 1, z: 1 }, { x: 2, y: 1, z: - 0.1 }, portal ), false, 'crossings outside the doorway width do not transfer' );
assert.equal( crossedPortalPlane( { x: 0, y: 4, z: 1 }, { x: 0, y: 4, z: - 0.1 }, portal ), false, 'crossings above the doorway do not transfer' );
assert.equal( crossedPortalPlane( { x: 1, y: 1, z: 1 }, { x: - 1, y: 1, z: - 1 }, { entry: { position: [ 0, 1, 0 ], yaw: Math.PI / 2 } } ), true, 'portal yaw rotates the entry plane' );

const velocity = rotatePortalVelocity( { x: 0, z: - 1 }, 0, Math.PI / 2 );
assert.ok( Math.abs( velocity.x + 1 ) < 1e-9 && Math.abs( velocity.z ) < 1e-9, 'velocity follows the destination orientation' );
console.log( 'ok   portal crossing geometry and orientation handoff' );
