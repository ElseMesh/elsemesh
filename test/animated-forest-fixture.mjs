import { Group } from '../src/engine/index.js';
import { Material } from '../src/engine/render/Material.js';
import { standard } from '../src/materials/Materials.js';
import { FourthIslandSystem } from '../src/world/FourthIslandSystem.js';
import { fourthIslandHeight } from '../src/world/FourthIslandLayout.js';
import { TreeWildlife } from '../src/world/TreeWildlife.js';
import { DistantForest } from '../src/world/vegetation/DistantForest.js';
import { AnimatedForest } from '../src/world/vegetation/AnimatedForest.js';

export function animatedForestFixture({ count = 3, wildlife = false, diagnosticMaterials = false } = {}) {
  const system = Object.create(FourthIslandSystem.prototype);
  system.app = { terrainData: { heightAt: fourthIslandHeight }, colliders: { addCylinder() {} } };
  system.group = new Group(); system.bark = standard({ color: 0x655544 });
  system.buildForest();
  system.trees = system.trees.slice(0, count);
  const parent = new Group();
  for (const tree of system.trees) parent.add(tree.root);
  system.group = parent;
  if (diagnosticMaterials) {
    const materials = new Map();
    for (const tree of system.trees) for (const mesh of tree.meshes) {
      let material = materials.get(mesh.material);
      if (!material) {
        material = new Material({ name: 'forest normal/UV diagnostic', lit: false, side: mesh.material.side,
          surface: 's.albedo = (normalize(in.N) * 0.35 + vec3f(0.5)) * (0.8 + in.uv.y * 0.2);' });
        materials.set(mesh.material, material);
      }
      mesh.material = material;
    }
  }
  if (wildlife) system.wildlife = new TreeWildlife(parent, system.trees, system.bark);
  system.distantForest = new DistantForest(system.trees, parent);
  system.animatedForest = new AnimatedForest(system.trees, parent);
  return system;
}
