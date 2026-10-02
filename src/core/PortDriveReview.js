import { findRoadRoute, routePose } from '../world/PortRoadGraph.js';

// Review harness only: feeds ordinary input, never writes pose, speed or collision state.
export function driveCommand(pose, speed, target) {
    const dx = target.x-pose.x, dz = target.z-pose.z;
    const distance = Math.hypot(dx,dz);
    let delta = Math.atan2(Math.sin(Math.atan2(dx,dz)-pose.yaw), Math.cos(Math.atan2(dx,dz)-pose.yaw));
    const reverse = distance < 18 && Math.abs(delta)>2.25;
    if(reverse) delta=-Math.atan2(Math.sin(Math.atan2(-dx,-dz)-pose.yaw),Math.cos(Math.atan2(-dx,-dz)-pose.yaw));
    const desired = distance < 13 || Math.abs(delta) > .3 ? 2.8 : 7.5;
    return { distance, keys: [delta > .055 ? 'KeyD' : delta < -.055 ? 'KeyA' : null,
        reverse ? (speed < -3.5 ? 'Space' : speed > -2.5 ? 'KeyS' : null) :
            speed > desired+.7 ? 'Space' : speed < desired-.3 ? 'KeyW' : null].filter(Boolean) };
}

export function reviewRoute() {
    const result=[];
    for(let loop=1;loop<=3;loop++) {
        result.push({label:`loop${loop}:start-to-checkpoint`,x:694,z:492});
        const nodes=['checkpoint','gate','circle','warehouse','service','depot','east','quay','yard','checkpoint'];
        for(let i=0;i<nodes.length-1;i++) for(const step of findRoadRoute(nodes[i],nodes[i+1])) {
            for(const fraction of [.22,.48,.72,.88]) result.push({
                label:`loop${loop}:${step.from}-${step.to}:${fraction}`, ...routePose(step,fraction,1.65) });
        }
        result.push({label:`loop${loop}:return-to-start`,x:700,z:480});
    }
    return result;
}

export function installPortDriveReview(app) {
    const panel=document.createElement('section');
    panel.setAttribute('aria-label','Automated driving review');
    panel.style.cssText='position:fixed;top:100px;left:20px;z-index:10000;background:#18232aee;color:white;padding:8px;max-width:580px;font:12px monospace';
    const start=document.createElement('button'); start.textContent='Run three-loop driving review';
    const stop=document.createElement('button'); stop.textContent='Stop driving review';
    const output=document.createElement('output'); output.setAttribute('aria-label','Driving review results');
    output.style.display='block';output.textContent='Automated input test. Enter parked sedan first. Not a release verdict.';
    panel.append(start,stop,output); document.body.append(panel);
    let active=false,held=[],report,route,index=0,previous,still=0,lastControl=0,waypointStart=0,lastFrame=0,recoveryUntil=0,recoveries=0;
    const release=()=>{for(const key of held)app.input.keys.delete(key);held=[];};
    const publish=()=>{output.dataset.raw=JSON.stringify(report);output.textContent=`${report.outcome} | ${index}/${route.length} waypoints | ${route[index]?.label??'complete'} | ${report.rows.length} samples`;};
    const finish=reason=>{release();active=false;report.outcome=reason;report.finishedAt=new Date().toISOString();start.disabled=false;publish();};
    start.onclick=()=>{
        if(active)return;
        const port=app.portIsland;
        if(!port?.driving || Math.hypot(port.playerCar.position.x-700,port.playerCar.position.z-480)>4) {
            output.textContent='BLOCKED: enter the sedan at the start parking position first.';return;
        }
        route=reviewRoute();index=0;still=0;previous=null;lastControl=lastFrame=0;recoveryUntil=0;recoveries=0;waypointStart=performance.now();
        report={schema:'bracken.automated-input-review/v1',outcome:'RUNNING',startedAt:new Date().toISOString(),
            method:'Review UI feeds normal Input.keys; unmodified driving physics and collisions; no pose injection',
            asset:port.vehicleAssetStatus,route,rows:[],frames:[],arrivals:[],recoveries:[]};
        active=true;start.disabled=true;publish();
    };
    stop.onclick=()=>{if(active)finish('CANCELLED_BY_REVIEW_CONTROL');};
    window.addEventListener('keydown',()=>{if(active)finish('CANCELLED_BY_KEYBOARD');});
    window.addEventListener('blur',()=>{if(active)finish('CANCELLED_WINDOW_BLUR');});
    document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)finish('CANCELLED_HIDDEN');});
    const frame=now=>{
        requestAnimationFrame(frame);if(!active)return;
        if(lastFrame)report.frames.push(now-lastFrame);lastFrame=now;
        if(now-lastControl<100)return;lastControl=now;
        const p=app.portIsland,car=p.playerCar;
        if(!p.driving||!app.input.enabled){finish('FAIL:driving_or_input_disabled');return;}
        const pose={x:car.position.x,z:car.position.z,yaw:car.rotation.y};
        const command=driveCommand(pose,p.speed,route[index]);
        if(now<recoveryUntil)command.keys=p.speed < -2 ? ['Space'] : ['KeyS'];
        report.rows.push({at:now,waypoint:index,pose,speed:p.speed,steer:p.steer,keys:command.keys,
            heapBytes:performance.memory?.usedJSHeapSize??null,
            renderSize:[app.sceneRenderer.width,app.sceneRenderer.height],
            traffic:p.traffic.cars.map(c=>({id:c.id,kind:c.kind,...c.pose,speed:c.speed,trips:c.trips}))});
        if(command.distance<3.8){
            report.arrivals.push({at:now,label:route[index].label,pose});index++;waypointStart=now;still=0;previous=null;recoveries=0;
            release();if(index===route.length){finish('THREE_LOOPS_OBSERVED_AUTOMATED_INPUT');return;}publish();return;
        }
        if(previous&&Math.hypot(pose.x-previous.x,pose.z-previous.z)<.05)still++;else still=0;
        previous=pose;
        // Ordinary collision recovery: reverse straight briefly and let crossing
        // traffic clear. Never teleport or suppress collisions; retries bounded.
        if(still>15 && now>=recoveryUntil && recoveries<3){
            recoveryUntil=now+2200;recoveries++;still=0;
            report.recoveries.push({at:now,waypoint:index,pose,action:'reverse-and-yield',attempt:recoveries});
            command.keys=['KeyS'];
        }
        if(still>50){finish(`FAIL:stalled:${route[index].label}`);return;}
        if(now-waypointStart>45000){finish(`FAIL:waypoint_timeout:${route[index].label}`);return;}
        release();held=command.keys;for(const key of held)app.input.keys.add(key);
        output.textContent=`RUNNING automated input | ${route[index].label} | speed ${p.speed.toFixed(2)} m/s | ${command.distance.toFixed(1)} m to waypoint`;
    };requestAnimationFrame(frame);
}
