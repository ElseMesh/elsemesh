// Animation review: stock avatar, front and side, in the actual game renderer.
export function recordStockReview(a=window.__app){
 const out=document.createElement('canvas');out.width=1280;out.height=720;
 const ctx=out.getContext('2d'),chunks=[],rec=new MediaRecorder(out.captureStream(20),{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5500000});
 const result=window.__stockReview={status:'recording'},old=a.frame.bind(a);let t=0,saved=false;
 a.engine.stop();a.setFreeCam(true);a.settings.clockMode='manual';a.settings.timeOfDay=15;
 rec.ondataavailable=e=>chunks.push(e.data);
 rec.onstop=async()=>{await fetch('http://127.0.0.1:5192/stock-video',{method:'POST',body:new Blob(chunks,{type:'video/webm'})});result.status='saved';};
 a.frame=dt=>{
  t+=dt;const phase=Math.floor(t/6),run=phase>=2,side=phase%2===1,speed=run?2.88:1.01;
  const x=115,z=590+(t%6)*speed,y=a.terrainData.heightAt(x,z);
  a.avatar.cinematic={x,y,z,yaw:0,walk:true,speed:run?6:3};
  a.fly.setPose(a.camera.position.set(x+(side?3.5:0),y+1.05,z+(side?0:3.5)),side?Math.PI/2:0,-.03);
  old(dt);ctx.drawImage(a.engine.domElement,0,0,1280,720);
  ctx.fillStyle='#081e2be8';ctx.fillRect(0,658,1280,62);ctx.fillStyle='white';ctx.font='23px sans-serif';
  ctx.fillText(`Stock player · Rocketbox Male Adult 08 · ${run?'run':'walk'} · ${side?'side':'front'} view`,24,696);
  if(t>4&&!saved){saved=true;out.toBlob(blob=>fetch('http://127.0.0.1:5192/stock-image',{method:'POST',body:blob}));}
  if(t>=24){a.frame=old;a.avatar.cinematic=null;rec.stop();}
 };rec.start(1000);a.start();return result;
}
