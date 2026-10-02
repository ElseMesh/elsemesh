import assert from 'node:assert/strict';
import test from 'node:test';
import { Matrix3, Matrix4, PerspectiveCamera, Vector3 } from '../src/engine/index.js';
import { MeshRenderer } from '../src/engine/render/MeshRenderer.js';
import { GPU } from '../src/engine/gpu/GPU.js';
import { AnimatedForest } from '../src/world/vegetation/AnimatedForest.js';
import { animatedForestFixture } from './animated-forest-fixture.mjs';

function update(s, time, enabled = true, camera = s.trees[0].root.position, distant = false) {
  s.distantForest.update(time, camera, distant);
  s.animatedForest.update(enabled);
  s.group.updateMatrixWorld(true);
}
const cofactor = m => new Matrix3().getNormalMatrix(m).multiplyScalar(m.determinant());
const paletteMatrix = (a, record, joint, previous = false) => new Matrix4().fromArray(a.data,
  (record.offset + joint + (previous ? a.jointCount : 0)) * 16);
function closeVector(a, b, tolerance = 8e-5) { assert.ok(a.distanceTo(b) <= tolerance, `${a.toArray()} != ${b.toArray()}`); }

test('disabled baseline keeps original draws; real forest batches retain all triangles, UVs and state', () => {
  const s = animatedForestFixture({count:Infinity}), a = s.animatedForest;
  assert.equal(s.trees.length,77);
  assert.equal(a.enabled,false);
  assert.equal(a.stats.geometryBytes > 0,true);
  assert.equal(a.stats.paletteBytes,77*9*2*64);
  let uploads = 0, matrixUpdates = 0;
  a.buffer.write = () => uploads++;
  for (const record of a.records) for (const {mesh} of record.batches) mesh.updateMatrixWorld = () => matrixUpdates++;
  for(let i=0;i<3;i++) update(s,i,false);
  assert.equal(uploads,0); assert.equal(matrixUpdates,0); assert.equal(a.stats.jointMatrices,0);
  for(const record of a.records) {
    assert.equal(record.batches.length,2); assert.equal(record.group.visible,false);
    assert.ok(record.tree.meshes.every(mesh=>mesh.visible));
    for(const {mesh,sources} of record.batches) {
      const g=mesh.geometry;
      assert.equal(g.index.count,sources.reduce((n,{source})=>n+source.geometry.index.count,0));
      assert.equal(mesh.castShadow,true);
      assert.equal(mesh.receiveShadow,sources[0].source.receiveShadow);
      assert.equal(mesh.layers.mask,sources[0].source.layers.mask);
      assert.equal(mesh.material.uniformBlock,sources[0].source.material.uniformBlock);
      for(const {source,joint,vertexStart} of sources) {
        const uv=source.geometry.attributes.uv;
        for(let i=0;i<uv.count;i++) {
          assert.equal(g.attributes.uv.getX(vertexStart+i),uv.getX(i));
          assert.equal(g.attributes.uv.getY(vertexStart+i),uv.getY(i));
          assert.equal(g.attributes.forestJoint.getX(vertexStart+i),record.offset+joint);
        }
      }
    }
  }
});

test('wind sweep reproduces original positions and unnormalized normals with moved/scaled parents', () => {
  const s=animatedForestFixture(), a=s.animatedForest;
  s.group.position.set(11,8,-4);s.group.rotation.set(.13,.7,-.04);s.group.scale.set(1.2,.8,1.1);
  for(const time of [0,.3,3.8,17,93,201]) {
    update(s,time);
    for(const record of a.records) for(const {mesh,sources} of record.batches) for(const {source,joint,vertexStart} of sources) {
      const transformed = new Matrix4().multiplyMatrices(mesh.matrixWorld,paletteMatrix(a,record,joint));
      const sourceNormal=cofactor(source.matrixWorld), batchNormal=cofactor(transformed);
      const p=source.geometry.attributes.position,n=source.geometry.attributes.normal,g=mesh.geometry;
      for(let i=0;i<p.count;i++) {
        closeVector(new Vector3().fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld),
          new Vector3().fromBufferAttribute(g.attributes.position,vertexStart+i).applyMatrix4(transformed));
        closeVector(new Vector3().fromBufferAttribute(n,i).applyMatrix3(sourceNormal),
          new Vector3().fromBufferAttribute(g.attributes.normal,vertexStart+i).applyMatrix3(batchNormal),2e-5);
      }
    }
  }
});

