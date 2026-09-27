import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WebSocket} from 'ws';
import {createOnlineServer} from '../tools/networking/online-server.mjs';
import {makeState} from '../src/network/PlayerProtocol.js';

test('real room sockets serialize competing pickups and barter; late join observes owner',async()=>{
	const service=await createOnlineServer({root:process.cwd(),port:0}), sockets=[];
	const origin=`http://127.0.0.1:${service.address.port}`, room='f'.repeat(32);
	const connect=async(role)=>{
		const ws=new WebSocket(`${origin.replace('http','ws')}/ws?room=${room}&role=${role}${role==='loz'?`&hostKey=${'a'.repeat(32)}`:''}`,{origin});sockets.push(ws);
		const messages=[];ws.on('message',b=>messages.push(JSON.parse(b.toString())));
		await new Promise((ok,no)=>{ws.once('open',ok);ws.once('error',no);});
		return {ws,messages,send:p=>ws.send(JSON.stringify(p)),wait:async(fn)=>{const until=Date.now()+2000;while(Date.now()<until){const i=messages.findIndex(fn);if(i>=0)return messages.splice(i,1)[0];await new Promise(ok=>setTimeout(ok,5));}throw Error('Expected packet missing');}};
	};
	try{
		const a=await connect('loz'), b=await connect('ed');
		for(const [c,role,letter] of [[a,'loz','a'],[b,'ed','b']])c.send({type:'state',state:makeState({playerId:`player:${role}`,nodeId:`bh-node:${letter.repeat(64)}`,sequence:1,player:{position:{x:56,y:1,z:-79},yaw:0,mode:'walk',velocity:{lengthSq:()=>0}}})});
		a.send({type:'economy-action',action:'pickup',itemId:'beach-rod'});b.send({type:'economy-action',action:'pickup',itemId:'beach-rod'});
		const ar=await a.wait(p=>p.type==='economy-result'),br=await b.wait(p=>p.type==='economy-result');assert.equal(Number(ar.ok)+Number(br.ok),1);
		const winner=ar.ok?a:b,loser=ar.ok?b:a,from=ar.ok?'loz':'ed',to=ar.ok?'ed':'loz';
		winner.send({type:'economy-action',action:'offer',itemId:'beach-rod',to,price:0});
		const snapshot=await loser.wait(p=>p.type==='economy'&&p.offers.length===1);const offer=snapshot.offers[0];assert.equal(offer.from,from);
		loser.send({type:'economy-action',action:'accept',offerId:offer.id});assert.ok((await loser.wait(p=>p.type==='economy-result'&&p.action==='accept')).ok);
		const guest=await connect('guest'),late=await guest.wait(p=>p.type==='economy');assert.equal(late.items.find(i=>i.id==='beach-rod').owner,to);
		loser.send({type:'economy-action',action:'accept',offerId:offer.id});assert.equal((await loser.wait(p=>p.type==='economy-result'&&p.action==='accept')).ok,false);
	}finally{for(const ws of sockets)ws.terminate();await service.close();}
});
