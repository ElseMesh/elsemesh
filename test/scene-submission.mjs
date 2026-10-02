import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshRenderer } from '../src/engine/render/MeshRenderer.js';
import { Material } from '../src/engine/render/Material.js';
import { Scene, Mesh, BoxGeometry, PerspectiveCamera } from '../src/engine/index.js';

function mesh(name, material = new Material(), z = -5, order = 0) {
  const result = new Mesh(new BoxGeometry(1, 1, 1), material);
  result.name = name; result.position.z = z; result.renderOrder = order; result.castShadow = true;
  result.geometry.computeBoundingSphere();
  return result;
}
const camera = () => new PerspectiveCamera(70, 1, .1, 1000);
const names = list => list.map(item => item.object.name);
function renderFixture() {
  const renderer = new MeshRenderer(), scene = new Scene(), cam = camera();
  renderer._beginFrame = () => {};
  renderer.optimizeSceneSubmission = true;
  return {renderer, scene, cam};
}

test('render leases reuse storage without changing public collect ownership or retaining scene objects', () => {
  const {renderer, scene, cam} = renderFixture(), object = mesh('one'); scene.add(object);
  assert.equal(new MeshRenderer().optimizeSceneSubmission, true);
  assert.equal(renderer.optimizeOpaqueDepthSort, false);
  const owned = renderer.collect(scene, {camera:cam});
  let first, current;
  renderer._renderPass = lists => { current = lists.opaque[0]; first ??= current; assert.equal(current.object, object); };
  renderer.render(scene, {camera:cam});
  renderer.render(scene, {camera:cam});
  assert.equal(first, current, 'a finished render releases reusable records');
  assert.equal(current.object, null, 'free records do not retain meshes');
  assert.equal(current.geometry, null);
  assert.equal(current.material, null);
  assert.equal(renderer.submissionStats.drawRecordAllocations, 1);
  assert.equal(renderer.submissionStats.listLeases, 2);
  assert.equal(owned.opaque[0].object, object, 'public list remains independently owned');
  assert.notEqual(owned.opaque[0], current);
  const external = {opaque:owned.opaque, transparent:[]};
  renderer._renderPass = list => assert.equal(list, external);
  renderer.render(scene, {camera:cam, items:external});
  assert.equal(renderer.submissionStats.listLeases, 2, 'explicit pass.items are never borrowed or cleared');
  assert.equal(owned.opaque[0].object, object);
});

test('nested callback renders and filter collections preserve outer records, culling and camera distance', () => {
  for (const enabled of [false, true]) {
    const {renderer, scene, cam} = renderFixture(); renderer.optimizeSceneSubmission = enabled;
    const first = mesh('outer-first'), second = mesh('outer-second', first.material, -7);
    scene.add(first, second);
    const innerScene = new Scene(), inner = mesh('inner'); inner.position.x = 100; innerScene.add(inner);
    const innerCamera = camera(); innerCamera.position.x = 100;
    let nested = false, innerList;
    first.onBeforeRender = () => { renderer.render(innerScene, {camera:innerCamera, label:'nested'}); };
    renderer._renderPass = (lists, pass) => {
      if (pass.label === 'nested') { innerList = lists; assert.deepEqual(names(lists.opaque), ['inner']); return; }
      assert.deepEqual(names(lists.opaque), ['outer-first', 'outer-second']);
      assert.deepEqual(lists.opaque.map(item=>item.z), [25,49]);
      assert.notEqual(lists, innerList);
      const record = lists.opaque[0];
      // A render callback after collection still cannot reuse an active lease.
      renderer.render(innerScene, {camera:innerCamera, label:'nested'});
      assert.equal(record.object, first);
      assert.equal(lists.opaque.length, 2);
    };
    renderer.render(scene, {camera:cam, filter:object=>{
      if (!nested && object===first) {
        nested = true;
        assert.deepEqual(names(renderer.collect(innerScene,{camera:innerCamera}).opaque), ['inner']);
      }
      return true;
    }});
    assert.equal(renderer._collectionDepth, 0);
  }
});

