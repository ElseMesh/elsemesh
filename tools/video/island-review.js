// Local visual review, not a gameplay traversal: positions/camera are choreographed.
export function recordIslandReview(a=window.__app) {
 const out=document.createElement('canvas');out.width=1280;out.height=720;
 const ctx=out.getContext('2d'),chunks=[],rec=new MediaRecorder(out.captureStream(20),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5500000});
 const result=window.__review={status:'recording'},old=a.frame.bind(a);let t=0,last=-1;
 a.engine.stop();a.setFreeCam(true);a.settings.clockMode='manual';a.settings.timeOfDay=15;
 rec.ondataavailable=e=>chunks.push(e.data);
 rec.onstop=async()=>{await fetch('http://127.0.0.1:5192/video',{method:'POST',body:new Blob(chunks,{type:'video/webm'})});result.status='saved';};
 a.frame=dt=>{
  t+=dt;const stage=Math.floor(t/6);
  if(stage!==last){last=stage;
   if(stage===0)a.fly.setPose(a.camera.position.set(150,8,755),-.3,-.28);
   if(stage===1){const n=a.thirdIsland.loz.cinematic;a.fly.setPose(a.camera.position.set(n.x,n.y+1.2,n.z-4.6),Math.PI,-.03);}
   if(stage===4){a.avatar.cinematic=null;a.settings.timeOfDay=20.2;a.fly.setPose(a.camera.position.set(105,13,620),3.62,-.2);}
  }
  if(stage===2||stage===3){const z=590+(t-stage*6)*(stage===2?1.1:2.8),x=115,y=a.terrainData.heightAt(x,z);a.avatar.cinematic={x,y,z,yaw:0,walk:true,speed:stage===2?3:6};a.fly.setPose(a.camera.position.set(x-4,y+1.4,z+3),-.9273,-.07);}
  old(dt);
  // WebGPU clears the presented buffer; copy immediately after rendering.
  ctx.drawImage(a.engine.domElement,0,0,1280,720);ctx.fillStyle='#081e2be8';ctx.fillRect(0,658,1280,62);ctx.fillStyle='white';ctx.font='24px sans-serif';
  ctx.fillText(['Third island — breaking surf','Loz — original KIRI scan, Blender rig','Player walk — animation review','Player run — animation review','Wind-bent trees and flashing helipad beacons'][Math.min(stage,4)],28,696);
  if((stage===0||stage===1)&&t-stage*6>4&&!result['image'+stage]){result['image'+stage]=true;out.toBlob(blob=>fetch('http://127.0.0.1:5192/'+(stage===0?'surf':'loz'),{method:'POST',body:blob}));}
  if(t>=30){a.frame=old;a.avatar.cinematic=null;rec.stop();}
 };
 rec.start(1000);a.start();return result;
}
