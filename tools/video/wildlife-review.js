// Agent Control: in-engine inspection video; camera cuts are staged, tree/wildlife animation is live.
import {Vector3} from '../../src/engine/index.js';
import {branchPoint} from '../../src/world/vegetation/TreeBranch.js';
export function wildlifeView(app,shot) {
	const m=app.thirdIsland.wildlife.monkeys[0], anchor=m.anchor.getWorldPosition(new Vector3());
	let target=m.anchor.localToWorld(branchPoint(.55).add(new Vector3(0,.6,0))), eye;
	if(shot==='wide')eye=anchor.clone().add(new Vector3(-5,-1,9));
	else if(shot==='bark'){target=anchor.clone().add(new Vector3(0,-2,0));eye=target.clone().add(new Vector3(1.6,.1,1.5));}
	else if(shot==='bananas') {
		const b=app.vegetation.records.bananas.find(b=>b.x===127&&b.z===603);
		const c=Math.cos(b.yaw),s=Math.sin(b.yaw);
		target=new Vector3(b.x+.58*c+.06*s,b.y+1.72,b.z-.58*s+.06*c);
		eye=target.clone().add(new Vector3(1.6*c+.3*s,.02,-1.6*s+.3*c));
	} else eye=target.clone().add(new Vector3(-.6,.5,5));
	const d=target.clone().sub(eye);app.fly.setPose(eye,Math.atan2(-d.x,-d.z),Math.atan2(d.y,Math.hypot(d.x,d.z)));app.fly.velocity.set(0,0,0);
}
export async function recordWildlife(app=window.__app) {
	app.engine.stop();app.monorail.state='station';app.thirdIsland.active=false;app.player.mode='walk';
	app.settings.clockMode='manual';app.settings.timeOfDay=13;app.settings.timeSpeed=0;app.setQuality('balanced');app.setFreeCam(true);
	window.__bench.setSize(1280,720);
	app.thirdIsland.wildlife.time=0;
	const out=document.createElement('canvas');out.width=1280;out.height=720;const ctx=out.getContext('2d');
	const stream=out.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6500000});
	const status=window.__wildlifeReview={status:'recording',seconds:0,shot:'wide'};
	let last=performance.now(),start=last,previous='';
	const finish=new Promise(resolve=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=resolve;});
	recorder.start();
	await new Promise((resolve,reject)=>{
		const timer=setInterval(()=>{try {
			const now=performance.now(),t=(now-start)/1000,dt=Math.min(.08,(now-last)/1000);last=now;
			const shot=t<10?'wide':t<34?'monkeys':t<45?'bananas':'bark';status.shot=shot;status.seconds=t;
			if(shot!==previous){wildlifeView(app,shot);for(let i=0;i<12;i++)app.frame(0);previous=shot;}
			app.frame(dt);ctx.drawImage(app.engine.canvas,0,0,1280,720);
			ctx.fillStyle='#071920d9';ctx.fillRect(24,650,1232,48);ctx.fillStyle='#f5f1da';ctx.font='22px sans-serif';
			ctx.fillText({wide:'Third island · wind-bent trees and fruiting branches',monkeys:'Animated canopy monkeys · branch patrol, turning and wind attachment',bananas:'Banana bunches · curved fruit in four hands around the stalk',bark:'Scanned bark · colour, surface relief and roughness'}[shot],42,682);
			if(t>=50){clearInterval(timer);resolve();}
		}catch(e){clearInterval(timer);reject(e);}},1000/30);
	});
	recorder.stop();await finish;stream.getTracks().forEach(t=>t.stop());
	const blob=new Blob(chunks,{type:'video/webm'});await fetch('http://127.0.0.1:5193/review.webm',{method:'POST',body:blob});status.status='complete';status.bytes=blob.size;
	return status;
}
export async function wildlifeShot(name,app=window.__app) {
	wildlifeView(app,name);for(let i=0;i<40;i++)app.frame(0);
	const c=document.createElement('canvas');c.width=app.engine.canvas.width;c.height=app.engine.canvas.height;c.getContext('2d').drawImage(app.engine.canvas,0,0);
	const blob=await new Promise(resolve=>c.toBlob(resolve));await fetch(`http://127.0.0.1:5193/${name}.png`,{method:'POST',body:blob});
}
