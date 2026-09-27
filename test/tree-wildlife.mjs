// Agent Control: qualify continuity, shared-batch capacity, wind attachment and distance culling.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Vector3} from '../src/engine/index.js';
import {standard} from '../src/materials/Materials.js';
import {TreeWildlife,monkeyPatrol} from '../src/world/TreeWildlife.js';
import {buildBanana} from '../src/world/vegetation/PlantGeometry.js';

test('monkeys never teleport at patrol or turn boundaries',()=>{
	for(let t=-.02;t<48;t+=.01){
		const a=monkeyPatrol(t),b=monkeyPatrol(t+.01);
		assert.ok(Math.abs(a.x)<=1.750001);
		assert.ok(Math.abs(a.x-b.x)<.008);
		const turn=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw));
		assert.ok(Math.abs(turn)<.025);
	}
});
test('fruit and monkeys follow swaying branch frames, with finite matrices and bounded batches',()=>{
	const root=new Group(),trees=[];
	for(let i=0;i<8;i++) {
		const tree=new Group();tree.position.set(110+i,2,606);root.add(tree);
		const joint=new Group();joint.position.y=4;tree.add(joint);trees.push({root:tree,joints:Array(10).fill(joint)});
	}
	const wildlife=new TreeWildlife(root,trees,standard({color:0x555555}));
	assert.equal(wildlife.monkeys.length,4);assert.equal(wildlife.fruit.length,96);
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
