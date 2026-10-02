import { Group, Matrix4, Mesh, Object3D, Vector3, mergeGeometries } from '../../engine/index.js';

// Wildlife remains fully animated out to 120m. Leave a margin for branches,
// then continuously settle the wind pose before changing representation.
export const FOREST_FULL_ANIMATION_DISTANCE = 140;
export const FOREST_BATCH_DISTANCE = 200;
export const FOREST_WIND_X_AMPLITUDE = .016;
export const FOREST_WIND_Z_AMPLITUDE = .026;

export function forestWindWeight(distance) {
  const t = Math.max(0, Math.min(1, (distance - FOREST_FULL_ANIMATION_DISTANCE) /
    (FOREST_BATCH_DISTANCE - FOREST_FULL_ANIMATION_DISTANCE)));
  return 1 - t * t * (3 - 2 * t);
}

export class ForestTreeRoot extends Group {
  constructor() { super(); this.frozenForestPose = false; }
  updateMatrixWorld(force) {
    // The detailed subtree remains attached for wildlife's world-position
    // queries, but its already-correct rest matrices need no scene-wide walk.
    if (!this.frozenForestPose) super.updateMatrixWorld(force);
  }
}

class ForestBatchRoot extends Group {
  updateMatrixWorld(force) {
    // Dormant batches add no transform walk to the disabled baseline. Visible
    // batches still follow the scene/forest parent, including parent movement.
    if (this.visible) super.updateMatrixWorld(force);
  }
}

function setWind(tree, index, time, weight) {
  for (let j = 0; j < tree.joints.length; j++) {
    const joint = tree.joints[j], flex = j / (tree.joints.length - 1);
    joint.rotation.z = weight * flex * Math.sin(time * .9 + index * .37 - j * .15) * FOREST_WIND_Z_AMPLITUDE;
    joint.rotation.x = weight * flex * Math.cos(time * .7 + index * .29) * FOREST_WIND_X_AMPLITUDE;
  }
}

// Exact rest geometry, UVs and normals, grouped only within a single tree.
// Keeping tree-sized bounds avoids a forest-sized culling/overdraw penalty.
// `meshes` is captured before wildlife attaches its independently culled limbs.
export function createFarTree(tree) {
  const group = new ForestBatchRoot();
  group.name = 'Distant forest tree material batches';
  group.position.copy(tree.root.position);
  group.quaternion.copy(tree.root.quaternion);
  group.scale.copy(tree.root.scale);
  group.visible = false;
  tree.root.updateWorldMatrix(true, true);
  const inverse = tree.root.matrixWorld.clone().invert(), transform = new Matrix4();
  const batches = new Map();
  for (const mesh of tree.meshes) {
    // Only the forest's opaque, single-material, callback-free meshes enter
    // these batches. Reject unsupported changes instead of losing behavior.
    if (Array.isArray(mesh.material) || mesh.material.transparent ||
      mesh.onBeforeRender !== Object3D.prototype.onBeforeRender || mesh.isInstancedMesh ||
      mesh.geometry.drawRange.start !== 0 || mesh.geometry.drawRange.count !== Infinity || !mesh.visible) {
      throw new Error('Distant forest batching requires static opaque tree meshes');
    }
    let materialBatches = batches.get(mesh.material);
    if (!materialBatches) batches.set(mesh.material, materialBatches = new Map());
    const key = `${mesh.castShadow}:${mesh.receiveShadow}:${mesh.layers.mask}:${mesh.renderOrder}`;
    let batch = materialBatches.get(key);
    if (!batch) materialBatches.set(key, batch = { source: mesh, geometries: [] });
    transform.multiplyMatrices(inverse, mesh.matrixWorld);
    batch.geometries.push(mesh.geometry.clone().applyMatrix4(transform));
  }
  for (const materialBatches of batches.values()) for (const batch of materialBatches.values()) {
    const geometry = mergeGeometries(batch.geometries);
    if (!geometry) throw new Error('Distant forest geometry attributes do not match');
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, batch.source.material);
    mesh.castShadow = batch.source.castShadow;
    mesh.receiveShadow = batch.source.receiveShadow;
    mesh.layers.mask = batch.source.layers.mask;
    mesh.renderOrder = batch.source.renderOrder;
    mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
    group.add(mesh);
    for (const part of batch.geometries) part.dispose();
  }
  group.updateMatrix(); group.matrixAutoUpdate = false;
  return group;
}

export class DistantForest {
  constructor(trees, parent) {
    this.parent = parent;
    this.worldPosition = new Vector3();
    this.records = trees.map(tree => {
      const far = createFarTree(tree); parent.add(far);
      return { tree, far, active: false };
    });
    this.stats = { detailedTrees: 0, transitionTrees: 0, farTrees: 0, jointUpdates: 0 };
  }
  update(time, camera, enabled) {
    const stats = this.stats;
    if (enabled) this.parent.updateWorldMatrix(true, false);
    stats.detailedTrees = stats.transitionTrees = stats.farTrees = stats.jointUpdates = 0;
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i], { tree, far } = record;
      const distance = enabled ? this.worldPosition.copy(tree.root.position)
        .applyMatrix4(this.parent.matrixWorld).distanceTo(camera) : 0;
      const weight = enabled ? forestWindWeight(distance) : 1;
      if (weight === 0) {
        stats.farTrees++;
        if (!record.active) {
          setWind(tree, i, time, 0);
          stats.jointUpdates += tree.joints.length;
          // Cache the exact same rest pose used by the material batches.
          tree.root.updateWorldMatrix(true, true);
          tree.root.frozenForestPose = true;
          far.updateWorldMatrix(true, true);
          for (const mesh of far.children) mesh.resetVelocity = true;
          tree.root.visible = false; far.visible = true; record.active = true;
        }
        continue;
      }
      if (record.active) {
        tree.root.frozenForestPose = false;
        // Returning detail must not report velocity from its last draw, which
        // may have been seconds ago (or before a camera teleport).
        tree.root.traverse(node => { if (node.isMesh) node.resetVelocity = true; });
        tree.root.visible = true; far.visible = false; record.active = false;
      }
      setWind(tree, i, time, weight);
      stats.jointUpdates += tree.joints.length;
      if (weight === 1) stats.detailedTrees++; else stats.transitionTrees++;
    }
  }
}