test('the previous palette follows actual wind poses and resets after disable or far reactivation', () => {
  const s=animatedForestFixture({count:1}), a=s.animatedForest, record=a.records[0];
  update(s,5); const previous=new Float32Array(a.data.subarray(0,a.jointCount*16));
  const oldRoot=record.group.matrixWorld.clone();
  const oldSources=record.tree.meshes.map(mesh=>mesh.matrixWorld.clone());
  s.group.position.x+=2;s.group.rotation.y=.2;update(s,5.2);
  assert.deepEqual(a.data.subarray(a.jointCount*16),previous);
  let displacement=0;
  for(const {mesh,sources} of record.batches) for(const {source,joint,vertexStart} of sources) {
    const previousWorld=new Matrix4().multiplyMatrices(oldRoot,paletteMatrix(a,record,joint,true));
    const currentWorld=new Matrix4().multiplyMatrices(mesh.matrixWorld,paletteMatrix(a,record,joint));
    const index=record.tree.meshes.indexOf(source), g=mesh.geometry;
    for(let i=0;i<source.geometry.attributes.position.count;i+=7) {
      const prior=new Vector3().fromBufferAttribute(g.attributes.position,vertexStart+i).applyMatrix4(previousWorld);
      closeVector(prior,new Vector3().fromBufferAttribute(source.geometry.attributes.position,i).applyMatrix4(oldSources[index]));
      displacement=Math.max(displacement,prior.distanceTo(new Vector3().fromBufferAttribute(g.attributes.position,vertexStart+i).applyMatrix4(currentWorld)));
    }
  }
  assert.ok(displacement>.1,'the fixture exercises real motion, not a still-pose comparison');
  update(s,8,false);assert.ok(record.tree.meshes.every(mesh=>mesh.visible&&mesh.resetVelocity));
  update(s,21,true);assert.deepEqual(a.data.subarray(a.jointCount*16),a.data.subarray(0,a.jointCount*16));
  const far=record.tree.root.position.clone().add(new Vector3(1000,0,0));
  update(s,22,true,far,true);assert.equal(record.active,false);assert.equal(record.group.visible,false);
  assert.equal(s.distantForest.records[0].far.visible,true);
  const near=record.tree.root.getWorldPosition(new Vector3());update(s,23,true,near,true);
  assert.equal(record.active,true);assert.deepEqual(a.data.subarray(a.jointCount*16),a.data.subarray(0,a.jointCount*16));
  assert.ok(record.batches.every(({mesh})=>mesh.resetVelocity));
});

test('fixed culling boxes and spheres contain the complete wind and distance-transition envelope', () => {
  const s=animatedForestFixture({count:2}), a=s.animatedForest;
  for(let step=0;step<64;step++) {
    const origin=s.trees[0].root.position, camera=origin.clone().add(new Vector3([0,140,170,199.99][step%4],0,0));
    update(s,step*3.781,true,camera,true);
    for(const record of a.records) if(record.active) for(const {mesh,sources} of record.batches) {
      for(const {source,joint,vertexStart} of sources) {
        const matrix=paletteMatrix(a,record,joint), g=mesh.geometry;
        for(let i=0;i<source.geometry.attributes.position.count;i++) {
          const p=new Vector3().fromBufferAttribute(g.attributes.position,vertexStart+i).applyMatrix4(matrix);
          assert.equal(g.boundingBox.containsPoint(p),true);
          assert.ok(p.distanceTo(g.boundingSphere.center)<=g.boundingSphere.radius);
        }
      }
    }
  }
});

test('each near/far/toggle transition draws exactly one base representation and preserves wildlife anchors', () => {
  const s=animatedForestFixture({count:2,wildlife:true}), a=s.animatedForest, record=a.records[0];
  const camera=record.tree.root.position.clone(), mr=new MeshRenderer(), cam=new PerspectiveCamera(70,1,.1,1000);
  const base=new Set(record.tree.meshes), batch=new Set(record.batches.map(b=>b.mesh)), far=new Set(s.distantForest.records[0].far.children);
  for(const [enabled,distance] of [[false,0],[true,0],[true,140],[true,170],[true,199.99],[true,200],[true,220],[false,220],[true,0],[false,0]]) {
    camera.copy(record.tree.root.position);camera.x+=distance;update(s,31,enabled,camera,true);
    s.wildlife.update(0,camera);
    const items=mr.collect(s.group,{camera:cam,cull:false}).opaque;
    const sourceCount=items.filter(it=>base.has(it.object)).length, batchCount=items.filter(it=>batch.has(it.object)).length, farCount=items.filter(it=>far.has(it.object)).length;
    assert.equal(Number(sourceCount>0)+Number(batchCount>0)+Number(farCount>0),1);
    if(distance<200) assert.equal(sourceCount+batchCount,enabled?2:19);
    else assert.equal(farCount,2);
  }
  update(s,45,true,camera,false);s.wildlife.update(0,camera);
  const anchors=s.wildlife.habitats.map(h=>h.anchor.getWorldPosition(new Vector3()));
  update(s,45,false,camera,false);s.wildlife.update(0,camera);
  s.wildlife.habitats.forEach((h,i)=>closeVector(h.anchor.getWorldPosition(new Vector3()),anchors[i],1e-9));
  assert.ok(s.wildlife.habitats.some(h=>h.anchor.visible));
});

