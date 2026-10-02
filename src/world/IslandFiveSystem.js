import { Group } from '../engine/index.js';
import { ISLAND_FIVE, islandFiveHeight, islandFiveForestContains } from './IslandFiveLayout.js';

const TREE_COUNT = 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function islandFiveTreeSeed(index) {
  const angle = index * GOLDEN_ANGLE;
  const radius = 3 + Math.sqrt((index + 0.5) / TREE_COUNT) * 75;
  return {
    x: ISLAND_FIVE.center.x + Math.cos(angle) * radius,
    z: ISLAND_FIVE.center.z + Math.sin(angle) * radius * 0.84,
    scale: 0.82 + ((index * 37) % 29) / 100,
    rotation: (index * 1.61803398875) % (Math.PI * 2)
  };
}

export function createIslandFiveForestData() {
  const trees = [];
  for (let index = 0; index < TREE_COUNT; index++) {
    const seed = islandFiveTreeSeed(index);
    if (!islandFiveForestContains(seed.x, seed.z)) continue;
    const y = islandFiveHeight(seed.x, seed.z);
    trees.push(Object.freeze({
      index, x: seed.x, y, z: seed.z, scale: seed.scale, rotation: seed.rotation,
      trunkRadius: 0.34 * seed.scale, trunkHeight: 5.8 * seed.scale,
      collision: Object.freeze({ type: 'cylinder', radius: 0.42 * seed.scale, yMin: y, yMax: y + 5.8 * seed.scale, tag: 'island-five-tree' })
    }));
  }
  return Object.freeze(trees);
}

// Agent Control: adapt the bounded forest recipe to the exact record contract used by the
// established Vegetation canopy. Island Five therefore shares its leaf atlas, wind shader,
// near geometry and distant crown impostors instead of maintaining a second visual system.
export function createIslandFiveCanopyRecords() {
  return createIslandFiveForestData().map((tree) => {
    const sy = 0.86 + ((tree.index * 17) % 23) / 100;
    const s = 0.78 + ((tree.index * 37) % 31) / 100;
    return Object.freeze({
      x: tree.x, y: tree.y - 0.12, z: tree.z, s, sy,
      yaw: tree.rotation, la: tree.rotation, l: sy,
      H: 12.5 * s * sy, seed: ((tree.index * 73) % 997) / 997
    });
  });
}

export class IslandFiveSystem {
  constructor(app, options = {}) {
    this.app = app;
    this.group = new Group();
    this.group.name = 'Island Five — forest only';
    this.trees = createIslandFiveForestData();
    this.build();
  }

  build() {
    for (const tree of this.trees) {
      // Agent Control: Vegetation renders the complete mapped trunk, grown limbs and
      // crown from this same record. Do not add a second bare cylinder here: it can
      // protrude through a swaying or LOD crown and read as a freestanding pole.
      this.app?.colliders?.addCylinder(tree.x, tree.z, tree.collision.radius, tree.collision.yMin, tree.collision.yMax, tree.collision);
    }
    this.app?.scene?.add(this.group);
    return this.group;
  }

  heightAt(x, z) { return islandFiveHeight(x, z); }

  update() {}
}

export const ISLAND_FIVE_FOREST_TREE_COUNT = TREE_COUNT;
