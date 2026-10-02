// Agent Control: scripted walkthrough of the real movement, boat, rail and helicopter controllers.
// Initial boarding, full hunger, locked door and encounter restart are recording fixtures.
// All subsequent travel uses controller inputs; the game's station lifts retain their transitions.
export async function recordSusie(a=window.__app, {resume=null,waypoint=0}={}) {
 const p=a.player,b=a.boatCtl,h=a.thirdIsland,m=a.monorail,i=a.input,k=a.kaiju;
 a.engine.stop();a.freeCam=false;a.settings.clockMode='manual';a.settings.timeOfDay=15;a.settings.timeSpeed=0;
 a.avatar.cinematic=null;p.camMode='third';p.orbitDist=14;p.orbitPitch=.28;
 if(!resume){p.enterBoat();k.elapsed=0;
 a.needs.hunger=100;a.caves.doorState='locked';a.caves.doorElapsed=0;
 for(const mesh of a.caves.doorMeshes)mesh.position.y=0;a.caves.finalDoorCollider.solid=true;}
 const report=window.__susie={status:'recording',stage:'emergence',events:[],samples:[],name:p.displayName,appearance:p.avatarAppearance};
 const before={frame:a.frame.bind(a),third:h.update.bind(h),kaiju:k.update.bind(k),emit:a.spray.emit.bind(a.spray),moveAxes:i.moveAxes,down:i.down,hit:i.hit,consumeLook:i.consumeLook};
 let stage=resume||'emergence',t=0,total=0,index=waypoint,axes={x:0,y:0,sprint:0},keys=new Set(),hits=new Set(),look={x:0,y:0},inKaiju=false,drips=0,queue=Promise.resolve(),chunk=0,caption='',stopped=false;
 const started=performance.now();
 const clamp=(v,l,u)=>Math.max(l,Math.min(u,v)),angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
 const caveBoat=[[64.5,66],[25,95],[-95,125],[-175,190],[-180,310],[-345,320],[-450,230],[-480,115],[-485,88],[-462,65],[-425,65],[-388,80],[-350,82],[-323,83.5]];
 const caveWalk=[[-319,81],[-308,81],[-306,76],[-290,68],[-275,62],[-260,53],[-245,45],[-231,39],[-220,29],[-215,20],[-219,2],[-220,-6]];
 const rentalBoat=[[-430,65],[-465,65],[-485,90],[-470,160],[-430,250],[-340,340],[-170,365],[20,385],[108,450],[108,490],[108,532]];
 const rentalWalk=[[111,543],[115,543],[115,564],[109,568.5]],padWalk=[[115,570],[115,622],[112,636]];
 const next=s=>{report.events.push({stage:s,time:total,videoTime:(performance.now()-started)/1000,position:[p.position.x,p.position.y,p.position.z]});stage=s;t=0;index=0;hits.clear();axes={x:0,y:0,sprint:0};};
 report.navigate=(s,n=0)=>{next(s);index=n;};
 const walk=route=>{if(index>=route.length)return true;const [x,z]=route[index],dx=x-p.position.x,dz=z-p.position.z,d=Math.hypot(dx,dz);const want=Math.atan2(-dx,-dz);p.yaw+=clamp(angle(want-p.yaw),-.10,.10);axes.y=d<.8?0:clamp(d,0,1);if(d<.8&&++index===route.length)return true;return false;};
 const boat=route=>{
  const [x,z]=route[index],dx=x-b.position.x,dz=z-b.position.z,d=Math.hypot(dx,dz),err=angle(Math.atan2(dx,dz)-b.getYaw());
  const final=index===route.length-1;const want=final?clamp(d*.22,0,2.2):Math.max(2.3,5.6*(1-Math.min(.65,Math.abs(err)*.45)));
  axes.x=-clamp(err*2.8-b.angular.y*3,-.65,.65);axes.y=clamp((want-b.speed)*.65+.35,-.65,1);keys.add('ShiftLeft');
  if(Math.abs(err)>.6){axes.x=-Math.sign(err);axes.y=b.speed>1.6?-.25:.16;}
  if(!final&&d<11)index++;if(final&&d<2.5)return true;return false;
 };
 const interact=()=>hits.add('KeyE');
 i.moveAxes=()=>axes;i.down=code=>keys.has(code);i.hit=code=>hits.has(code);i.consumeLook=()=>{const v=look;look={x:0,y:0};return v;};
 a.spray.emit=(pos,vel,...args)=>{if(inKaiju&&vel.y<0)drips+=args[0];return before.emit(pos,vel,...args);};
 k.update=dt=>{drips=0;inKaiju=true;try{before.kaiju(dt);}finally{inKaiju=false;}};
 h.update=dt=>{before.third(dt);
  if(stage==='emergence'){const q=k.pose;a.camera.position.set(q.x+36,12,q.z-55);a.camera.lookAt(q.x,q.feet+15,q.z);}
  else if(stage==='proof'){const q=k.pose;a.camera.position.set(q.x+35,15,q.z-40);a.camera.lookAt(q.x,q.feet+16,q.z);}
  else if(['cave-walk','cave-return','rental-walk','keys','pad','board','door'].includes(stage)){
   const q=p.position;a.camera.position.set(q.x+Math.sin(p.yaw)*4,q.y+2.5,q.z+Math.cos(p.yaw)*4);a.camera.lookAt(q.x,q.y+1,q.z);
   a.avatar.cinematic={x:q.x,y:q.y,z:q.z,yaw:p.yaw+Math.PI,walk:p.velocity.lengthSq()>.1,speed:3};
  }else a.avatar.cinematic=null;
 };
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
 await fetch('http://127.0.0.1:5193/start',{method:'POST'});
 const recorder=new MediaRecorder(canvas.captureStream(20),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5e6});
 recorder.ondataavailable=e=>{if(e.data.size){const n=chunk++;queue=queue.then(()=>fetch(`http://127.0.0.1:5193/chunk/${n}`,{method:'POST',body:e.data})).then(r=>{if(!r.ok)throw Error('Capture write failed');});}};
 recorder.onstop=async()=>{try{await queue;report.status=report.error?'failed':'saved';await fetch('http://127.0.0.1:5193/report',{method:'POST',body:JSON.stringify(report,null,2)});}catch(e){report.status='failed';report.error=String(e);}};
 const stop=error=>{if(stopped)return;stopped=true;report.error=error||null;report.elapsed=total;report.status='saving';recorder.stop();a.frame=before.frame;h.update=before.third;k.update=before.kaiju;a.spray.emit=before.emit;for(const key of ['moveAxes','down','hit','consumeLook'])i[key]=before[key];a.avatar.cinematic=null;a.engine.stop();};
 report.stop=()=>stop('Stopped for inspection');
 a.frame=dt=>{
  try{
   dt=Math.min(dt,.05);t+=dt;total+=dt;report.elapsed=total;report.stage=stage;report.routeIndex=index;report.position=[p.position.x,p.position.y,p.position.z];report.boat=[b.position.x,b.position.z,b.speed];axes={x:0,y:0,sprint:0};keys.clear();hits.clear();
   if(total>1800)throw Error('Journey exceeded 30 simulation minutes');
   if(stage==='emergence'){caption='Godzilla emerges · watch the initial body runoff';if(t>38)next('cave-boat');}
   else if(stage==='cave-boat'){caption='Susie at the helm · sailing around the headland to UNDERNEATH';if(boat(caveBoat))next('cave-dock');}
   else if(stage==='cave-dock'){caption='Stop afloat · leave the helm and jump into shallow water';axes.y=-.6;if(b.speed<.4){p.leaveHelm();p.exitBoat(null,1);next('splash');}}
   else if(stage==='splash'){caption='Susie splashes into the water · the boat stays afloat';if(t>3)next('cave-walk');}
   else if(stage==='cave-walk'){caption='Wade up the ramp · walk through the cave';if(walk(caveWalk))next('door');}
   else if(stage==='door'){caption='Electronic entry · the station door slides into the ceiling';if(a.caves.doorState==='locked')interact();if(a.caves.doorState==='open'&&t>4)next('station-entry');}
   else if(stage==='station-entry'){caption='Walk to the waiting monorail';if(walk([[-219,-26]])){interact();if(p.position.y<-10)next('board-A');}}
   else if(stage==='board-A'){caption='Station A · board for Island 02';if(walk([[-251,-24]]))interact();if(m.state==='riding')next('rail-out');}
   else if(stage==='rail-out'){caption='Underwater glass tunnel · travelling to Island 02';if(m.state==='station')next('station-B');}
   else if(stage==='station-B'){caption='Station B reached · preparing the return journey';if(t>4)next('board-B');}
   else if(stage==='board-B'){caption='Boarding the return monorail';if(walk([[-1140,-24]]))interact();if(m.state==='riding')next('rail-back');}
   else if(stage==='rail-back'){caption='Return through the glass tunnel to UNDERNEATH';if(m.state==='station')next('station-exit');}
   else if(stage==='station-exit'){caption='Back at Station A · return to the cave';if(t>2){interact();if(p.position.y>0)next('cave-return');}}
   else if(stage==='cave-return'){caption='Walk back to Susie’s waiting boat';if(walk([[-219,2],...caveWalk.slice(0,-2).reverse(),[-323,81]]))next('reboard');}
   else if(stage==='reboard'){caption='Climb aboard and take the helm';if(t>2){if(Math.hypot(p.position.x-b.position.x,p.position.z-b.position.z)>7)throw Error('Too far from boat to reboard');p.enterBoat();next('reverse-cave');}}
   else if(stage==='reverse-cave'){caption='Reverse out of the cave before turning in open water';axes.y=-.65;axes.x=clamp(angle(Math.PI/2-b.getYaw())*2,-.35,.35);if(b.position.x < -390)next('rental-boat');}
   else if(stage==='rental-boat'){caption='Sail to Island 03 · Loz’s Helicopter Rental';if(boat(rentalBoat))next('rental-dock');}
   else if(stage==='rental-dock'){caption='Moor alongside the rental island jetty';axes.y=-.6;if(b.speed<.4){const target=p.ashoreTarget();if(!target)throw Error('No safe rental jetty landing');p.leaveHelm();p.exitBoat(target);next('rental-walk');}}
   else if(stage==='rental-walk'){caption='Meet Loz at the rental hut';if(walk(rentalWalk))next('keys');}
   else if(stage==='keys'){caption='Loz: Here are your keys · fly to Rocket Island';if(t>2&&!h.hasKey){if(!h.collectKey())throw Error('Key interaction rejected');}if(t>6)next('pad');}
   else if(stage==='pad'){caption='Susie walks to the flashing helipad';if(walk(padWalk))next('board');}
   else if(stage==='board'){caption='Enter the neon helicopter · key accepted';if(t>2){if(!h.enter())throw Error('Helicopter entry rejected');next('climb');}}
   else if(stage==='climb'){caption='Cockpit view · rotor spin-up and take-off';keys.add('Space');if(h.state.y>48)next('fly');}
   else if(stage==='fly'||stage==='circle'){
    const s=h.state,q=k.pose;let x=q.x,z=q.z+80;
    if(stage==='circle'){const theta=clamp(t/52,0,1)*Math.PI*2;x=q.x+Math.sin(theta)*75;z=q.z+Math.cos(theta)*75;}
    const dx=x-s.x,dz=z-s.z,d=Math.hypot(dx,dz),err=angle(Math.atan2(-dx,-dz)-s.yaw);
    look.x=-clamp(err,-dt*.45,dt*.45)/.0022;axes.y=clamp(d/60,.1,1);if(s.y<45)keys.add('Space');if(s.y>49)keys.add('KeyC');
    caption=stage==='fly'?'Flying back to Godzilla · Susie in the cockpit':'Circling Godzilla · body runoff has ended';
    if(stage==='fly'&&d<28)next('circle');if(stage==='circle'){keys.add('ArrowLeft');if(t>55)next('proof');}
   }else if(stage==='proof'){
    caption='Close inspection · no new water falling from the head or shoulders';
    // Exterior inspection camera only; helicopter remains under its real hover physics.
    if(t>12){if(report.samples.slice(-10).some(s=>s.bodyRunoff>0))throw Error('Runoff continued during final proof');canvas.toBlob(blob=>fetch('http://127.0.0.1:5193/proof',{method:'POST',body:blob}));stop();return;}
   }
   before.frame(dt);
   if(Math.floor(total)!==report.lastSample){report.lastSample=Math.floor(total);report.samples.push({time:total,stage,bodyRunoff:drips,kaijuTime:k.elapsed,feet:k.pose.feet});}
   ctx.drawImage(a.engine.domElement,0,0,1280,720);ctx.fillStyle='#071b2be8';ctx.fillRect(0,0,1280,72);ctx.fillStyle='#edfff9';ctx.font='bold 23px system-ui';ctx.fillText('ELSEMESH · SUSIE’S JOURNEY',24,29);ctx.font='17px system-ui';ctx.fillText(caption,24,55);
   ctx.fillStyle='#071b2bcc';ctx.fillRect(0,684,1280,36);ctx.fillStyle='#b9e6de';ctx.font='14px monospace';ctx.fillText(`Scripted walkthrough · actual game controllers | ${stage} | body runoff emitted this frame: ${drips}`,20,707);
  }catch(e){stop(e.message);}
 };
 recorder.start(1000);a.start();return report;
}
