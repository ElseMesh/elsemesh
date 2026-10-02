import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshRenderer } from '../src/engine/render/MeshRenderer.js';
import { GPU } from '../src/engine/gpu/GPU.js';
import { Material } from '../src/engine/render/Material.js';
import { Scene, Group, Mesh, BoxGeometry, PerspectiveCamera } from '../src/engine/index.js';

function fixture() {
  const renderer = new MeshRenderer(), scene = new Scene(), parent = new Group();
  parent.position.set(2, 0, -5);
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new Material());
  mesh.position.x = 1; mesh.castShadow = true; parent.add(mesh); scene.add(parent);
  const camera = new PerspectiveCamera(70, 1, .1, 100);
  let updates = 0;
  const original = scene.updateMatrixWorld;
  scene.updateMatrixWorld = function(...args) { updates++; return original.apply(this, args); };
  return {renderer, scene, parent, mesh, camera, updates:()=>updates};
}

test('stable main-scene passes share transforms only inside an enabled scope', () => {
  const f = fixture(), {renderer, scene, mesh, camera} = f;
  assert.equal(renderer.optimizeSceneTransforms, true, 'measured optimisation is enabled by default');
  renderer.optimizeSceneTransforms = false;
  const collect = () => renderer.collect(scene, {camera, cull:false});
  renderer.withSceneTransforms(scene, () => { collect(); collect(); });
  assert.equal(f.updates(), 2, 'baseline still updates before every pass');
  renderer.optimizeSceneTransforms = true;
  renderer.withSceneTransforms(scene, () => {
    for (const kind of ['depth','depth','main','color','main']) {
      const list = renderer.collect(scene, {camera, kind, cull:false});
      assert.equal(list.opaque[0].object, mesh);
      assert.equal(mesh.matrixWorld.elements[12], 3);
      assert.equal(mesh.matrixWorld.elements[14], -5);
    }
  });
  assert.equal(f.updates(), 3, 'five passes do one hierarchy update');
  f.parent.position.x = 7;
  collect();
  assert.equal(f.updates(), 4, 'a later render outside the scope refreshes transforms');
  assert.equal(mesh.matrixWorld.elements[12], 8);
});

test('camera culling, filters and callbacks are evaluated for each scoped pass', () => {
  const f = fixture(), {renderer, scene, mesh, camera} = f;
  renderer.optimizeSceneTransforms = true;
  const callbacks = [];
  mesh.onBeforeRender = (_renderer, _scene, passedCamera) => callbacks.push(passedCamera.position.x);
  renderer.withSceneTransforms(scene, () => {
    assert.equal(renderer.collect(scene, {camera}).opaque.length, 1);
    camera.position.x = 50;
    assert.equal(renderer.collect(scene, {camera}).opaque.length, 0, 'new camera position changes culling');
    camera.position.x = 0;
    assert.equal(renderer.collect(scene, {camera, filter:()=>false}).opaque.length, 0);
    assert.equal(renderer.collect(scene, {camera}).opaque.length, 1);
    mesh.visible = false;
    assert.equal(renderer.collect(scene, {camera}).opaque.length, 0, 'visibility is not cached');
  });
  assert.deepEqual(callbacks, [0,0]);
  assert.equal(f.updates(), 1);
});

test('late transform invalidation, auxiliary scenes and precompile retain fresh updates', () => {
  const f = fixture(), other = fixture(), {renderer, scene, mesh, camera} = f;
  renderer.optimizeSceneTransforms = true;
  renderer.withSceneTransforms(scene, () => {
    renderer.collect(scene, {camera, cull:false});
    f.parent.position.x = 9;
    renderer.invalidateSceneTransforms(scene);
    renderer.collect(scene, {camera, cull:false});
    assert.equal(mesh.matrixWorld.elements[12], 10);
    renderer.collect(other.scene, {camera, cull:false});
    other.parent.position.x = 12;
    renderer.collect(other.scene, {camera, cull:false});
    assert.equal(other.mesh.matrixWorld.elements[12], 13, 'portrait/auxiliary scene remains independent');
    renderer.precompiling = true;
    renderer.collect(scene, {camera, cull:false});
    renderer.collect(scene, {camera, cull:false});
    renderer.precompiling = false;
  });
  assert.equal(f.updates(), 4);
  assert.equal(other.updates(), 2);
});

test('scope is cleared after errors and cannot reuse matrices across GPU frames', () => {
  const f = fixture(), {renderer, scene, camera} = f;
  renderer.optimizeSceneTransforms = true;
  const frame = GPU.frame;
  try {
    assert.throws(() => renderer.withSceneTransforms(scene, () => {
      renderer.collect(scene, {camera, cull:false});
      GPU.frame++;
      f.parent.position.x = 18;
      renderer.collect(scene, {camera, cull:false});
      assert.equal(f.mesh.matrixWorld.elements[12], 19);
      throw Error('render failed');
    }), /render failed/);
    f.parent.position.x = 22;
    renderer.collect(scene, {camera, cull:false});
    assert.equal(f.mesh.matrixWorld.elements[12], 23);
    assert.equal(f.updates(), 3);
  } finally { GPU.frame = frame; }
});
