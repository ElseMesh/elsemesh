import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoStatus } from '../src/network/DemoStatus.js';
const origin='http://127.0.0.1:5192';
const sources={loz:{},ed:{}};
const event=(role,changes={})=>({origin,source:sources[role],data:{type:'elsemesh-network-demo-status',role,connected:true,verified:true,localSequence:2,remoteSequence:2,...changes}});
test('demo requires two live verified peers, and expires stale evidence',()=>{
  const s=new DemoStatus(origin,sources);
  assert.match(s.label(0),/Waiting/);
  assert.equal(s.observe(event('loz'),0),true);
  assert.match(s.label(0),/Waiting/);
  s.observe(event('ed',{verified:false}),0);
  assert.match(s.label(0),/Move Loz/);
  s.observe(event('ed'),0);
  assert.equal(s.label(100),'NETWORK VERIFIED · LOCAL ONLY');
  assert.match(s.label(2001),/lost or paused/);
});
test('demo rejects wrong origin, window, role, type and malformed state',()=>{
  const s=new DemoStatus(origin,sources);
  for(const e of [{...event('loz'),origin:'https://other.invalid'},{...event('loz'),source:{}},event('guest'),event('loz',{verified:'true'}),event('loz',{connected:null}),event('loz',{type:'other'}),event('loz',{localSequence:NaN}),event('loz',{remoteSequence:-2}),{origin,source:sources.loz,data:null}]) assert.equal(s.observe(e,0),false);
  assert.match(s.label(0),/Waiting/);
});
test('disconnect clears verified display and reconnect can requalify',()=>{
  const s=new DemoStatus(origin,sources);
  s.observe(event('loz'),0);s.observe(event('ed'),0);
  s.observe(event('ed',{connected:false}),100);
  assert.match(s.label(100),/lost or paused/);
  s.observe(event('ed'),200);
  assert.match(s.label(200),/VERIFIED/);
});
