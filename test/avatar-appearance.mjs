import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_APPEARANCE, AVATAR_STYLES, loadAppearance, saveAppearance, validateAppearance } from '../src/player/AvatarAppearance.js';
import { makeState, RemoteState, validateState } from '../src/network/PlayerProtocol.js';

test('saved appearance round trips and corrupt/unavailable storage recovers',()=>{
	let value='invalid'; const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
	assert.deepEqual(loadAppearance(storage),DEFAULT_APPEARANCE);
	const custom={...DEFAULT_APPEARANCE,style:'female',skin:'#513323',shirt:'#c54343'};
	assert.equal(saveAppearance(custom,storage),true); assert.deepEqual(loadAppearance(storage),custom);
	const blocked={getItem(){throw Error();},setItem(){throw Error();}};
	assert.deepEqual(loadAppearance(blocked),DEFAULT_APPEARANCE); assert.equal(saveAppearance(custom,blocked),false);
});
test('appearance input rejects URLs, extra fields and malformed colours',()=>{
	for(const bad of [null,[],{...DEFAULT_APPEARANCE,style:'../scan'},{...DEFAULT_APPEARANCE,hair:'red'},{...DEFAULT_APPEARANCE,skin:'#fff'},{...DEFAULT_APPEARANCE,url:'https://host/asset'},{...DEFAULT_APPEARANCE,style:'__proto__'}]) assert.throws(()=>validateAppearance(bad));
});
test('late join and interpolation preserve distinct player appearances; stale state cannot overwrite',()=>{
	const local={...DEFAULT_APPEARANCE}, other={...local,style:'female',shirt:'#33785b',skin:'#805136'};
	const p={position:{x:1,y:2,z:3},velocity:{lengthSq:()=>0},yaw:0,mode:'walk',avatarAppearance:other};
	const state=makeState({playerId:'player:ed',nodeId:`bh-node:${'b'.repeat(64)}`,sequence:1,player:p});
	const remote=new RemoteState({ownPlayerId:'player:loz',ownNodeId:`bh-node:${'a'.repeat(64)}`});
	assert.equal(remote.observe(JSON.parse(JSON.stringify(state))),true);
	assert.deepEqual(remote.interpolated(null,1).appearance,other);
	assert.notDeepEqual(remote.state.appearance,local);
	const newer={...state,sequence:2,appearance:{...other,hair:'#adadab'}}; remote.observe(newer);
	assert.equal(remote.observe(state),false); assert.equal(remote.interpolated(state,.5).appearance.hair,'#adadab');
	assert.throws(()=>validateState({...state,appearance:{...other,style:'scanned-explorer'}}));
	const legacy={...state}; delete legacy.appearance; assert.equal(validateState(legacy),legacy);
});
test('every selectable GLB contains a skeleton, required clips and tint-zone ORM maps',async()=>{
	for(const style of Object.values(AVATAR_STYLES)){
		const b=await readFile(new URL(`../public/models/characters/${style.asset}.glb`,import.meta.url));
		const g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
		assert.ok(g.skins[0].joints.length>30);
		for(const clip of ['idle','walk','run','helm']) assert.ok(g.animations.some(a=>a.name===clip),`${style.asset}: ${clip}`);
		for(const name of ['body','head']){
			const m=g.materials.find(m=>m.name===name); assert.ok(m.occlusionTexture,`${style.asset}: tint mask ${name}`);
			assert.equal(m.occlusionTexture.index,m.pbrMetallicRoughness.metallicRoughnessTexture.index);
		}
	}
});
