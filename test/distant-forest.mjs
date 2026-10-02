import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Matrix3, Vector3 } from '../src/engine/index.js';
import { standard } from '../src/materials/Materials.js';
import { FourthIslandSystem } from '../src/world/FourthIslandSystem.js';
import { fourthIslandHeight } from '../src/world/FourthIslandLayout.js';
import { TreeWildlife } from '../src/world/TreeWildlife.js';
import { DistantForest, forestWindWeight } from '../src/world/vegetation/DistantForest.js';

function forest(withWildlife = false) {
  const system = Object.create(FourthIslandSystem.prototype);
  system.app = { terrainData: { heightAt: fourthIslandHeight }, colliders: { addCylinder() {} } };
  system.group = new Group(); system.bark = standard({ color: 0x655544 });
  system.buildForest();
  if (withWildlife) system.wildlife = new TreeWildlife(system.group, system.trees, system.bark);
  system.distantForest = new DistantForest(system.trees, system.group);
  return system;
}
function pose(tree) { return tree.joints.flatMap(joint => [joint.rotation.x, joint.rotation.z]); }
function close(a, b, tolerance = 2e-5) { assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`); }

test('real forest batches retain every original triangle, material, UV, normal and world position', () => {
  const system = forest();
  assert.ok(system.trees.length > 50);
  for (const { tree, far } of system.distantForest.records) {
    assert.equal(tree.meshes.length, 19);
    assert.equal(far.children.length, 2);
    far.updateWorldMatrix(true, true);
    for (const batch of far.children) {
      const sources = tree.meshes.filter(mesh => mesh.material === batch.material);
      assert.equal(batch.geometry.index.count, sources.reduce((n, mesh) => n + mesh.geometry.index.count, 0));
      assert.equal(batch.castShadow, true);
      assert.equal(batch.layers.mask, sources[0].layers.mask);
      assert.equal(batch.receiveShadow, sources[0].receiveShadow);
      let offset = 0;
      for (const source of sources) {
        const positions = source.geometry.attributes.position, normals = source.geometry.attributes.normal;
        const uv = source.geometry.attributes.uv;
        const sourceNormal = new Matrix3().getNormalMatrix(source.matrixWorld);
        const batchNormal = new Matrix3().getNormalMatrix(batch.matrixWorld);
        for (let i = 0; i < positions.count; i++) {
          const p = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(source.matrixWorld);
          const q = new Vector3().fromBufferAttribute(batch.geometry.attributes.position, offset + i).applyMatrix4(batch.matrixWorld);
          assert.ok(p.distanceTo(q) < 2e-5);
          const a = new Vector3().fromBufferAttribute(normals, i).applyNormalMatrix(sourceNormal);
          const b = new Vector3().fromBufferAttribute(batch.geometry.attributes.normal, offset + i).applyNormalMatrix(batchNormal);
          assert.ok(a.distanceTo(b) < 2e-5);
          close(uv.getX(i), batch.geometry.attributes.uv.getX(offset + i), 0);
          close(uv.getY(i), batch.geometry.attributes.uv.getY(offset + i), 0);
        }
        offset += positions.count;
      }
    }
  }
});

test('near animation is identical; distant trees skip joints and resume the current phase on approach', () => {
  const system = forest(), tree = system.trees[0], lod = system.distantForest;
  const camera = tree.root.position.clone();
  lod.update(11, camera, false); const baseline = pose(tree);
  lod.update(11, camera, true); assert.deepEqual(pose(tree), baseline);
  camera.x += 1000;
  lod.update(12, camera, true);
  assert.equal(lod.stats.farTrees, system.trees.length);
  lod.update(12, camera, true);
  assert.equal(lod.stats.jointUpdates, 0);
  assert.ok(pose(tree).every(value => value === 0));
  assert.equal(tree.root.visible, false);
  assert.equal(lod.records[0].far.visible, true);
  let matrixUpdates = 0;
  const joint = tree.joints[1], original = joint.updateMatrix;
  joint.updateMatrix = function () { matrixUpdates++; return original.call(this); };
  for (let i = 0; i < 10; i++) { lod.update(13 + i, camera, true); system.group.updateMatrixWorld(true); }
  assert.equal(matrixUpdates, 0, 'settled distant detail does not traverse/recompose every frame');
  camera.copy(tree.root.position);
  lod.update(90, camera, true); const resumed = pose(tree);
  lod.update(90, camera, false); assert.deepEqual(resumed, pose(tree));
  assert.equal(tree.root.visible, true); assert.equal(lod.records[0].far.visible, false);
  assert.ok(tree.meshes.every(mesh => mesh.resetVelocity), 'reactivated detail discards stale motion history');
  system.group.updateMatrixWorld(true); assert.ok(matrixUpdates > 0);
});

test('camera crossings at both thresholds are continuous and never double-render or drop a tree', () => {
  const system = forest(), tree = system.trees[0], lod = system.distantForest;
  const camera = tree.root.position.clone(), origin = camera.x;
  for (const boundary of [140, 200]) {
    camera.x = origin + boundary - .001; lod.update(31, camera, true); const before = pose(tree);
    camera.x = origin + boundary + .001; lod.update(31, camera, true); const after = pose(tree);
    before.forEach((value, i) => close(value, after[i], 1e-7));
    assert.notEqual(tree.root.visible, lod.records[0].far.visible);
  }
  for (const distance of [201, 200, 199.999, 199.5, 170, 140.001, 140, 100, 1000]) {
    camera.x = origin + distance; lod.update(32, camera, true);
    assert.notEqual(tree.root.visible, lod.records[0].far.visible);
  }
  lod.update(33, camera, false);
  assert.ok(lod.records.every(({ tree, far }) => tree.root.visible && !tree.root.frozenForestPose && !far.visible));
  assert.equal(forestWindWeight(120), 1, 'wildlife range retains full motion');
});

test('wildlife world anchors survive far freezing and recover original attachments and motion nearby', () => {
  const system = forest(true), lod = system.distantForest, wildlife = system.wildlife;
  const habitat = wildlife.habitats[0], camera = habitat.tree.root.position.clone();
  camera.x += 1000;
  lod.update(10, camera, true); wildlife.update(1 / 60, camera);
  assert.ok(wildlife.habitats.every(h => !h.anchor.visible));
  assert.ok(wildlife.habitats.every(h => h.position.distanceTo(h.tree.root.position) < 20));
  camera.copy(habitat.tree.root.position);
  lod.update(11, camera, true); wildlife.update(1 / 60, camera);
  assert.equal(habitat.anchor.visible, true);
  const optimizedPosition = habitat.anchor.getWorldPosition(new Vector3());
  lod.update(11, camera, false);
  const baselinePosition = habitat.anchor.getWorldPosition(new Vector3());
  assert.ok(optimizedPosition.distanceTo(baselinePosition) < 1e-9);
  assert.ok(wildlife.batches.some(batch => batch.count > 0));
});

test('disabled batches skip matrix work; translated parents retain world distance and representation alignment', () => {
  const system = forest(), lod = system.distantForest, tree = system.trees[0], far = lod.records[0].far;
  let updates = 0;
  const child = far.children[0], original = child.updateMatrixWorld;
  child.updateMatrixWorld = function (force) { updates++; return original.call(this, force); };
  system.group.updateMatrixWorld(true);
  assert.equal(updates, 0, 'disabled baseline does not walk hidden batch children');
  system.group.position.set(300, 25, -170);
  system.group.rotation.y = .7;
  system.group.updateWorldMatrix(true, false);
  const world = tree.root.position.clone().applyMatrix4(system.group.matrixWorld), camera = world.clone();
  lod.update(12, camera, true);
  assert.equal(tree.root.visible, true);
  assert.equal(lod.records[0].active, false);
  camera.x += 1000;
  lod.update(13, camera, true); system.group.updateMatrixWorld(true);
  assert.equal(far.visible, true); assert.ok(updates > 0);
  assert.ok(far.getWorldPosition(new Vector3()).distanceTo(world) < 1e-9);
  system.group.position.x += 80;
  system.group.updateMatrixWorld(true);
  assert.ok(far.getWorldPosition(new Vector3()).distanceTo(world.add(new Vector3(80, 0, 0))) < 1e-9);
});