test('callback changes are collected each pass and exceptions return every lease', () => {
  const {renderer, scene, cam} = renderFixture();
  const a = new Material(), b = new Material({transparent:true});
  const object = mesh('grouped', [a,b]);
  object.geometry.clearGroups(); object.geometry.addGroup(0,6,0); object.geometry.addGroup(6,6,1);
  scene.add(object); let pass = 0;
  object.onBeforeRender = () => { object.geometry.setDrawRange(++pass===1?3:0,6); b.visible=pass===1; };
  renderer._renderPass = list => {
    if (pass===1) {
      assert.deepEqual(list.opaque.map(x=>[x.start,x.count]), [[3,3]]);
      assert.deepEqual(list.transparent.map(x=>[x.start,x.count]), [[6,3]]);
    } else { assert.deepEqual(list.opaque.map(x=>[x.start,x.count]), [[0,6]]); assert.equal(list.transparent.length,0); }
  };
  renderer.render(scene,{camera:cam}); renderer.render(scene,{camera:cam});
  object.onBeforeRender=()=>{throw Error('callback failure');};
  assert.throws(()=>renderer.render(scene,{camera:cam}),/callback failure/);
  assert.equal(renderer._collectionDepth,0);
  object.onBeforeRender=()=>{};
  renderer._renderPass=()=>{throw Error('submission failure');};
  assert.throws(()=>renderer.render(scene,{camera:cam}),/submission failure/);
  assert.equal(renderer._drawListPool.free.length,1);
  renderer.precompiling=true; renderer._renderPass=()=>{};
  const leases=renderer.submissionStats.listLeases;
  renderer.render(scene,{camera:cam});
  assert.equal(renderer.submissionStats.listLeases,leases,'precompile does not borrow draw records');
});

test('coarse opaque depth bands preserve material grouping, explicit order and other pass ordering', () => {
  const renderer=new MeshRenderer(), scene=new Scene(), cam=camera();
  const a=new Material(), b=new Material(), glass=new Material({transparent:true});
  scene.add(mesh('far-a',a,-110),mesh('near-b',b,-8),mesh('near-a',a,-14),mesh('far-b',b,-120),
    mesh('priority',b,-180,-1),mesh('glass-near',glass,-4),mesh('glass-far',glass,-100));
  const before=renderer.collect(scene,{camera:cam});
  renderer.optimizeOpaqueDepthSort=true;
  const after=renderer.collect(scene,{camera:cam});
  assert.deepEqual(names(after.opaque),['priority','near-a','near-b','far-a','far-b']);
  assert.deepEqual(names(after.transparent),names(before.transparent));
  assert.deepEqual(names(after.transparent),['glass-far','glass-near']);
  for(const extra of [{kind:'depth'},{kind:'color'},{late:true}]) {
    renderer.optimizeOpaqueDepthSort=false;const baseline=renderer.collect(scene,{camera:cam,...extra});
    renderer.optimizeOpaqueDepthSort=true;const candidate=renderer.collect(scene,{camera:cam,...extra});
    assert.deepEqual(names(candidate.opaque),names(baseline.opaque));
    assert.deepEqual(names(candidate.transparent),names(baseline.transparent));
  }
});

test('unsafe depth/blend draws are ordering barriers, and unknown bounds stay in their original slots', () => {
  for(const property of ['depthWrite','depthTest','blending','depthCompare','bounds']) {
    const renderer=new MeshRenderer(), scene=new Scene(), cam=camera(); renderer.optimizeOpaqueDepthSort=true;
    const far=mesh('far',new Material(),-100), barrier=mesh('barrier',new Material(),-70), near=mesh('near',new Material(),-5);
    if(property==='bounds') barrier.frustumCulled=false;
    else barrier.material[property]=property==='blending'?'additive':property==='depthCompare'?'always':false;
    scene.add(far,barrier,near);
    assert.deepEqual(names(renderer.collect(scene,{camera:cam}).opaque),['far','barrier','near'],property);
  }
});

function submissionFixture(enabled) {
  const renderer=new MeshRenderer(); renderer.optimizeSceneSubmission=enabled;
  const buffer={},index={},pipeline={},group={};
  const geometry={attributes:{position:{count:12}},index:{count:12},instanceCount:1,
    layout:{buffers:[{attr:{buffer}}]},indexInfo:{buffer:index,format:'uint16'}};
  const material={pipeline:{handle:{pipeline},bindings:{getBindGroup:()=>group}}};
  const object={slot:2};
  const items=[{object,geometry,material,start:0,count:6},{object,geometry,material,start:6,count:6}];
  renderer._cachedLayout=(_o,g)=>g.layout; renderer._pipeline=m=>m.pipeline;
  let uploads=0;
  renderer._attributeBuffer=(_g,a)=>{uploads++;return a.buffer;};
  renderer._indexBuffer=g=>g.indexInfo; renderer._slot=o=>o.slot; renderer.drawBindGroup={};
  const events=[];
  const rp={setPipeline:p=>events.push(['pipeline',p]),setBindGroup:(i,g,o)=>events.push(['group',i,g,o?Array.from(o):null]),
    setVertexBuffer:(i,b)=>events.push(['vertex',i,b]),setIndexBuffer:(b,f)=>events.push(['index',b,f]),
    drawIndexed:(...args)=>events.push(['drawIndexed',...args]),draw:(...args)=>events.push(['draw',...args]),
    drawIndexedIndirect:(...args)=>events.push(['drawIndexedIndirect',...args]),drawIndirect:(...args)=>events.push(['drawIndirect',...args])};
  return {renderer,geometry,material,object,items,rp,events,uploads:()=>uploads};
}

