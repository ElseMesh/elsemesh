import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ItemEconomy } from '../src/game/ItemEconomy.js';
import { ITEM_SPAWNS } from '../src/game/ItemCatalog.js';
import { sonarContacts } from '../src/game/SalvageAuthority.js';

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
	const moving=setup(); moving.boat({...boat,velocity:[.61,0,0]},10000);
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

test('stale controls stop movement and disconnect safely drops held item',()=>{
	const e=setup(), a=e.salvage; e.act('loz',{action:'salvage',command:'claim'},10000);
	e.act('loz',{action:'salvage',command:'control',axes:{x:1,z:0,depth:1}},10000);
	a.lastTick=10000; e.boat(boat,10250); e.position('loz',{position:[64.5,0,36.5],mode:'deck'},10250); e.tick(10250);
	const stoppedDepth=a.depth; e.boat(boat,10700); e.position('loz',{position:[64.5,0,36.5],mode:'deck'},10700); e.tick(10700); assert.equal(a.depth,stoppedDepth);
	const hook=a.hook(); e.items.push({id:'drop-test',type:'watch',owner:null,x:hook[0],y:hook[1],z:hook[2],held:true}); a.heldItemId='drop-test';
	e.disconnect('loz'); const item=e.items.find(i=>i.id==='drop-test'); assert.equal(item.owner,null); assert.equal(item.held,undefined); assert.equal(a.operator,null); assert.deepEqual(a.axes,{x:0,z:0,depth:0});
});

test('old v1 saves merge missing fixed salvage without trusting transient held state',()=>{
	const source=new ItemEconomy(), packet=source.packet(); packet.items=packet.items.filter(i=>!i.id.startsWith('salvage-')); packet.items[0].held=true; delete packet.salvage;
	const restored=new ItemEconomy(); assert.ok(restored.load(JSON.parse(JSON.stringify(packet))));
	assert.equal(restored.items[0].held,undefined);
	assert.equal(restored.items.filter(i=>i.id.startsWith('salvage-')).length,5);
});
