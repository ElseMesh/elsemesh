import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SkinBounds} from '../src/engine/render/SkinBounds.js';
import {SkinnedModel} from '../src/engine/render/Skinning.js';
import {StorageBuffer} from '../src/engine/gpu/Texture.js';
import {parseGLB} from '../src/engine/loaders/GLTF.js';
import {Matrix4,Vector3,Frustum} from '../src/engine/math/index.js';

test('invalid skin weights fail open instead of falsely hiding geometry',()=>{
  for(const w of [[-1,2,0,0],[.2,.2,0,0],[NaN,1,0,0]]){
    const b=new SkinBounds([0,0,0],[0,0,0,0],w,1);
    assert.equal(b.update(new Matrix4().elements),false);assert.equal(b.sphere.radius,Infinity);
  }
});
test('animated bounds are evaluated separately for each pass camera',()=>{
  const b=new SkinBounds([0,0,.5],[0,0,0,0],[1,0,0,0],1);
  b.update(new Matrix4().makeTranslation(20,0,0).elements);
  const main=new Frustum().setFromProjectionMatrix(new Matrix4(),false);
  const shadow=new Frustum().setFromProjectionMatrix(new Matrix4().makeTranslation(-20,0,0),false);
  assert.equal(main.intersectsSphere(b.sphere),false);
  assert.equal(shadow.intersectsSphere(b.sphere),true);
});
test('public player vertices remain inside animated bounds across walking and additive poses (CPU math)',t=>{
  // No GPU execution is claimed by this unit test.
  t.mock.method(StorageBuffer.prototype,'write',()=>{});
  const bytes=readFileSync(new URL('../public/models/characters/stock-player.glb',import.meta.url));
  const g=parseGLB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const model=new SkinnedModel(g),node=g.nodes.find(n=>n.mesh!==undefined && n.skin!==undefined);
  model.meshes=g.meshes[node.mesh].map(p=>{
    const a=p.attributes,w=Float32Array.from(a.WEIGHTS_0.array);
    for(let i=0;i<w.length;i+=4){const sum=w[i]+w[i+1]+w[i+2]+w[i+3];for(let k=0;k<4;k++)w[i+k]/=sum;}
    return {geometry:{attributes:{position:{array:a.POSITION.array},skinIndex:{array:a.JOINTS_0.array},skinWeight:{array:w}}}};
  });
  model.enableAnimatedBounds();
  const clip=model.clipNames().find(n=>/walk/i.test(n));
  assert.ok(clip && model.clipDuration(clip)>0,'included character has a walk animation');
  model.play(clip,{fade:.001});
  const spine=g.nodes.findIndex(n=>n.name==='Bip01 Spine2');
  assert.ok(spine>=0,'additive pose exercises the included torso joint');
  model.poseModifier=local=>{const q=local[spine].r;q[1]+=.17;const n=Math.hypot(...q);for(let k=0;k<4;k++)q[k]/=n;};
  const vertices=model.meshes.reduce((count,mesh)=>count+mesh.geometry.attributes.position.array.length/3,0);
  assert.ok(vertices>1000,'test uses the actual detailed player mesh');
  const point=new Vector3();let checked=0;
  for(let frame=0;frame<20;frame++){
    model.update(model.clipDuration(clip)/19);
    for(const mesh of model.meshes){
      assert.equal(mesh.frustumCulled,true);
      const a=mesh.geometry.attributes,P=a.position.array,I=a.skinIndex.array,W=a.skinWeight.array,D=model.jointData;
      for(let v=0;v<P.length/3;v++){
        const x=P[v*3],y=P[v*3+1],z=P[v*3+2];point.set(0,0,0);
        for(let k=0;k<4;k++){const o=I[v*4+k]*16,w=W[v*4+k];
          point.x+=w*(D[o]*x+D[o+4]*y+D[o+8]*z+D[o+12]);
          point.y+=w*(D[o+1]*x+D[o+5]*y+D[o+9]*z+D[o+13]);
          point.z+=w*(D[o+2]*x+D[o+6]*y+D[o+10]*z+D[o+14]);
        }
        assert.ok(point.distanceTo(mesh.geometry.boundingSphere.center)<=mesh.geometry.boundingSphere.radius);checked++;
      }
    }
  }
  assert.equal(checked,vertices*20,'every exported vertex was checked in every sampled pose');
});
