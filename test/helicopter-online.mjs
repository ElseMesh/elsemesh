import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from './RoomTestSocket.mjs';
import { createOnlineServer } from '../tools/networking/online-server.mjs';
import { makeState } from '../src/network/PlayerProtocol.js';
import { initialHelicopter } from '../src/network/HelicopterLease.js';
const receive=(s,predicate)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>{s.off('message',f);reject(Error('timeout'));},2000);const f=b=>{const p=JSON.parse(b);if(predicate(p)){clearTimeout(t);s.off('message',f);resolve(p);}};s.on('message',f);});
test('online guest can collect key and pilot; competing claim denied; disconnect returns craft',async()=>{
 const server=await createOnlineServer({port:0,root:process.cwd()}),origin=`http://127.0.0.1:${server.address.port}`,sockets=[];
 const connect=async role=>{const s=new WebSocket(`${origin.replace('http','ws')}/ws?room=${'e'.repeat(32)}&role=${role}`,{origin});sockets.push(s);await new Promise(r=>s.once('open',r));return s;};
 try{
  const a=await connect('ed'),b=await connect('guest');let sequence=0;
  const pose=(socket,role,x,y,z,extra={})=>{const state=makeState({playerId:`player:${role}`,nodeId:`elsemesh-node:${(role==='ed'?'a':'b').repeat(64)}`,sequence:sequence++,player:{position:{x,y,z},velocity:{lengthSq:()=>0},yaw:0,mode:'walk'}});socket.send(JSON.stringify({type:'state',state:{...state,...extra}}));};
  const action=async(s,action)=>{const response=receive(s,p=>p.type==='helicopter-result'&&p.action===action);s.send(JSON.stringify({type:'helicopter-action',action}));return (await response).accepted;};
  pose(a,'ed',108.5,4.63,570.5);assert.equal(await action(a,'key'),true);
  pose(b,'guest2',108.5,4.63,570.5);assert.equal(await action(b,'key'),true);
  pose(a,'ed',112,8,638);assert.equal(await action(a,'claim'),true);
  pose(b,'guest2',112,8,638);assert.equal(await action(b,'claim'),false);
  const flight=receive(b,p=>p.type==='helicopter'&&p.state.y===40);
  pose(a,'ed',115,40,638,{mode:'helicopter',helicopter:{...initialHelicopter(),y:40,grounded:false,rpm:1}});assert.equal((await flight).owner,'ed');
  assert.equal(await action(a,'release'),false);
  const returned=receive(b,p=>p.type==='helicopter'&&p.owner===null);a.close();assert.equal((await returned).state.y,8.25);
 }finally{for(const s of sockets)s.terminate();await server.close();}
});
