// Agent Control: qualify continuity, shared-batch capacity, wind attachment and distance culling.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Vector3} from '../src/engine/index.js';
import {standard} from '../src/materials/Materials.js';
import {TreeWildlife,monkeyPatrol,monkeyJump} from '../src/world/TreeWildlife.js';
import {buildBanana} from '../src/world/vegetation/PlantGeometry.js';
import {branchPoint,branchRadius,curvedBranchGeometry} from '../src/world/vegetation/TreeBranch.js';

test('branches grow from a buried trunk origin, rise, curve and taper',()=>{
	for(let variant=0;variant<3;variant++) {
		assert.equal(branchPoint(0,variant).length(),0);
		assert.ok(branchPoint(1,variant).y>1.5);
		assert.ok(branchPoint(.5,variant).distanceTo(branchPoint(1,variant).multiplyScalar(.5))>.4);
		assert.ok(branchRadius(0)>branchRadius(.5)&&branchRadius(.5)>branchRadius(1));
		const g=curvedBranchGeometry((t,out)=>branchPoint(t,variant,out),branchRadius);
		assert.ok(g.attributes.position.array.every(Number.isFinite));
		assert.ok(g.attributes.normal.array.every(Number.isFinite));
	}
});

test('monkeys never teleport at patrol or turn boundaries',()=>{
	for(let t=-.02;t<48;t+=.01){
		const a=monkeyPatrol(t),b=monkeyPatrol(t+.01);
		assert.ok(Math.abs(a.x)<=1.750001);
		assert.ok(Math.abs(a.x-b.x)<.008);
		const turn=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw));
		assert.ok(Math.abs(turn)<.025);
	}
});
test('jump arc begins and ends on branches and clears the gap',()=>{
	const a=new Vector3(0,4,0),b=new Vector3(4,5,1);
	assert.deepEqual(monkeyJump(a,b,0).toArray(),a.toArray());
	assert.deepEqual(monkeyJump(a,b,1).toArray(),b.toArray());
	assert.ok(monkeyJump(a,b,.5).y>Math.max(a.y,b.y)+.5);
});
test('fruit and monkeys follow swaying branch frames, with finite matrices and bounded batches',()=>{
	const root=new Group(),trees=[];
	for(let i=0;i<8;i++) {
		const tree=new Group();tree.position.set(110+i,2,606);root.add(tree);
		const joint=new Group();joint.position.y=4;tree.add(joint);trees.push({root:tree,joints:Array(10).fill(joint)});
	}
	const wildlife=new TreeWildlife(root,trees,standard({color:0x555555}));
	assert.equal(wildlife.monkeys.length,4);assert.equal(wildlife.fruit.length,96);
	assert.ok(wildlife.monkeys.some(m=>m.destination));
	for(const m of wildlife.monkeys)if(m.destination)assert.notEqual(m.destination.tree,m.tree);
	const camera=new Vector3(115,8,608);wildlife.update(0,camera);
	const before=Array.from(wildlife.mangoBatch.instanceMatrix.array.slice(0,16));
	wildlife.fruit[0].anchor.parent.rotation.z=.3;wildlife.update(0,camera);
	assert.notDeepEqual(Array.from(wildlife.mangoBatch.instanceMatrix.array.slice(0,16)),before);
	for(const batch of [...wildlife.batches,wildlife.mangoBatch]) {
		assert.ok(batch.count>0 && batch.count<=batch.instanceMatrix.count);
		assert.ok(batch.instanceMatrix.array.slice(0,batch.count*16).every(Number.isFinite));
		assert.ok(batch.previous.array.slice(0,batch.count*16).every(Number.isFinite));
	}
	const previous=Array.from(wildlife.batches[0].instanceMatrix.array);
	wildlife.update(.1,camera);
	assert.deepEqual(Array.from(wildlife.batches[0].previous.array),previous);
	assert.notDeepEqual(Array.from(wildlife.batches[0].instanceMatrix.array),previous);
	for(const boundary of [24,25.25,49.25,50.5,96]) {
		wildlife.time=boundary-.00001;wildlife.update(0,camera);const positions=wildlife.monkeys.map(m=>m.currentPosition.clone());
		wildlife.time=boundary+.00001;wildlife.update(0,camera);
		wildlife.monkeys.forEach((m,i)=>assert.ok(m.currentPosition.distanceTo(positions[i])<.001));
	}
	wildlife.update(1,new Vector3(0,0,-500));
	for(const batch of [...wildlife.batches,wildlife.mangoBatch])assert.equal(batch.visible,false);
});
test('banana variants retain UVs and solid curved fruit geometry',()=>{
	for(const seed of [9,21]) {
		const {geometry:g}=buildBanana(seed),part=g.attributes.aMat.array;
		assert.ok(g.attributes.position.array.every(Number.isFinite));
		assert.equal(g.attributes.uv.count,g.attributes.position.count);
		assert.equal(Array.from(part).filter((v,i)=>i%4===0&&v===4).length,28*6*6+6*7);
	}
});
