import { BoxGeometry, CylinderGeometry, SphereGeometry, PlaneGeometry, TorusGeometry, Group, Mesh, Vector3, Euler } from '../engine/index.js';
import { Texture } from '../engine/gpu/Texture.js';
import { standard } from '../materials/Materials.js';
import { PlayerAvatar } from '../player/PlayerAvatar.js';
import { flightStep, canLeaveHelicopter } from '../player/HelicopterPhysics.js';
import { THIRD } from './ThirdIslandLayout.js';
import { secondIslandHeight } from './MonorailRoute.js';
import { createTreeBarkMaterial } from './vegetation/ScannedBark.js';
import { TreeWildlife } from './TreeWildlife.js';
import { PortalInterior } from './PortalInterior.js';
import { AbandonedWarehouse } from './AbandonedWarehouse.js';
import { fruitTreeCrownGeometry, fruitTreeLeafMaterial } from './vegetation/FruitTreeCrown.js';

const material = (name, color, extra = {}) => { const m = standard({ name, color, roughness: .65, ...extra }); m.underwaterLighting = 'none'; m.localLightsCheap = true; return m; };
const wood = material('Rental cedar', 0x75604a), dark = material('Helicopter charcoal', 0x17252c, { metalness: .5 });
const white = material('Pad markings', 0xf5eee0);
const neon = material('Neon coral helicopter', 0xff347f, { metalness: .35, roughness: .23, emissive: 0xff1262, emissiveIntensity: .65 });
const cyan = material('Navigation cyan', 0x4effe1, { emissive: 0x32ffd3, emissiveIntensity: 2.4 });
const gold = material('Rental brass key', 0xffc34b, { metalness: .65, emissive: 0xb87311, emissiveIntensity: .4 });
const instrument = material('Cockpit instrument faces',0x102b32,{emissive:0x174a4b,emissiveIntensity:.18});
const add = (parent, geometry, mat, x=0,y=0,z=0) => { const m = new Mesh(geometry, mat); m.position.set(x,y,z); m.castShadow=true; parent.add(m); return m; };
const box = (p,m,x,y,z,w,h,d) => add(p,new BoxGeometry(w,h,d),m,x,y,z);
function sign(parent, text, sub, x,y,z,w=7,h=1.6) {
 const c = document.createElement('canvas'); c.width=1024; c.height=256;
 const ctx=c.getContext('2d'); ctx.fillStyle='#102b31';ctx.fillRect(0,0,1024,256);
 ctx.strokeStyle='#69ffe0';ctx.lineWidth=9;ctx.strokeRect(12,12,1000,232);
 ctx.fillStyle='#fff0cd';ctx.textAlign='center';ctx.font='bold 64px sans-serif';ctx.fillText(text,512,112,950);
 ctx.fillStyle='#6effdf';ctx.font='32px sans-serif';ctx.fillText(sub,512,184,950);
 const texture=new Texture({label:'Rental sign',width:1024,height:256,data:ctx.getImageData(0,0,1024,256).data});
 const mat=material('Rental lettering',0xffffff,{textures:{rentalSign:texture},surface:'let ink = textureSample(rentalSign, smpAnisoClamp, vec2f(in.uv.x, 1.0-in.uv.y)).rgb; s.albedo=ink; s.emissive=ink*0.3;'});
 return add(parent,new PlaneGeometry(w,h),mat,x,y,z);
}

