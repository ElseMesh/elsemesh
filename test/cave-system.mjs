import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CaveSystem } from '../src/world/CaveSystem.js';
import { Colliders } from '../src/world/Colliders.js';
import { parseGLB } from '../src/world/debris/GLB.js';
import { Vector3 } from '../src/engine/index.js';
import { Player } from '../src/player/Player.js';
import { TerrainData } from '../src/world/TerrainData.js';

const layout = JSON.parse(readFileSync(new URL('../public/models/world/caves.json', import.meta.url)));
const glb = readFileSync(new URL('../public/models/world/caves.glb', import.meta.url));
const asset = parseGLB(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength));
const names = new Set(asset.meshes.map((mesh) => mesh.name));
for (const name of ['UN_Boat_Cavern', 'UN_Sheltered_Landing', 'UN_Four_Way_Junction', 'UN_Underneath_Hall', 'UN_Closed_Door', 'UN_Keypad_Base', 'UN_Waiting_Train_Roof', 'UN_Station_Approach']) {
	assert(names.has(name), `missing Blender export ${name}`);
}
assert(layout.passages.length >= 3);
const realTerrain = new TerrainData();
assert(realTerrain.heightAt(-355, 80) <= -3, 'approach channel needs boat draft');
assert(realTerrain.heightAt(-345, 80) <= -3, 'channel must meet the cave mouth');
const approach = [[64,36],[20,60],[-100,110],[-180,180],[-180,320],[-350,320],[-450,230],[-455,120],[-445,80],[-390,80],[-345,80]];
for (const [a, b] of approach.slice(0, -1).map((a, i) => [a, approach[i + 1]])) {
	for (let i = 0; i <= 40; i++) {
		const x = a[0] + (b[0] - a[0]) * i / 40, z = a[1] + (b[1] - a[1]) * i / 40;
		assert(realTerrain.heightAt(x, z) < -1.5, `boat route crosses shallow or dry ground at ${x}, ${z}`);
	}
}

const colliders = new Colliders();
const cave = new CaveSystem(layout, { heightAt: () => 30 }, colliders);
cave.addCollision();
assert(cave.boatGroundAt(-335, 80) < -3.5);
assert(cave.boatGroundAt(-300, 80) > cave.boatGroundAt(-335, 80), 'cave seabed shoals toward landing');
assert(cave.boatGroundAt(-304, 82) < -1.5, 'boat moors afloat alongside the landing');
assert.equal(cave.boatGroundAt(-335, 110), 30);
assert.equal(cave.groundHeightAt(-288, 70, 2), 1.2);
assert.equal(cave.groundHeightAt(-304, 70, 2), 1.2, 'landing reaches the moored boat');
assert.equal(cave.groundHeightAt(-305.2, 78.6, 2), 1.2, 'boat rail exit reaches dry landing');
assert.equal(cave.groundHeightAt(-245, 45, 4), 3.5);
assert.equal(cave.groundHeightAt(-215, 20, 3), 2.5);
assert.equal(cave.groundHeightAt(-220, -10, 2), 1.2);
assert.equal(cave.groundHeightAt(-215, 20, 31), null);
const floor = Player.prototype.groundAt.call({
	cave, terrain: { heightAt: () => 30 }, colliders,
	reef: { floorHeightAt: () => 30 },
}, -288, 70, 1.65);
assert.equal(floor, 1.2, 'surface reef height must not lift the player out of the cave');

const blocked = new Vector3(-260, 4.5, 70);
cave.constrainPlayer(new Vector3(-260, 4.5, 53), blocked);
assert.equal(blocked.z, 53, 'player must not leave the passage through its wall');
const atDoor = new Vector3(-220, 1.2, -10);
colliders.resolveCapsule(atDoor, 0.3, 1.75);
assert(Math.abs(atDoor.z + 10) > 0.4, 'closed door must block a player capsule');
assert.equal(cave.activateFinalDoor(), true);
cave.update(1);
assert.equal(cave.finalDoorCollider.solid, true, 'door stays shut during electronic scan');
cave.update(2.4);
assert.equal(cave.doorState, 'open');
assert.equal(cave.finalDoorCollider.solid, false, 'lifted door permits entry');
console.log(`cave system passed: ${asset.meshes.length} Blender meshes, ${layout.passages.length} passages`);
