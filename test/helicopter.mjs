import test from 'node:test';
import assert from 'node:assert/strict';
import { flightStep, canLeaveHelicopter } from '../src/player/HelicopterPhysics.js';
import { HelicopterLease, initialHelicopter, validateHelicopter } from '../src/network/HelicopterLease.js';
import { thirdIslandHeight } from '../src/world/ThirdIslandLayout.js';
test('island leaves home and cave outside its footprint; clearing is level',()=>{assert.equal(thirdIslandHeight(55,36),-90);assert.equal(thirdIslandHeight(-300,80),-90);assert.equal(thirdIslandHeight(115,638),8);assert.ok(thirdIslandHeight(110,530)<-3);});
test('flight spools up, climbs, moves forward and lands without frame-dependent jumps',()=>{
 const run=hz=>{const s=initialHelicopter();for(let i=0;i<hz*10;i++)flightStep(s,{active:true,x:0,forward:.5,lift:1},1/hz,()=>8);return s;};
 const a=run(30),b=run(120);assert.ok(a.y>45);assert.ok(a.z<570);assert.ok(Math.abs(a.z-b.z)<.2);assert.equal(canLeaveHelicopter(a),false);
 for(let i=0;i<2400;i++)flightStep(a,{active:true,x:0,forward:0,lift:-1},1/120,()=>8);
 assert.equal(a.y,8.25);assert.equal(canLeaveHelicopter(a),true);
});
test('terrain obstruction stops horizontal travel without climbing a cliff',()=>{const s={...initialHelicopter(),rpm:1,y:12,z:10};for(let i=0;i<600;i++)flightStep(s,{active:true,x:0,forward:1,lift:0},1/120,(x,z)=>z<0?80:8);assert.ok(s.z>=2);assert.equal(s.y,12);});
test('key proximity, exclusive pilot, safe release and disconnected pilot recovery',()=>{
 const l=new HelicopterLease(),atPad={mode:'walk',position:[115,8,638]},atLoz={mode:'walk',position:[108.5,8,570.5]};
 assert.equal(l.action('ed','claim',atPad),false);assert.equal(l.action('ed','key',atPad),false);
 assert.equal(l.action('ed','key',atLoz),true);assert.equal(l.action('loz','key',atLoz),true);
 assert.equal(l.action('ed','claim',atPad),true);assert.equal(l.action('loz','claim',atPad),false);
 assert.equal(l.update('loz',initialHelicopter()),false);l.update('ed',{...initialHelicopter(),grounded:false,y:30});
 assert.equal(l.action('ed','release',null),false);l.disconnect('ed');assert.equal(l.owner,null);assert.equal(l.state.y,8.25);
 assert.equal(l.action('loz','claim',atPad),true);assert.equal(l.action('loz','release',null),true);
 assert.throws(()=>validateHelicopter({...initialHelicopter(),y:NaN}));
});