export class ThirdIslandSystem {
 constructor(app) {
  this.app=app; this.time=0;this.active=false;this.hasKey=false;this.pending=false;this.peek=0;this.lookPitch=0;
  this.group=new Group();this.group.name='Third island — Loz rental';app.scene.add(this.group);
  this.bark=createTreeBarkMaterial();
  this.leafGeometry=fruitTreeCrownGeometry();this.leafMaterial=fruitTreeLeafMaterial();
  this.trees=[];this.buildIsland();this.buildHelicopter();
  this.wildlife=new TreeWildlife(this.group,this.trees,this.bark);
  this.portalInterior=new PortalInterior(app);
  this.abandonedWarehouse=new AbandonedWarehouse(app);
  this.state={x:THIRD.pad.x,y:THIRD.pad.y+.25,z:THIRD.pad.z,yaw:0,vx:0,vy:0,vz:0,rpm:0,pitch:0,roll:0,grounded:true};
  this.resetPose();
  this.dialogue=document.createElement('div');this.dialogue.setAttribute('role','status');
  this.dialogue.style.cssText='display:none;position:fixed;z-index:1300;max-width:320px;padding:12px 16px;border-radius:14px;background:#f0ffff;color:#102b31;font:16px/1.4 system-ui;box-shadow:0 4px 18px #0008;pointer-events:none;transform:translate(-50%,-100%);';document.body.append(this.dialogue);
  this.greeted=false;this.greetingAt=-100;this.dialogueUntil=0;
  this.hud=document.createElement('div');this.hud.id='elsemesh-flight-hud';
  this.hud.style.cssText='display:none;position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#091e26e8;border:1px solid #63ffdd;border-radius:16px;padding:14px 22px;color:#baffec;font:14px monospace;text-align:center;z-index:1200;pointer-events:none;max-width:70vw;';document.body.append(this.hud);
 }
 ground(x,z) { return Math.max(0,this.app.terrainData.heightAt(x,z),secondIslandHeight(x,z),this.app.colliders.groundHeightAt(x,z,1000)); }
 buildIsland() {
  const {terrainData:T,colliders:C}=this.app, p=this.group;
  // Deep-water berth on the west side of the landing, clear of piles and the bow's approach.
  for(let z=529;z<569;z+=.6) { const y=Math.max(2.4,T.heightAt(115,z)+.15);box(p,wood,115,y-.12,z,3,.24,.56);C.addBox(new Vector3(115,y-.12,z),new Vector3(1.5,.12,.28),0,{walkable:true,solid:true,tag:'rental-jetty'}); }
  for(let z=530;z<567;z+=6)for(const x of [113.3,116.7])add(p,new CylinderGeometry(.15,.2,6,8),wood,x,0,z);
  // Lower west-side landing bridges the boat rail to the raised walkway.
  box(p,wood,114,1.25,538,9,.3,18);
  C.addBox(new Vector3(114,1.25,538),new Vector3(4.5,.15,9),0,{walkable:true,solid:true,tag:'rental-landing'});
  for(let i=0;i<5;i++){const x=111.5+i*.6,y=1.4+i*.25;box(p,wood,x,y-.10,543,.62,.2,3);C.addBox(new Vector3(x,y-.1,543),new Vector3(.31,.1,1.5),0,{walkable:true,solid:true,tag:'rental-steps'});}
  for(let z=574;z<630;z+=7) {box(p,wood,118,T.heightAt(118,z)+.5,z,.14,1,.14);box(p,cyan,118,T.heightAt(118,z)+1,z,.3,.12,.3);}
  const hy=T.heightAt(105,575);this.hutY=hy;
  for(const x of [101.4,108.6])for(const z of [572.7,577.3]){const low=T.heightAt(x,z);box(p,wood,x,(low+hy)/2,z,.24,hy-low+.2,.24);}
  box(p,wood,105,hy+1.65,575,8,3.3,5);
  C.addBox(new Vector3(105,hy+1.65,575),new Vector3(4,1.65,2.5),0,{solid:true,tag:'rental-hut'});
  // Counter and open serving hatch face the jetty (north).
  box(p,dark,105,hy+1.75,572.46,5.6,1.3,.12);
  box(p,wood,105,hy+.95,571.9,6,.2,1.3);
  for(let x=101;x<=109;x+=.38)box(p,dark,x,hy+1.7,572.42,.025,3.2,.025);
  const roof=box(p,dark,105,hy+3.55,575,9,.25,6);roof.rotation.x=.10;
  sign(p,"Loz's Helicopter Rental",'KEYS • FLIGHT BRIEFING • ISLAND 03',105,hy+3.15,571.84,8.4,1.7).rotation.y=Math.PI;
  // Rotate sign to face north; correct its placement and readable orientation.
  this.loz=new PlayerAvatar(this.app.scene,this.app.boatCtl,{character:'scanned-explorer'});
  this.loz.cinematic={x:108.5,y:T.heightAt(108.5,570.5),z:570.5,yaw:Math.PI,walk:false};
  this.key=add(p,new TorusGeometry(.12,.035,8,16),gold,108.2,this.loz.cinematic.y+1.1,570);
  box(this.key,gold,0,-.2,0,.05,.25,.04);box(this.key,gold,.055,-.29,0,.12,.045,.04);
  // Flat central clearing and lit helipad.
  add(p,new CylinderGeometry(10,10,.22,64),dark,115,7.91,638);
  for(const x of [-1.8,1.8])box(p,white,115+x,8.035,638,.48,.035,5);
  box(p,white,115,8.035,638,3.6,.035,.48);
  this.padLamps = [0,1].map(i => material('Helipad beacon '+i,0x62ffe1,{emissive:0x32ffd3,emissiveIntensity:5}));
  for(let i=0;i<20;i++){const a=i*Math.PI/10;add(p,new SphereGeometry(.20,10,8),this.padLamps[i%2],115+9.2*Math.cos(a),8.2,638+9.2*Math.sin(a));}
  for(let i=0;i<51;i++){
   const a=i*2.39996,r=44+(i%7)*6;
   const groves=[[106,592],[124,606],[105,618]], near=groves[i-48];
   const x=near?near[0]:115+Math.cos(a)*r,z=near?near[1]:650+Math.sin(a)*r*.82;
   if(x>118&&x<172&&z>585&&z<634)continue;
   if(Math.abs(x-115)<9 && z<640 || Math.hypot(x-105,z-575)<13)continue;
   const y=T.heightAt(x,z);if(y<2)continue;
   const g=new Group();g.position.set(x,y,z);p.add(g);
   const height=6+(i%5)*.7, joints=[], crowns=[];let parent=g;
   // Nested trunk sections keep the root fixed while curvature increases toward the crown.
   for(let j=0;j<10;j++){const joint=new Group();joint.position.y=j?height/10:0;parent.add(joint);joints.push(joint);
    const geometry=new CylinderGeometry(.34-(j+1)*.022,.34-j*.022,height/10+.035,10);
    const uv=geometry.attributes.uv;for(let v=0;v<uv.count;v++)uv.array[v*2+1]=(j+uv.array[v*2+1])*height/15;
    add(joint,geometry,this.bark,0,height/20,0);parent=joint;}
   for(let k=0;k<5;k++){const crown=add(parent,this.leafGeometry,this.leafMaterial,Math.cos(k*1.26)*1.1,height/10-.8+k*.19,Math.sin(k*1.26));crown.scale.set(2.6,1.2,1.8);crown.rotation.y=k*1.26;crowns.push(crown);}
   this.trees.push({root:g,joints,crowns});
   C.addCylinder(x,z,.5,y,y+height,{tag:'rental-tree'});
  }
  add(p,new CylinderGeometry(.06,.1,7,8),white,132,11.5,638);
  this.sock=new Group();this.sock.position.set(132,15,638);p.add(this.sock);
  for(let i=0;i<6;i++){const sock=add(this.sock,new CylinderGeometry(.48-i*.055,.53-i*.055,.45,12,1,true),i%2?white:neon,i*.43,0,0);sock.rotation.z=Math.PI/2;}
 }
 buildHelicopter() {
  const g=this.helicopter=new Group();g.name='Neon helicopter';this.app.scene.add(g);
  // +Z is aft; pilot looks -Z through an unobstructed windshield and side windows.
  const belly=add(g,new SphereGeometry(1,24,14),neon,0,.8,.15);belly.scale.set(1.25,.72,2.15);
  box(g,dark,0,1.02,0,2.1,.14,3.4);
  box(g,neon,0,2.85,.1,2.3,.20,3.45);
  box(g,dark,0,2.735,.1,2.16,.035,3.3);
  box(g,neon,0,1.65,1.7,2.3,2.1,.18);
  for(const x of [-1.08,1.08]){
   for(const z of [-1.48,.2,1.5])box(g,dark,x,2.02,z,.09,1.65,.09);
   box(g,neon,x,1.26,-.05,.16,.36,3.1);box(g,cyan,x,1.49,-.05,.035,.04,2.9);
   box(g,dark,x*1.15,.1,.1,.13,.17,4.6);
   for(const z of [-1,1])box(g,dark,x,.55,z,.10,.9,.10);
  }
  box(g,dark,0,2.08,-1.57,.08,1.52,.10);
  box(g,dark,0,1.45,-1.13,1.85,.42,.55); // instruments below windshield
  for(const x of [-.56,0,.56]) {const gauge=add(g,new CylinderGeometry(.17,.17,.035,20),instrument,x,1.62,-.81);gauge.rotation.x=Math.PI/2;box(g,white,x,1.64,-.78,.025,.2,.02);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,white,x+Math.sin(a)*.13,1.62+Math.cos(a)*.13,-.78,.016,.016,.016);}}
  for(const x of [-.52,.52]) {box(g,dark,x,1.25,.2,.65,.22,.65);box(g,dark,x,1.7,.56,.65,.8,.16);box(g,dark,x,1.44,-.33,.05,.5,.05);box(g,dark,x,1.68,-.33,.22,.06,.05);}
  const boom=add(g,new CylinderGeometry(.16,.45,4.7,12),neon,0,1.8,4);boom.rotation.x=Math.PI/2;
  box(g,neon,0,2.4,6,.16,1.9,1.3);box(g,cyan,0,1.8,5.7,2.4,.08,.6);
  add(g,new CylinderGeometry(.10,.15,.75,12),dark,0,3.22,.15);
  this.rotor=new Group();this.rotor.position.set(0,3.65,.15);g.add(this.rotor);
  for(const angle of [0,Math.PI/2]){const blade=box(this.rotor,dark,0,0,0,10.5,.055,.24);blade.rotation.y=angle;}
  this.tailRotor=new Group();this.tailRotor.position.set(.24,2.6,6);g.add(this.tailRotor);
  box(this.tailRotor,white,0,0,0,.06,1.7,.13);box(this.tailRotor,white,0,0,0,.06,.13,1.7);
  add(g,new SphereGeometry(.12,8,6),cyan,-1.15,2.8,1);add(g,new SphereGeometry(.12,8,6),neon,1.15,2.8,1);
 }
 resetPose() {const s=this.state;this.helicopter.position.set(s.x,s.y,s.z);this.helicopter.quaternion.setFromEuler(new Euler(s.pitch,s.yaw,s.roll,'YXZ'));}
 collectKey() {
  const p=this.app.player, n=this.loz.cinematic;
  if(p.mode!=='walk'||Math.hypot(p.position.x-n.x,p.position.z-n.z)>3.4||Math.abs(p.position.y-n.y)>2.5)return false;
  if(!this.hasKey){this.hasKey=true;this.key.visible=false;this.network?.('key');}
  this.greeted=true;this.greetingAt=this.time;
  this.sayLoz('keys','Here are the keys. You need to fly to Rocket Island. Follow the lights to the helipad.');return true;
 }
 sayLoz(id,text) {
  if(this.lastDialogue===id&&this.time<this.dialogueUntil-5)return;
  this.lastDialogue=id;this.dialogueUntil=this.time+10;
  if(this.voice){this.voice.pause();this.voice=null;}
  this.dialogue.textContent='Loz: '+text;this.toast('Loz: '+text);
  if(this.app.audio&&!this.app.audio.muted){
   const voice=this.voice=new Audio((import.meta.env.BASE_URL||'/')+'audio/loz-rental/'+id+'.wav');
   voice.volume=.9;voice.play().catch(()=>{}); // Captions remain if browser audio is blocked.
  }
 }
 updateLozDialogue() {
  const p=this.app.player,n=this.loz.cinematic,d=Math.hypot(p.position.x-n.x,p.position.z-n.z);
  if(d>12)this.greeted=false;
  if(!this.app.freeCam&&p.mode==='walk'&&d<5.5&&Math.abs(p.position.y-n.y)<2.5&&!this.greeted&&this.time-this.greetingAt>45){
   this.greeted=true;this.greetingAt=this.time;
   this.sayLoz(this.hasKey?'keys':'greeting',this.hasKey?'Here are the keys. You need to fly to Rocket Island. Follow the lights to the helipad.':"Hello! Welcome to Loz's Helicopter Rental. Come over and I'll give you the keys.");
  }
  if(this.voice)this.voice.volume=this.app.audio?.muted?0:Math.max(0,1-d/18)*.9;
  const point=new Vector3(n.x,n.y+2.1,n.z).project(this.app.camera);
  const visible=this.time<this.dialogueUntil&&d<18&&point.z>-1&&point.z<1&&Math.abs(point.x)<1&&Math.abs(point.y)<1;
  this.dialogue.style.display=visible?'block':'none';
  if(visible){this.dialogue.style.left=(point.x+1)*innerWidth/2+'px';this.dialogue.style.top=(1-point.y)*innerHeight/2+'px';}
 }
 toast(t){this.app.ui?.ui.toast(t);this.lastMessage=t;}
 enter() {
  const p=this.app.player,s=this.state;
  if(this.active||p.mode!=='walk'||Math.hypot(p.position.x-s.x,p.position.z-s.z)>4.8||Math.abs(p.position.y-s.y)>2)return false;
  if(!this.hasKey){this.toast('Locked — collect your helicopter key from Loz at the rental hut.');return false;}
  if(this.network && !this.granted){if(!this.pending){this.pending=true;this.network('claim');}return false;}
  this.active=true;this.pending=false;p.mode='helicopter';p.velocity.set(0,0,0);this.app.pistol.equipped=false;
  this.peek=0;this.lookPitch=-.10;this.toast('Rotor starting · Space ascend · C descend · WASD fly · mouse heading · ← / → side windows');return true;
 }
 exit() {
  const s=this.state;if(!this.active)return false;
  if(!canLeaveHelicopter(s)||this.app.terrainData.heightAt(s.x,s.z)<0){this.toast('Land on dry, level ground and stop before leaving.');return false;}
  const p=this.app.player,x=s.x+Math.cos(s.yaw)*3.3,z=s.z-Math.sin(s.yaw)*3.3;
  this.active=false;p.mode='walk';p.position.set(x,p.groundAt(x,z,s.y+2),z);p.velocity.set(0,0,0);p.grounded=true;p.yaw=s.yaw;p.pitch=0;p._camY=null;
  this.hud.style.display='none';this.network?.('release');this.granted=false;return true;
 }
 update(dt) {
  this.time+=dt;const {player:p,input:inp,camera}=this.app,s=this.state;
  for(let i=0;i<this.trees.length;i++){const tree=this.trees[i];for(let j=0;j<tree.joints.length;j++){const flex=j/9;tree.joints[j].rotation.z=flex*(-.045+Math.sin(this.time*1.7+i*.4-j*.18)*.023+Math.sin(this.time*.7)*.016);tree.joints[j].rotation.x=flex*Math.sin(this.time*1.3+i*.7-j*.12)*.013;}for(let k=0;k<tree.crowns.length;k++)tree.crowns[k].rotation.z=Math.sin(this.time*3+i+k)*.055;}
  this.wildlife.update(dt,camera.position);
  for(let i=0;i<2;i++){const phase=(this.time+i*.65)%1.3;this.padLamps[i].emissiveIntensity=phase<.12||(phase>.22&&phase<.34)?8:.3;}
  this.sock.rotation.y=.25+Math.sin(this.time*1.7)*.13;this.sock.rotation.z=Math.sin(this.time*4)*.05;
  this.loz.update(dt,p,camera,true);this.key.rotation.y+=dt;
  this.updateLozDialogue();
  this.portalInterior.update(dt);
  this.abandonedWarehouse.update(dt);
  if(this.active){
   const look=inp.consumeLook(dt);s.yaw-=look.x*.0022;s.yaw=Math.atan2(Math.sin(s.yaw),Math.cos(s.yaw));this.lookPitch=Math.max(-.6,Math.min(.5,this.lookPitch-look.y*.0022));
   const axes=inp.moveAxes();
   const obstruction=(x,y,z,nx,nz)=>{const v=new Vector3(nx-x,0,nz-z),d=v.length();if(d<1e-6)return false;v.multiplyScalar(1/d);if(this.app.colliders.raycast(new Vector3(x,y,z),v,d+2)<d+2)return true;return this.app.colliders.cylinders.some(c=>y+2>c.yMin&&y-1<c.yMax&&Math.hypot(nx-c.x,nz-c.z)<c.radius+2);};
   flightStep(s,{active:true,x:axes.x,forward:axes.y,lift:(inp.down('Space')?1:0)-(inp.down('KeyC')?1:0),boost:inp.down('ShiftLeft')},dt,(x,z)=>this.ground(x,z),obstruction);
   this.resetPose();p.position.set(s.x,s.y,s.z);p.velocity.set(s.vx,s.vy,s.vz);p.yaw=s.yaw;p.prompt={key:'E',text:s.grounded?'Leave helicopter':'Land before leaving'};
   this.peek+=(((inp.down('ArrowLeft')?1:0)-(inp.down('ArrowRight')?1:0))*Math.PI/2-this.peek)*(1-Math.exp(-dt*8));
   camera.position.copy(this.helicopter.localToWorld(new Vector3(-.48,2.22,-.04)));
   camera.quaternion.copy(this.helicopter.quaternion).multiply(new (camera.quaternion.constructor)().setFromEuler(new Euler(this.lookPitch,this.peek,0,'YXZ')));
   this.hud.style.display='block';this.hud.innerHTML=`<b>LOZ AIR · ISLAND HOPPER</b><br>IAS ${Math.round(Math.hypot(s.vx,s.vz)*1.944)} kt &nbsp; AGL ${Math.round(s.y-this.ground(s.x,s.z))} m &nbsp; HDG ${((s.yaw*-180/Math.PI+360)%360).toFixed(0)}° &nbsp; ROTOR ${Math.round(s.rpm*100)}%<br><small>WASD fly · mouse steer · Space ↑ · C ↓ · Shift boost · ← → look · E exit when landed</small>`;
   if(inp.hit('KeyE'))this.exit();
  }else{
   if(!this.remoteOwner)s.rpm+=(0-s.rpm)*(1-Math.exp(-dt*.8));
   this.resetPose();this.hud.style.display='none';
   if(!this.app.freeCam&&p.mode==='walk'){
    const n=this.loz.cinematic;
    if(Math.hypot(p.position.x-n.x,p.position.z-n.z)<3.4){p.prompt={key:'E',text:this.hasKey?'Talk to Loz':'Get helicopter keys from Loz'};if(inp.hit('KeyE'))this.collectKey();}
    else if(Math.hypot(p.position.x-s.x,p.position.z-s.z)<4.8&&Math.abs(p.position.y-s.y)<2){p.prompt={key:'E',text:this.remoteOwner?'Helicopter in use':this.hasKey?'Board helicopter':'Helicopter locked — see Loz'};if(inp.hit('KeyE'))this.enter();}
   }
  }
  this.rotor.rotation.y+=dt*s.rpm*42;this.tailRotor.rotation.x+=dt*s.rpm*65;
 }
}