test('unsupported source callbacks or animated local geometry fail instead of silently changing behavior',()=>{
  const s=animatedForestFixture({count:1});
  s.trees[0].meshes[0].onBeforeRender=()=>{};
  assert.throws(()=>new AnimatedForest(s.trees,s.group),/callback-free/);
});

test('long frustum culling keeps finite bounded poses; reentry resumes consecutive-frame motion and far resets',()=>{
  const s=animatedForestFixture({count:1}),a=s.animatedForest,record=a.records[0],mr=new MeshRenderer();
  const camera=new PerspectiveCamera(50,1,.1,1000),origin=record.tree.root.position.clone();
  const batchSet=new Set(record.batches.map(({mesh})=>mesh)), savedFrame=GPU.frame;
  mr.drawData=new Float32Array(mr.capacity*64);
  const draw=()=>{mr.drawCount=0;for(const mesh of record.tree.meshes)mr._slot(mesh);for(const {mesh} of record.batches)mr._slot(mesh);};
  const selected=()=>mr.collect(s.group,{camera}).opaque.filter(({object})=>batchSet.has(object));
  const historyError=()=>{
    let max=0;
    for(const {mesh,sources} of record.batches)for(const {source,joint,vertexStart} of sources){
      const oldBatch=new Matrix4().multiplyMatrices(new Matrix4().fromArray(mesh.__draw.prev),paletteMatrix(a,record,joint,true));
      const oldSource=new Matrix4().fromArray(source.__draw.prev);
      for(let i=0;i<source.geometry.attributes.position.count;i+=11){
        const p=new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertexStart+i).applyMatrix4(oldBatch);
        const q=new Vector3().fromBufferAttribute(source.geometry.attributes.position,i).applyMatrix4(oldSource);
        assert.ok(p.toArray().every(Number.isFinite));max=Math.max(max,p.distanceTo(q));
      }
    }
    return max;
  };
  try {
    GPU.frame++;update(s,4);draw();
    camera.position.copy(origin).add(new Vector3(14,8,18));
    camera.lookAt(camera.position.clone().add(new Vector3(14,0,18)));
    for(let i=1;i<=120;i++){
      GPU.frame++;s.group.position.x=i*.01;update(s,4+i/20);
      assert.equal(selected().length,0);
      assert.ok(a.data.every(Number.isFinite));
    }
    const target=record.tree.root.getWorldPosition(new Vector3());target.y+=4;
    camera.lookAt(target);assert.equal(selected().length,2);draw();
    // Known contract difference: palette history follows updates; baseline
    // object history follows draws. A long culling gap is NOT exact velocity
    // equivalence, though current geometry/bounds and finite motion are intact.
    assert.ok(historyError()>1e-3,'fixture exercises the documented culling-gap history difference');
    for(const {mesh,sources} of record.batches)for(const {source,joint,vertexStart} of sources){
      const current=paletteMatrix(a,record,joint);
      for(let i=0;i<source.geometry.attributes.position.count;i+=7){
        const p=new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertexStart+i).applyMatrix4(current);
        assert.ok(mesh.geometry.boundingBox.containsPoint(p));
        assert.ok(p.distanceTo(mesh.geometry.boundingSphere.center)<=mesh.geometry.boundingSphere.radius);
      }
    }
    GPU.frame++;s.group.position.x+=.01;update(s,10.05);draw();
    assert.ok(historyError()<8e-5,'after one visible frame previous motion matches again');
    const far=target.clone().add(new Vector3(1000,0,0));GPU.frame++;update(s,11,true,far,true);
    GPU.frame++;update(s,12,true,target,true);draw();
    assert.deepEqual(a.data.subarray(a.jointCount*16),a.data.subarray(0,a.jointCount*16));
    for(const {mesh} of record.batches)assert.deepEqual(mesh.__draw.prev,mesh.__draw.cur);
  } finally {GPU.frame=savedFrame;}
});
