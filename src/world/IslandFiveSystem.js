import { CylinderGeometry, SphereGeometry, Group, Mesh } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { createTreeBarkMaterial } from './vegetation/ScannedBark.js';
import { ISLAND_FIVE, islandFiveHeight, islandFiveForestContains } from './IslandFiveLayout.js';

const TREE_COUNT = 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const canopyMaterial = standard({ name: 'Island Five forest canopy', color: 0x2d6337, roughness: 0.95 });
canopyMaterial.underwaterLighting = 'none';
canopyMaterial.localLightsCheap = true;
const add = (parent, geometry, material, x = 0, y = 0, z = 0) => {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
};

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

export class IslandFiveSystem {
  constructor(app, options = {}) {
    this.app = app;
    this.group = new Group();
    this.group.name = 'Island Five — forest only';
    this.trees = createIslandFiveForestData();
    this.trunkGeometry = new CylinderGeometry(0.34, 0.46, 5.8, 8);
    this.canopyGeometry = new SphereGeometry(2.1, 10, 8);
    this.trunkMaterial = options.trunkMaterial || createTreeBarkMaterial();
    this.canopyMaterial = options.canopyMaterial || canopyMaterial;
    this.build();
  }

  build() {
    for (const tree of this.trees) {
      const root = new Group();
      root.name = 'Island Five tree';
      root.position.set(tree.x, tree.y, tree.z);
      root.rotation.y = tree.rotation;
      root.scale.setScalar(tree.scale);
      add(root, this.trunkGeometry, this.trunkMaterial, 0, 2.9, 0);
      add(root, this.canopyGeometry, this.canopyMaterial, 0, 6.0, 0);
      this.group.add(root);
      this.app?.colliders?.addCylinder(tree.x, tree.z, tree.collision.radius, tree.collision.yMin, tree.collision.yMax, tree.collision);
    }
    this.app?.scene?.add(this.group);
    return this.group;
  }

  heightAt(x, z) { return islandFiveHeight(x, z); }

  update() {}
}

export const ISLAND_FIVE_FOREST_TREE_COUNT = TREE_COUNT;