test('binding reuse preserves draws and dynamic uploads; every drawItems call starts with fresh state',()=>{
  const a=submissionFixture(false),b=submissionFixture(true);
  a.renderer.drawItems(a.rp,a.items,{});b.renderer.drawItems(b.rp,b.items,{});
  const draws=f=>f.events.filter(x=>x[0]==='drawIndexed');
  assert.deepEqual(draws(b),draws(a));assert.equal(b.uploads(),2,'buffer contents are checked for both draws');
  assert.equal(a.events.filter(x=>x[0]==='vertex').length,2);assert.equal(b.events.filter(x=>x[0]==='vertex').length,1);
  assert.equal(b.renderer.submissionStats.vertexBindsSkipped,1);
  assert.equal(b.renderer.submissionStats.indexBindsSkipped,1);
  assert.equal(b.renderer.submissionStats.drawBindsSkipped,1);
  const before=b.events.length;b.renderer.drawItems(b.rp,b.items,{});
  assert.equal(b.events.slice(before).filter(x=>x[0]==='vertex').length,1,'betweenLists/external pass changes cannot carry stale bindings');
  assert.equal(b.renderer._submissionDepth,0);
});

test('dynamic offsets use the five-argument typed-array overload with one current offset',()=>{
  const f=submissionFixture(true), calls=[], original=f.rp.setBindGroup;
  f.items[1].object={slot:3};
  f.rp.setBindGroup=(...args)=>{
    if(args[0]===2){
      assert.equal(args.length,5);
      const [,group,offsets,start,count]=args;
      assert.equal(group,f.renderer.drawBindGroup);
      assert.ok(offsets instanceof Uint32Array);
      assert.equal(start,0);assert.equal(count,1);
      calls.push({offsets,values:Array.from(offsets.subarray(start,start+count))});
    }
    original(...args);
  };
  f.renderer.drawItems(f.rp,f.items,{});
  assert.equal(calls.length,2);
  assert.equal(calls[0].offsets,calls[1].offsets,'the offset storage is reused');
  assert.deepEqual(calls.map(call=>call.values),[[512],[768]],'each binding sees its current offset');
  assert.equal(f.events.filter(event=>event[0]==='drawIndexed').length,2);
});

test('changed vertex buffers, index formats, object offsets and indirect offsets are submitted',()=>{
  const f=submissionFixture(true);const original=f.rp.drawIndexed;
  f.rp.drawIndexed=(...args)=>{original(...args);f.geometry.layout.buffers[0].attr.buffer={};f.geometry.indexInfo.format='uint32';f.object.slot++;};
  f.renderer.drawItems(f.rp,f.items,{});
  assert.equal(f.events.filter(x=>x[0]==='vertex').length,2);
  assert.deepEqual(f.events.filter(x=>x[0]==='index').map(x=>x[2]),['uint16','uint32']);
  assert.deepEqual(f.events.filter(x=>x[0]==='group'&&x[1]===2).map(x=>x[3]),[[512],[768]]);
  const g=submissionFixture(true);const indirect={};g.geometry.indirect={buffer:indirect,offsets:[0,20,40]};
  g.renderer.drawItems(g.rp,g.items.slice(0,1),{});
  assert.deepEqual(g.events.filter(x=>x[0]==='drawIndexedIndirect').map(x=>x[2]),[0,20,40]);
  g.geometry.indirect={buffer:indirect,offset:60};g.renderer.drawItems(g.rp,g.items.slice(0,1),{});
  assert.equal(g.events.at(-1)[2],60);
  g.rp.setVertexBuffer=()=>{throw Error('binding failure');};
  assert.throws(()=>g.renderer.drawItems(g.rp,g.items,{}),/binding failure/);
  assert.equal(g.renderer._submissionDepth,0);
});
