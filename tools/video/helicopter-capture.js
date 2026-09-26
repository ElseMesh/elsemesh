// Developer capture: scripted inputs run the actual controllers and interaction gates.
// No boat/flight path teleportation. Start aboard the existing moored boat; film all subsequent travel.
export function recordHelicopterJourney(app=window.__app, {landingCheck=false}={}) {
 if(window.__heliJourney?.status==='recording')return;
 const result=window.__heliJourney={status:'recording',stage:'boat',events:[],elapsed:0};
 const p=app.player,b=app.boatCtl,h=app.thirdIsland,inp=app.input;
 app.engine.stop();app.freeCam=false;app.settings.clockMode='manual';app.settings.timeOfDay=15.6;app.settings.timeSpeed=0;app.settings.exposure=.58;
 p.enterBoat();p.camMode='third';p.orbitDist=14;p.orbitPitch=.3;
 let stage='boat',stageTime=0,total=0,routeIndex=0,keys=new Set(),axes={x:0,y:0,sprint:0},look={x:0,y:0};
 if(landingCheck){b.position.set(106.9,.09,536);b.velocity.set(0,0,0);b.angular.set(0,0,0);b.apply();stage='dock';result.checkOnly=true;}
 const route=[[64.5,65],[50,170],[80,360],[108,485],[108,532]];
 const walkRoute=[[111,543],[115,543],[115,564],[109,568.5]],padRoute=[[115,570],[115,622],[112,636]];
 const oldFrame=app.frame.bind(app),oldThird=h.update.bind(h),oldInput={moveAxes:inp.moveAxes,down:inp.down,consumeLook:inp.consumeLook};
 inp.moveAxes=()=>axes;inp.down=code=>keys.has(code);inp.consumeLook=()=>{const l=look;look={x:0,y:0};return l;};
 const change=next=>{result.events.push({stage:next,at:total,position:[p.position.x,p.position.y,p.position.z]});stage=next;stageTime=0;routeIndex=0;};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
 const walkTo=route=>{const [x,z]=route[routeIndex],dx=x-p.position.x,dz=z-p.position.z,d=Math.hypot(dx,dz);p.yaw=Math.atan2(-dx,-dz);axes.y=clamp(d*1.1,0,1);if(d<.6){if(++routeIndex===route.length)return true;}return false;};
 let caption='Departing the home island · boat controls and physics';
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
 const recorder=new MediaRecorder(canvas.captureStream(24),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6500000});const chunks=[];
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onstop=async()=>{await fetch('http://127.0.0.1:5191/video',{method:'POST',body:new Blob(chunks,{type:'video/webm'})});result.status=result.error?'failed':'saved';await fetch('http://127.0.0.1:5191/report',{method:'POST',body:JSON.stringify(result,null,2)});};
 const stop=(error=null)=>{result.error=error;result.status='saving';recorder.stop();app.frame=oldFrame;h.update=oldThird;Object.assign(inp,oldInput);};
 h.update=dt=>{oldThird(dt);if(['walk','keys','pad','board'].includes(stage)){
  const pos=p.position;app.camera.position.set(pos.x-5.5,pos.y+3.8,pos.z-6);app.camera.lookAt(pos.x,pos.y+1,pos.z+1.5);app.avatar.cinematic={mode:'shore',x:pos.x,y:pos.y,z:pos.z,yaw:p.yaw+Math.PI,walk:p.velocity.lengthSq()>.1};
 }else app.avatar.cinematic=null;};
 app.frame=dt=>{
  try{
   total+=dt;stageTime+=dt;result.elapsed=total;result.stage=stage;axes={x:0,y:0,sprint:0};keys.clear();
   if(total>360)throw Error('Journey exceeded six minutes; inspect route before publishing');
   if(stage==='boat'){
    const [x,z]=route[routeIndex],dx=x-b.position.x,dz=z-b.position.z,d=Math.hypot(dx,dz);
    const err=angle(Math.atan2(dx,dz)-b.getYaw());axes.x=-clamp(err*2.8-b.angular.y*3,-.65,.65);
    const speed=Math.hypot(b.velocity.x,b.velocity.z),want=routeIndex===route.length-1?clamp(d*.2,0,2.4):5.6;
    axes.y=clamp((want-speed)*.65+.35,-.5,1);keys.add('ShiftLeft');
    caption=total<20?'Leaving the jetty through open water':total<65?'Passing Godzilla on the way to Island 03':'Approaching the rental island landing';
    if(routeIndex<route.length-1&&d<10)routeIndex++;
    if(routeIndex===route.length-1&&d<2.7){change('dock');}
   }else if(stage==='dock'){
    caption='Moor alongside · leave the helm and step onto the jetty';axes.y=-.5;axes.x=-clamp(angle(-b.getYaw())*2-b.angular.y*3,-.5,.5);
    if(b.speed<.45){axes.y=0;const target=p.ashoreTarget();if(!target)throw Error('No safe landing point beside rental jetty');p.leaveHelm();p.exitBoat(target);change('walk');}
   }else if(stage==='walk'){
    caption="Walk ashore to Loz's Helicopter Rental";if(walkTo(walkRoute)){axes.y=0;change('keys');}
   }else if(stage==='keys'){
    caption=stageTime<2?'Meet Loz at the rental hut':'Loz: Here are your keys. Follow the path to the helipad.';
    p.yaw=Math.PI;if(stageTime>2&&!h.hasKey){if(!h.collectKey())throw Error('Key interaction rejected');}
    if(stageTime>6)change('pad');
   }else if(stage==='pad'){
    caption='Keys collected · walk to the neon helicopter';if(walkTo(padRoute)){axes.y=0;change('board');}
   }else if(stage==='board'){
    caption='Boarding the helicopter · key accepted';p.yaw=0;if(stageTime>2){if(!h.enter())throw Error('Helicopter boarding rejected');change('climb');}
   }else if(stage==='climb'){
    caption='Cockpit view · rotor spin-up and vertical take-off';keys.add('Space');
    if(h.state.y>65)change('fly');
   }else if(stage==='fly'){
    caption=stageTime>9&&stageTime<12?'Look through the left side window':stageTime>14&&stageTime<17?'Look through the right side window':'Flying back towards the home island';
    const s=h.state,dx=25-s.x,dz=-30-s.z,d=Math.hypot(dx,dz),desired=Math.atan2(-dx,-dz),err=angle(desired-s.yaw);
    look.x=-clamp(err,-dt*.35,dt*.35)/.0022;axes.y=clamp((d-6)/65,0,1);
    if(s.y<65)keys.add('Space');if(s.y>69)keys.add('KeyC');
    if(stageTime>9&&stageTime<12)keys.add('ArrowLeft');if(stageTime>14&&stageTime<17)keys.add('ArrowRight');
    if(d<25)change('arrive');
   }else if(stage==='arrive'){
    caption='Home island reached · hover above the beach and village';if(stageTime>5){canvas.toBlob(blob=>fetch('http://127.0.0.1:5191/image',{method:'POST',body:blob}),'image/png');stop();return;}
   }
   oldFrame(dt);
   ctx.drawImage(app.engine.domElement,0,0,1280,720);ctx.fillStyle='rgba(4,19,28,.82)';ctx.fillRect(0,0,1280,70);ctx.fillStyle='#effffb';ctx.font='bold 24px system-ui';ctx.fillText('BURNING HORIZONS · THIRD ISLAND',24,29);ctx.font='18px system-ui';ctx.fillText(caption,24,56);
   if(h.active){const s=h.state;ctx.fillStyle='#081f2be8';ctx.fillRect(310,650,660,55);ctx.fillStyle='#85ffdb';ctx.font='17px monospace';ctx.fillText(`LOZ AIR   ${Math.round(Math.hypot(s.vx,s.vz)*1.944)} kt   AGL ${Math.round(s.y-h.ground(s.x,s.z))} m   ROTOR ${Math.round(s.rpm*100)}%`,340,673);ctx.font='14px monospace';ctx.fillText('WASD fly · Space/C altitude · mouse steer · ← → side windows',340,694);}
  }catch(e){stop(e.message);}
 };
 recorder.start(1000);app.start();return result;
}
