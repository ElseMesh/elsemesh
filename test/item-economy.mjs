import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ItemEconomy} from '../src/game/ItemEconomy.js';
import {GENERAL_SHOP, SUPPLY_CRATE} from '../src/game/ItemCatalog.js';
const move=(e,id,p)=>e.position(id,{position:[p.x,1,p.z],mode:'walk'});
function setup(){const e=new ItemEconomy();e.join('loz');e.join('ed');return e;}
test('empty hands, exclusive pickup, drop, persistence and physical proximity',()=>{
	const e=setup(),i=e.items[0];assert.equal(e.owned('loz').length,0);
	assert.equal(e.act('loz',{action:'pickup',itemId:i.id}).ok,false);
	move(e,'loz',i);move(e,'ed',i);assert.ok(e.act('loz',{action:'pickup',itemId:i.id}).ok);
	assert.equal(e.act('ed',{action:'pickup',itemId:i.id}).ok,false);
	assert.ok(e.act('loz',{action:'use',itemId:i.id}).ok);
	assert.ok(e.act('loz',{action:'drop',itemId:i.id}).ok);assert.equal(e.accounts.loz.equipped,null);
	assert.ok(e.act('ed',{action:'pickup',itemId:i.id}).ok);
	const restored=new ItemEconomy();assert.ok(restored.load(JSON.parse(JSON.stringify(e.packet()))));assert.equal(restored.items[0].owner,'ed');
});
test('credit trades and barter atomically transfer ownership; reject replay and stale offers',()=>{
	const e=setup(),a=e.items[0],b=e.items[1];a.owner='loz';b.owner='ed';e.accounts.ed.credits=25;
	move(e,'loz',GENERAL_SHOP);move(e,'ed',GENERAL_SHOP);
	assert.ok(e.act('loz',{action:'offer',itemId:a.id,to:'ed',price:10,requestItemId:b.id}).ok);
	const id=e.offers[0].id;assert.equal(a.owner,'loz');
	assert.ok(e.act('ed',{action:'accept',offerId:id}).ok);assert.equal(a.owner,'ed');assert.equal(b.owner,'loz');
	assert.equal(e.accounts.loz.credits,10);assert.equal(e.accounts.ed.credits,15);
	assert.equal(e.act('ed',{action:'accept',offerId:id}).ok,false);
	assert.ok(e.act('loz',{action:'offer',itemId:b.id,to:'ed',price:20}).ok);
	assert.equal(e.act('ed',{action:'accept',offerId:e.offers[0].id}).ok,false);assert.equal(b.owner,'loz');
	e.act('loz',{action:'drop',itemId:b.id});assert.equal(e.offers.length,0);
});
test('shop prices, knife crate reward, disconnect and hostile input',()=>{
	const e=setup(),knife=e.items[1];knife.owner='loz';move(e,'loz',SUPPLY_CRATE);
	assert.ok(e.act('loz',{action:'use',itemId:knife.id}).ok);assert.equal(e.accounts.loz.credits,35);
	e.act('loz',{action:'use',itemId:knife.id});assert.equal(e.accounts.loz.credits,35);
	move(e,'loz',GENERAL_SHOP);assert.ok(e.act('loz',{action:'sell',itemId:knife.id}).ok);assert.equal(e.accounts.loz.credits,47);
	assert.ok(e.act('loz',{action:'buy',itemType:'rod'}).ok);assert.equal(e.accounts.loz.credits,7);
	for(const itemType of ['__proto__','constructor','toString','bad'])assert.equal(e.act('loz',{action:'buy',itemType}).ok,false);
	assert.equal(e.act('loz',{action:'upgrade',key:'invalid'}).ok,false);
	e.disconnect('loz');assert.equal(e.owned('loz').length,0);assert.equal(e.accounts.loz,undefined);
});
test('offers expire; distance and recipient checks prevent remote acceptance',()=>{
	const e=setup();e.items[0].owner='loz';move(e,'loz',GENERAL_SHOP);move(e,'ed',GENERAL_SHOP);
	e.act('loz',{action:'offer',itemId:e.items[0].id,to:'ed',price:0},100000);
	assert.equal(e.act('loz',{action:'accept',offerId:e.offers[0].id},100001).ok,false);
	assert.equal(e.act('ed',{action:'accept',offerId:e.offers[0].id},160001).ok,false);
	assert.equal(e.offers.length,0);
});
