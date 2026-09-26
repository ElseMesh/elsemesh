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
for (const name of ['UN_Boat_Cavern', 'UN_Sheltered_Landing', 'UN_Four_Way_Junction', 'UN_Underneath_Hall', 'UN_Closed_Door']) {
	assert(names.has(name), `missing Blender export ${name}`);
}
assert(layout.passages.length >= 3);
const realTerrain = new TerrainData();
assert(realTerrain.heightAt(-355, 80) <= -3, 'approach channel needs boat draft');
assert(realTerrain.heightAt(-345, 80) <= -3, 'channel must meet the cave mouth');

const colliders = new Colliders();
const cave = new CaveSystem(layout, { heightAt: () => 30 }, colliders);
cave.addCollision();
assert.equal(cave.boatGroundAt(-335, 80), -2.8);
assert.equal(cave.boatGroundAt(-335, 110), 30);
assert.equal(cave.groundHeightAt(-288, 70, 2), 1.2);
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
console.log(`cave system passed: ${asset.meshes.length} Blender meshes, ${layout.passages.length} passages`);
