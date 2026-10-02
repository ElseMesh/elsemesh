import { THIRD } from '../world/ThirdIslandLayout.js';
export const initialHelicopter = () => ({x:THIRD.pad.x,y:THIRD.pad.y+.25,z:THIRD.pad.z,yaw:0,vx:0,vy:0,vz:0,rpm:0,pitch:0,roll:0,grounded:true});
export function validateHelicopter(s) {
 if(!s||!['x','y','z','yaw','vx','vy','vz','rpm','pitch','roll'].every(k=>Number.isFinite(s[k]))||Math.abs(s.x)>5000||Math.abs(s.z)>5000||s.y<0||s.y>451||Math.abs(s.yaw)>Math.PI+.01||Math.hypot(s.vx,s.vz)>60||Math.abs(s.vy)>12||s.rpm<0||s.rpm>1.001||Math.abs(s.pitch)>.4||Math.abs(s.roll)>.4||typeof s.grounded!=='boolean')throw Error('Invalid helicopter');
 return s;
}
export class HelicopterLease {
 constructor(){this.owner=null;this.state=initialHelicopter();this.keys=new Set();}
 action(role,action,player){
  if(action==='release'&&this.owner===role&&this.state.grounded&&Math.hypot(this.state.vx,this.state.vz)<.7){this.owner=null;return true;}
  if(!player||player.mode!=='walk')return false;
  const [x,y,z]=player.position;
  if(action==='key'&&Math.hypot(x-108.5,z-570.5)<3.5){this.keys.add(role);return true;}
  if(action==='claim'&&!this.owner&&this.keys.has(role)&&Math.hypot(x-this.state.x,z-this.state.z)<4.9&&Math.abs(y-this.state.y)<2.1){this.owner=role;return true;}
  return false;
 }
 update(role,state){if(this.owner!==role)return false;this.state={...validateHelicopter(state)};return true;}
 disconnect(role){this.keys.delete(role);if(this.owner===role){this.owner=null;this.state=initialHelicopter();}}
 packet(){return {type:'helicopter',owner:this.owner,state:this.state};}
}
