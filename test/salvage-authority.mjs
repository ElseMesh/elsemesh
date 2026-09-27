import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ItemEconomy } from '../src/game/ItemEconomy.js';
import { PhysicalItems } from '../src/game/PhysicalItems.js';
import { ITEM_SPAWNS } from '../src/game/ItemCatalog.js';
import { sonarContacts } from '../src/game/SalvageAuthority.js';
import { WebSocket } from 'ws';
import { createOnlineServer } from '../tools/networking/online-server.mjs';
import { makeState } from '../src/network/PlayerProtocol.js';

const boat = { position:[64.5,0,36.5], quaternion:[0,0,0,1], velocity:[0,0,0] };
function setup(now=10000) {
	const economy=new ItemEconomy(); economy.join('loz'); economy.join('ed');
	economy.position('loz',{position:[64.5,0,36.5],mode:'deck'},now);
	economy.position('ed',{position:[64.5,0,36.5],mode:'boat'},now);
	economy.boat(boat,now); return economy;
}

test('sonar enforces depth/range and fixed sites preserve measured depth',()=>{
	const contacts=sonarContacts([
		{id:'surface',type:'watch',owner:null,x:0,y:0,z:0},
		{id:'ok',type:'phone',owner:null,x:3,y:-50,z:4},
		{id:'deep',type:'knife',owner:null,x:0,y:-50.01,z:0},
		{id:'far',type:'knife',owner:null,x:81,y:-2,z:0},
		{id:'owned',type:'watch',owner:'loz',x:1,y:-2,z:0},
		{id:'held',type:'watch',owner:null,held:true,x:1,y:-2,z:0},
	],[0,0,0]);
	assert.deepEqual(contacts.map(c=>c.itemId),['ok']);
	assert.equal(contacts[0].distance,5); assert.equal(contacts[0].depth,50);
	for(const id of ['salvage-watch','salvage-phone','salvage-knife','salvage-deep-watch','salvage-deep-phone']) {
		const spawn=ITEM_SPAWNS.find(row=>row[0]===id); assert.ok(spawn); assert.ok(spawn[4]<0 && spawn[4]>=-50);
	}
});

test('claim requires fresh validated stationary boat and is exclusive',()=>{
	const e=setup(); assert.ok(e.act('loz',{action:'salvage',command:'claim'},10000).ok);
	assert.equal(e.act('ed',{action:'salvage',command:'claim'},10000).ok,false);
	const stale=setup(); assert.equal(stale.act('loz',{action:'salvage',command:'claim'},15000).ok,false);
	const waveBobbing=setup(); waveBobbing.boat({...boat,velocity:[0,2,0]},10000);
	assert.equal(waveBobbing.act('loz',{action:'salvage',command:'claim'},10000).ok,true);
	const moving=setup(); moving.boat({...boat,velocity:[.61,2,0]},10000);
	assert.equal(moving.act('loz',{action:'salvage',command:'claim'},10000).ok,false);
});

test('grab chooses nearest eligible target, retrieves exactly once, and rejects depth mismatch pickup',()=>{
	const e=setup(), authority=e.salvage; assert.ok(e.act('loz',{action:'salvage',command:'claim'},10000).ok);
	authority.depth=10; const hook=authority.hook();
	e.items.push({id:'near',type:'watch',owner:null,x:hook[0]+.1,y:hook[1],z:hook[2]});
	e.items.push({id:'farther',type:'phone',owner:null,x:hook[0]+.7,y:hook[1],z:hook[2]});
	e.items.push({id:'too-deep',type:'knife',owner:null,x:hook[0],y:-50.7,z:hook[2]});
	assert.ok(e.act('loz',{action:'salvage',command:'grab'},10000).ok);
	assert.equal(authority.heldItemId,'near'); assert.equal(e.items.find(i=>i.id==='near').owner,null);
	assert.equal(e.act('loz',{action:'pickup',itemId:'near'},10000).ok,false);
	assert.ok(e.act('loz',{action:'salvage',command:'retrieve'},10000).ok);
	authority.lastTick=10000; for(let now=10250; now<=17000; now+=250) { e.boat(boat,now); e.position('loz',{position:[64.5,0,36.5],mode:'deck'},now); e.tick(now); }
	assert.equal(e.items.find(i=>i.id==='near').owner,'loz'); assert.equal(authority.heldItemId,null);
	assert.equal(e.owned('loz').filter(i=>i.id==='near').length,1);
});

