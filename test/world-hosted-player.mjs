import assert from 'node:assert/strict';
import { Vector3 } from '../src/engine/math/Vector3.js';
import { Player } from '../src/player/Player.js';
import { Colliders } from '../src/world/Colliders.js';

const positions = new Float32Array( 11 * 11 * 3 );
for ( let row = 0; row < 11; row ++ ) for ( let column = 0; column < 11; column ++ ) {
	const index = ( row * 11 + column ) * 3;
	positions[ index ] = column - 5;
	positions[ index + 1 ] = 0;
	positions[ index + 2 ] = row - 5;
}
const colliders = new Colliders();
colliders.addHeightfield( positions, 11, 11, { position: new Vector3(), scale: new Vector3( 1, 1, 1 ) } );
let axes = { x: 0, y: 1, sprint: 0 };
let jumpPressed = false;
const input = {
	consumeLook: () => ( { x: 0, y: 0 } ),
	moveAxes: () => axes,
	down: () => false,
	hit: ( key ) => key === 'Space' && jumpPressed,
};
const camera = { position: new Vector3(), quaternion: { setFromEuler() {} } };
const player = {
	camera, input, colliders, position: new Vector3(), velocity: new Vector3(),
	yaw: 0, pitch: 0, grounded: false, gravity: 9.81,
};
Player.prototype.setWorldRules.call( player, { gravity: 1, movement: { walkSpeed: 1.5, sprintSpeed: 4, jumpSpeed: 2.5 } } );
Player.prototype.setHostedWorldPose.call( player, new Vector3( 0, 1.62, 0 ), 0, 0 );
assert.equal( player.position.y, 0 );
for ( let frame = 0; frame < 60; frame ++ ) Player.prototype.updateHostedWorld.call( player, 1 / 60 );
assert.ok( player.position.z < -1, 'hosted first-person controller moves forward using keyboard axes' );
assert.equal( player.position.y, 0, 'hosted player remains grounded on the active world heightfield' );
assert.equal( player.grounded, true );
assert.ok( camera.position.z < -1, 'camera follows the hosted player' );
assert.ok( Math.abs( player.velocity.z + 1.5 ) < 0.01, 'hosted walk speed follows the signed world rule' );
axes = { x: 0, y: 1, sprint: 1 };
for ( let frame = 0; frame < 60; frame ++ ) Player.prototype.updateHostedWorld.call( player, 1 / 60 );
assert.ok( Math.abs( player.velocity.z + 4 ) < 0.01, 'hosted sprint speed follows the signed world rule' );
Player.prototype.setHostedWorldPose.call( player, new Vector3( 0, 1.62, 0 ), 0, 0 );
player.grounded = true;
jumpPressed = true;
Player.prototype.updateHostedWorld.call( player, 1 / 60 );
assert.ok( player.velocity.y > 2.3 && player.velocity.y < 2.5, 'hosted jump impulse follows the signed world rule' );
console.log( 'ok   hosted first-person movement uses only active world colliders' );
