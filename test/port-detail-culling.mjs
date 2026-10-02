import test from 'node:test';
import assert from 'node:assert/strict';
import {partitionPortDetails} from '../src/world/PortDetailBatches.js';
import {BoxGeometry,InstancedMesh,Matrix4,Vector3,Quaternion,Frustum} from '../src/engine/index.js';

test('spatial batches preserve every detail once and never mix materials',()=>{
  const a={},b={},items=[{x:-1,z:0},{x:1,z:0},{x:129,z:129}];
  const chunks=partitionPortDetails(new Map([[a,items],[b,[items[0]]]]));
  assert.equal(chunks.length,4);
  assert.deepEqual(chunks.filter(c=>c.surface===a).flatMap(c=>c.items),items);
  assert.equal(chunks.filter(c=>c.surface===b).flatMap(c=>c.items).length,1);
  assert.throws(()=>partitionPortDetails(new Map(),0));
});

test('static instance bounds enclose rotated oversized objects across cell edges',()=>{
  const mesh=new InstancedMesh(new BoxGeometry(1,1,1),null,2),m=new Matrix4();
  const transforms=[{p:new Vector3(63,4,63),s:new Vector3(150,8,3),q:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.7)},
    {p:new Vector3(2,1,2),s:new Vector3(2,2,2),q:new Quaternion()}];
  transforms.forEach((t,i)=>mesh.setMatrixAt(i,m.compose(t.p,t.q,t.s)));
  mesh.computeBoundingBox();mesh.computeBoundingSphere();
  for(let i=0;i<2;i++){
    mesh.getMatrixAt(i,m);
    for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
      const p=new Vector3(x,y,z).applyMatrix4(m);
      assert.ok(mesh.boundingBox.containsPoint(p));
      assert.ok(p.distanceTo(mesh.boundingSphere.center)<=mesh.boundingSphere.radius+1e-5);
    }
  }
});

test('camera frustum rejects an offscreen detail cell while retaining a visible one',()=>{
  const frustum=new Frustum().setFromProjectionMatrix(new Matrix4(),false);
  const mesh=new InstancedMesh(new BoxGeometry(.1,.1,.1),null,1),m=new Matrix4();
  mesh.setMatrixAt(0,m.makeTranslation(0,0,0));mesh.computeBoundingSphere();
  assert.equal(frustum.intersectsSphere(mesh.boundingSphere),true);
  mesh.setMatrixAt(0,m.makeTranslation(100,0,0));mesh.computeBoundingSphere();
  assert.equal(frustum.intersectsSphere(mesh.boundingSphere),false);
});