test('solo update persists a completed hoist exactly when ownership transfers',()=>{
	const writes=[]; const previousStorage=globalThis.localStorage;
	globalThis.localStorage={setItem:(key,value)=>writes.push([key,JSON.parse(value)])};
	try {
		const item={id:'recovered',type:'watch',owner:null,x:0,y:0,z:0,held:true};
		const ledger={salvage:{heldItemId:item.id},position(){},tick(){item.owner='solo';delete item.held;this.salvage.heldItemId=null;},packet(){return {accounts:{solo:{credits:0,fish:[],upgrades:{},nextFish:1,equipped:null}},items:[{...item}],offers:[],crateOpened:false,salvage:{heldItemId:this.salvage.heldItemId}};}};
		const state={money:0,inventory:[],upgrades:{},emit(){},save(){}};
		const physical=Object.assign(Object.create(PhysicalItems.prototype),{id:'solo',ledger,meshes:new Map([[item.id,{visible:false}]]),game:{state,hud:null,boatCtl:null},app:{player:{position:{x:0,y:0,z:0},mode:'walk'},freeCam:false,input:{hit:()=>false},terrainData:{heightAt:()=>0}},crateLid:{rotation:{}},crateRope:{}});
		physical.update();
		assert.equal(writes.length,1);
		assert.equal(writes[0][0],'burning-horizons.items.v1');
		assert.equal(writes[0][1].items.find(entry=>entry.id===item.id).owner,'solo');
		physical.update(); assert.equal(writes.length,1);
	} finally { if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage; }
});

test('stale controls stop movement and disconnect safely drops held item',()=>{
	const e=setup(), a=e.salvage; e.act('loz',{action:'salvage',command:'claim'},10000);
	e.act('loz',{action:'salvage',command:'control',axes:{x:1,z:0,depth:1}},10000);
	a.lastTick=10000; e.boat(boat,10250); e.position('loz',{position:[64.5,0,36.5],mode:'deck'},10250); e.tick(10250);
	const stoppedDepth=a.depth; e.boat(boat,10700); e.position('loz',{position:[64.5,0,36.5],mode:'deck'},10700); e.tick(10700); assert.equal(a.depth,stoppedDepth);
	const hook=a.hook(); e.items.push({id:'drop-test',type:'watch',owner:null,x:hook[0],y:hook[1],z:hook[2],held:true}); a.heldItemId='drop-test';
	e.disconnect('loz'); const item=e.items.find(i=>i.id==='drop-test'); assert.equal(item.owner,null); assert.equal(item.held,undefined); assert.equal(a.operator,null); assert.deepEqual(a.axes,{x:0,z:0,depth:0});
});

test('old v1 saves merge missing fixed salvage without trusting transient held state',()=>{
	const source=new ItemEconomy(), packet=source.packet(); packet.items=packet.items.filter(i=>!i.id.startsWith('salvage-')); packet.items[0].held=true; delete packet.salvage; delete packet.salvageSpawnVersion;
	const restored=new ItemEconomy(); assert.ok(restored.load(JSON.parse(JSON.stringify(packet))));
	assert.equal(restored.items[0].held,undefined);
	assert.equal(restored.items.filter(i=>i.id.startsWith('salvage-')).length,5);
	assert.equal(restored.packet().salvageSpawnVersion,1);
});

