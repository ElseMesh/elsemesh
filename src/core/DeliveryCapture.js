// Records actual game pixels; no rendered reenactment or synthetic frames.
export function recordDelivery(app, button) {
  const cargo=app.portIsland?.cargoScene, source=app.engine.domElement;
  if(!cargo?.vehicle || !source || cargo.collected){button.textContent='Delivery capture unavailable';return;}
  button.disabled=true;cargo.sequence.reset();cargo.sequence.start();
  // Review clip begins with landed cargo. The full arrival remains available separately.
  cargo.sequence.seconds=90;cargo.update(0);
  let recorder,started=0,chunks=[];
  const frame=()=>{
    if(cargo.sequence.seconds>=90 && !recorder){
      const mime=['video/webm;codecs=vp9','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      recorder=new MediaRecorder(source.captureStream(30),{mimeType:mime,videoBitsPerSecond:10000000});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>{
        for(const track of recorder.stream.getTracks())track.stop();
        const blob=new Blob(chunks,{type:recorder.mimeType}),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download='ElseMesh-Sedan-Delivery.'+(recorder.mimeType.includes('mp4')?'mp4':'webm');a.click();
        setTimeout(()=>URL.revokeObjectURL(url),60000);button.disabled=false;button.textContent='Record sedan delivery';
      };
      recorder.start(1000);started=performance.now();
    }
    if(recorder){
      button.textContent='Recording actual browser pixels…';
      if(cargo.sequence.pose.complete && performance.now()-started>27000){recorder.stop();return;}
    } else button.textContent='Waiting for cargo landing…';
    requestAnimationFrame(frame);
  };requestAnimationFrame(frame);
}