test('salvage migration runs once and sold items stay sold across repeated reloads',()=>{
	const oldSave=new ItemEconomy().packet();
	oldSave.items=oldSave.items.filter(i=>i.id!=='salvage-watch'&&i.id!=='beach-watch');
	delete oldSave.salvageSpawnVersion;
	const first=new ItemEconomy(); assert.ok(first.load(JSON.parse(JSON.stringify(oldSave))));
	assert.ok(first.items.some(i=>i.id==='salvage-watch'));
	assert.equal(first.items.some(i=>i.id==='beach-watch'),false);
	first.items=first.items.filter(i=>i.id!=='salvage-watch');
	const second=new ItemEconomy(); assert.ok(second.load(JSON.parse(JSON.stringify(first.packet()))));
	assert.equal(second.items.some(i=>i.id==='salvage-watch'),false);
	const third=new ItemEconomy(); assert.ok(third.load(JSON.parse(JSON.stringify(second.packet()))));
	assert.equal(third.items.some(i=>i.id==='salvage-watch'),false);
});

test('load discards active transient salvage authority state',()=>{
	const active=setup(); assert.ok(active.act('loz',{action:'salvage',command:'claim'},10000).ok);
	active.salvage.depth=12; active.salvage.heldItemId='salvage-watch';
	const packet=active.packet(); packet.items.find(i=>i.id==='salvage-watch').held=true;
	const restored=new ItemEconomy(); assert.ok(restored.load(JSON.parse(JSON.stringify(packet))));
	assert.equal(restored.salvage.operator,null);
	assert.equal(restored.salvage.heldItemId,null);
	assert.equal(restored.salvage.depth,-2.4);
	assert.equal(restored.items.find(i=>i.id==='salvage-watch').held,undefined);
});

test('real room sockets serialize salvage claims and late join observes operator',async()=>{
	const service=await createOnlineServer({root:process.cwd(),port:0}), sockets=[];
	const origin=`http://127.0.0.1:${service.address.port}`, room='e'.repeat(32);
	const connect=async(role)=>{
		const ws=new WebSocket(`${origin.replace('http','ws')}/ws?room=${room}&role=${role}${role==='loz'?`&hostKey=${'a'.repeat(32)}`:''}`,{origin}); sockets.push(ws);
		const messages=[]; ws.on('message',bytes=>messages.push(JSON.parse(bytes.toString())));
		await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
		return {ws,send:packet=>ws.send(JSON.stringify(packet)),wait:async predicate=>{const until=Date.now()+2000;while(Date.now()<until){const index=messages.findIndex(predicate);if(index>=0)return messages.splice(index,1)[0];await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Expected packet missing');}};
	};
	const state=(role,letter,withBoat=false)=>makeState({playerId:`player:${role}`,nodeId:`bh-node:${letter.repeat(64)}`,sequence:1,player:{position:{x:64.5,y:0,z:36.5},yaw:0,mode:'deck',deckPos:{x:0,y:0,z:0},velocity:{lengthSq:()=>0}},boat:withBoat?{position:{x:64.5,y:0,z:36.5},quaternion:{x:0,y:0,z:0,w:1},velocity:{x:0,y:0,z:0},driven:false}:null});
	try {
		const loz=await connect('loz'), ed=await connect('ed');
		loz.send({type:'state',state:state('loz','a',true)}); ed.send({type:'state',state:state('ed','b')});
		await new Promise(resolve=>setTimeout(resolve,20));
		loz.send({type:'economy-action',action:'salvage',command:'claim'}); ed.send({type:'economy-action',action:'salvage',command:'claim'});
		const lozResult=await loz.wait(packet=>packet.type==='economy-result'&&packet.action==='salvage');
		const edResult=await ed.wait(packet=>packet.type==='economy-result'&&packet.action==='salvage');
		assert.equal(Number(lozResult.ok)+Number(edResult.ok),1);
		const winner=lozResult.ok?'loz':'ed';
		const guest=await connect('guest');
		const snapshot=await guest.wait(packet=>packet.type==='economy'&&packet.salvage?.operator===winner);
		assert.equal(snapshot.salvage.operator,winner);
	} finally { for(const ws of sockets) ws.terminate(); await service.close(); }
});
