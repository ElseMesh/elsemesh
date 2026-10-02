import { Vector3 } from '../engine/math/index.js';
import { PORT_NODES } from '../world/PortRoadGraph.js';
import {recordDelivery} from './DeliveryCapture.js';
import {installPortDriveReview} from './PortDriveReview.js';
import {installPortGraphicsReview} from './PortGraphicsReview.js';

// Named review cameras used to check every change from the same set of angles.
// window.__view( name ) jumps there; window.__views lists them.
export const VIEWS = {
    portDepotInterior: { p:[838,6.85,333],yaw:0,pitch:-.04,time:10 },
    portDepotBreaker: { p:[826,6.8,311.4],yaw:Math.PI,pitch:-.08,time:10 },
    portWorkshop: { p:[649,7,359],yaw:0,pitch:.02,time:10 },
    portWarehouse: { p:[659,7,496],yaw:Math.PI,pitch:.02,time:10 },
    portUtilities: { p:[764,7,337],yaw:0,pitch:0,time:10 },
    portCargoDelivery: { p: [748,8,579],yaw:-.965,pitch:-.13,time:16.4 },
    portIvyBuildingNormal: { p: [648, 7.1, 323], yaw: Math.PI, pitch: .03, time: 10 },
    portIvyBuildingClose: { p: [655.5, 6.9, 335], yaw: Math.PI, pitch: .02, time: 10 },
    portIvyFenceNormal: { p: [666.7, 6.9, 401], yaw: Math.PI, pitch: -.1, time: 10 },
    portIvyFenceClose: { p: [666.7, 6.6, 406.1], yaw: Math.PI, pitch: -.04, time: 10 },
	// Agent Control: reproducible UNDERNEATH and double-glass inspection cameras.
	cave: { p: [-322, 3, 80], yaw: -Math.PI / 2, pitch: 0, time: 16.2 },
	tunnel: { p: [-650, -14.45, -30], yaw: 0.5, pitch: 0, time: 16.2 },
	beach: { p: [ 15, 3.0, - 58 ], yaw: Math.PI, pitch: - 0.08, time: 16.2 },
	surf: { p: [ 12, 1.7, - 44 ], yaw: Math.PI + 0.25, pitch: - 0.02, time: 16.2 },
	surfSide: { p: [ 40, 2.2, - 36 ], yaw: Math.PI * 0.62, pitch: - 0.08, time: 10.5 },
	swash: { p: [ 10, 1.6, - 49 ], yaw: Math.PI + 0.1, pitch: - 0.35, time: 16.2 },
	sunGlitter: { p: [ 0, 12, 120 ], yaw: Math.PI * 0.5, pitch: - 0.1, time: 16.2 },
	deepBlue: { p: [ 0, 3, 200 ], yaw: - Math.PI * 0.5, pitch: - 0.06, time: 12.5 },
	aerial: { p: [ 60, 95, 140 ], yaw: Math.PI * 0.08, pitch: - 0.55, time: 15.0 },
	shallowSeabed: { p: [ 8, 1.6, - 30 ], yaw: Math.PI, pitch: - 0.75, time: 13.0 },
	underwater: { p: [ - 70, - 2.5, 50 ], yaw: Math.PI * 0.8, pitch: 0.25, time: 13.0 },
	waterline: { p: [ 5, 0.02, - 10 ], yaw: Math.PI, pitch: 0.0, time: 14.0 },
	sunset: { p: [ 20, 2.5, - 50 ], yaw: Math.PI * 1.35, pitch: 0.02, time: 18.35 },
	sunsetWest: { p: [ 20, 2.5, - 50 ], yaw: 2.02, pitch: 0.03, time: 18.05 },
	pier: { p: [ 75, 4, - 10 ], yaw: Math.PI * 1.15, pitch: - 0.1, time: 15.5 },
	boatSearchlights: { p: [ 64.5, 4.8, 26 ], yaw: Math.PI, pitch: - 0.18, time: 22.0 },
	village: { p: [ 62, 7, - 62 ], yaw: 0.34, pitch: - 0.12, time: 15.5 },
	// from the pier over the shallows, looking down (refraction near the bottom edge of the screen)
	pierShallows: { p: [ 53.4, 3.92, 5 ], yaw: 1.2, pitch: - 0.45, time: 9.0 },
	pierShallowsE: { p: [ 56.6, 3.92, 5 ], yaw: - 1.2, pitch: - 0.45, time: 16.5 },
	// looking at the sun from the beach, a little off axis (lens flare, sun disc); lookSun: aimed once the sky has updated
	sunFlare: { p: [ 15, 3.0, - 58 ], yaw: 0, pitch: 0, time: 11.0, lookSun: [ 0.18, - 0.08 ] },
	// at the waterline looking down toward the sun over the swash film (its edge on the wet sand)
	swashFilm: { p: [ 10, 1.7, - 44 ], yaw: 0, pitch: 0, time: 16.2, lookSun: [ - 0.5, - 1.0 ] },
	swashFilmE: { p: [ 30, 1.7, - 39 ], yaw: 0, pitch: 0, time: 16.2, lookSun: [ - 0.5, - 0.9 ] },
	// from above the beach: the back edge of the swash sheet in the backwash (Dan's view)
	swashAbove: { p: [ 46.08, 23.35, - 53.27 ], yaw: 1.87, pitch: - 0.57, time: 16.2 },
	palms: { p: [ - 30, 3.2, - 58 ], yaw: Math.PI * 0.42, pitch: - 0.1, time: 9.5 },
	tHeadW: { p: [ - 150, 6, 40 ], yaw: 1.156, pitch: 0.02, time: 15.0 },
	tLowSun: { p: [ 60, 95, 140 ], yaw: Math.PI * 0.08, pitch: - 0.35, time: 17.6 },
	tValley: { p: [ 35, 16, - 175 ], yaw: 0.1, pitch: 0.12, time: 10.0 },
	tSummit: { p: [ - 60, 300, - 470 ], yaw: Math.PI * 1.02, pitch: - 0.35, time: 16.0 },
	tStacks: { p: [ - 240, 8, 300 ], yaw: 0.15, pitch: - 0.05, time: 16.5 },
	tCove: { p: [ - 160, 2.2, - 30 ], yaw: 1.35, pitch: - 0.08, time: 10.5 },
	tMorning: { p: [ 18, 3.0, - 60 ], yaw: 0.2, pitch: 0.05, time: 7.2 },
	// Agent Control: hidden Building #001 evidence cameras. `portal` only reveals
	// the isolated interior while this explicit review view is active.
	portalLoft: { p: [ 313, 20, 292 ], yaw: 2.29, pitch: 0.04, time: 17.1, portal: true },
	portalMezzanine: { p: [ 299, 22.6, 308.2 ], yaw: 1.80, pitch: - 0.04, time: 17.1, portal: true },
	// Island Four: approach from the open ocean and inspect the villa at the
	// far forest edge without disturbing gameplay state.
	islandFourVilla: { p: [ - 500, 13.5, 758 ], yaw: 0, pitch: - 0.12, time: 16.4 },
	islandFourAerial: { p: [ - 430, 92, 770 ], yaw: - 0.72, pitch: - 0.58, time: 16.4 },
	islandFiveForest: { p: [ - 800, 38, 520 ], yaw: 0, pitch: - 0.2, time: 15.2 },
	portGate: { p: [ 632, 9, 417 ], yaw: - 1.3, pitch: - .08, time: 16.4 },
	portCargo: { p: [ 794, 11, 565 ], yaw: 2.2, pitch: -.17, time: 16.4 },
	portCargoWide: { p: [ 813, 48, 648 ], yaw: .6, pitch: -.48, time: 16.4 },
	portCargoClose: { p: [ 748, 7.2, 583 ], yaw: Math.PI, pitch: -.04, time: 16.4 },
	portAerial: { p: [ 745, 105, 560 ], yaw: .15, pitch: - .55, time: 16.4 },
	portWorkingAerial: { p: [ 760, 125, 280 ], yaw: Math.PI, pitch: - .57, time: 16.4 },
	portDepot: { p: [ 838, 8, 347 ], yaw: Math.PI, pitch: - .04, time: 16.4 },
	portCar: { p: [ 698, 7.2, 479 ], yaw: 2.6, pitch: - .12, time: 16.4 },
	portSedanFront: { p: [696, 6.8, 486], yaw: -.588, pitch: -.14, time: 16.4 },
	portSedanRear: { p: [704, 6.8, 474], yaw: 2.553, pitch: -.14, time: 16.4 },
	portSedanSide: { p: [706, 6.8, 483], yaw: 1.107, pitch: -.13, time: 16.4 },
	portSedanFrontClose: { p: [698.1, 6.75, 483.7], yaw: -.474, pitch: -.34, time: 16.4 },
	portSedanRearClose: { p: [701.9, 6.75, 476.3], yaw: 2.668, pitch: -.34, time: 16.4 },
	portSedanFrontQuarter: { p: [694, 6.8, 481], yaw: -1.406, pitch: -.14, time: 16.4 },
	portSedanRearQuarter: { p: [706, 6.8, 479], yaw: 1.736, pitch: -.14, time: 16.4 },
	portSedanDusk: { p: [694, 6.8, 481], yaw: -1.406, pitch: -.14, time: 20.1 },
};

for (const node of Object.values(PORT_NODES)) VIEWS[`portJunction-${node.id}`] = {
	p: [node.x + 20, 24, node.z + 25], yaw: Math.atan2(20, 25),
	pitch: -Math.atan2(24 - 5.16, Math.hypot(20, 25)), time: 10,
};

export function installDebugViews( app ) {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('graphicsReview')) installPortGraphicsReview(app);
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('driveReview')) installPortDriveReview(app);
    if (new URLSearchParams(location.search).get('view')?.startsWith('portCargo')) {
        const panel=document.createElement('div');
        panel.style.cssText='position:fixed;top:95px;left:20px;z-index:10000;background:#18232aee;color:white;padding:10px;font:13px sans-serif';
        const start=document.createElement('button');start.textContent='Start cargo arrival';
        const reset=document.createElement('button');reset.textContent='Reset cargo trial';
        const status=document.createElement('output');status.setAttribute('aria-label','Cargo trial status');
        status.style.cssText='display:block;max-width:560px';
        let samples=[],previous=0;
        // rAF timestamps can precede a click event's performance.now(); prime on
        // the next frame rather than recording a negative first interval.
        start.onclick=()=>{if(app.portIsland?.cargoScene.sequence.start()){samples=[];previous=0;}};
        reset.onclick=()=>{app.portIsland?.cargoScene.sequence.reset();samples=[];previous=0;};
        panel.append(start,reset,status);document.body.append(panel);
        const record=document.createElement('button');record.textContent='Record sedan delivery';
        record.onclick=()=>recordDelivery(app,record);panel.append(record);
        const update=now=>{
            const seq=app.portIsland?.cargoScene.sequence;
            if(seq){
                if(seq.running&&previous&&now>previous)samples.push(now-previous);
                previous=now;
                const sorted=[...samples].sort((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)];
                const report={phase:seq.pose.phase,seconds:+seq.seconds.toFixed(2),running:seq.running,
                    samples:samples.length,medianFPS:sorted.length?+(1000/q(.5)).toFixed(2):null,
                    p10FPS:sorted.length?+(1000/q(.9)).toFixed(2):null,
                    p90FPS:sorted.length?+(1000/q(.1)).toFixed(2):null,
                    minimumFPS:sorted.length?+(1000/sorted.at(-1)).toFixed(2):null,
                    longFrames:samples.filter(t=>t>50).length,hidden:document.hidden,
                    heapBytes:performance.memory?.usedJSHeapSize??null};
                status.textContent=JSON.stringify(report);status.dataset.raw=JSON.stringify({...report,intervals:samples});
                start.disabled=seq.running;
            }
            requestAnimationFrame(update);
        };requestAnimationFrame(update);
    }
    if (new URLSearchParams(location.search).get('view')?.startsWith('portIvy')) {
        const label = document.createElement('label');
        label.style.cssText = 'position:fixed;left:16px;top:90px;z-index:10000;background:#14201eee;color:white;padding:10px';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox'; toggle.setAttribute('aria-label', 'Show trial ivy');
        toggle.addEventListener('change', () => { if (app.portIsland?.ivyGroup) app.portIsland.ivyGroup.visible = toggle.checked; });
        label.append(toggle, ' Show trial ivy — isolated, not release-qualified');
        document.body.append(label);
        const measure = document.createElement('button');
        measure.textContent = 'Measure ivy comparison (20 seconds)';
        label.append(document.createElement('br'), measure);
        const result = document.createElement('output');
        result.setAttribute('aria-label', 'Ivy measurement');
        result.style.cssText = 'display:block;max-width:680px;font-size:11px;white-space:normal';
        label.append(result);
        measure.onclick = () => {
            measure.disabled = true; result.textContent = 'Measuring actual frame intervals…';
            const frames = [], start = performance.now(); let previous = start;
            const sample = now => {
                frames.push(now - previous); previous = now;
                if (now - start < 20000) { requestAnimationFrame(sample); return; }
                const sorted = [...frames].sort((a,b) => a-b);
                const percentile = p => sorted[Math.floor((sorted.length - 1) * p)];
                const canvas = document.querySelector('canvas');
                const report = { ivy: toggle.checked, durationMs: now-start,
                    frames: frames.length, medianFrameMs: percentile(.5), p90FrameMs: percentile(.9),
                    medianFPS: 1000/percentile(.5), p10FPS: 1000/percentile(.9),
                    longFramesOver50ms: frames.filter(x=>x>50).length,
                    maxFrameMs: sorted.at(-1), hidden: document.hidden,
                    canvas: [canvas?.width, canvas?.height],
                    ivyLoad: performance.getEntriesByType('resource').filter(x=>x.name.includes('ivy-trial/')).map(x=>({name:x.name.split('/').at(-1),durationMs:x.duration,bytes:x.transferSize})),
                    intervalsMs: frames };
                result.dataset.raw = JSON.stringify(report);
                result.textContent = JSON.stringify({ ...report, intervalsMs: undefined });
                measure.disabled = false;
            }; requestAnimationFrame(sample);
        };
    }

	window.__views = Object.keys( VIEWS );
	// the current camera as a VIEWS entry (paste it back as a named view): __pose()
	window.__pose = () => {

		const c = app.camera, e = new Vector3().setFromMatrixColumn( c.matrixWorld, 2 ).negate();
		const r = ( v ) => Math.round( v * 100 ) / 100;
		return JSON.stringify( { p: [ r( c.position.x ), r( c.position.y ), r( c.position.z ) ], yaw: r( Math.atan2( - e.x, - e.z ) ), pitch: r( Math.asin( e.y ) ), time: r( app.settings.timeOfDay ) } );

	};
	window.__view = ( name ) => {

		const v = VIEWS[ name ];
		if ( ! v ) return 'unknown view';
		const portal = app.thirdIsland?.portalInterior;
		if ( portal ) {
			portal.group.visible = !! v.portal;
			for ( const source of portal.localLightSources || [] ) source.enabled = !! v.portal;
		}
		if ( v.time !== undefined ) {
			app.settings.clockMode = 'manual';
			app.settings.timeOfDay = v.time;
		}
		if ( app.setFreeCam ) app.setFreeCam( true );
		app.fly.setPose( new Vector3( ...v.p ), v.yaw, v.pitch );
		app.fly.velocity.set( 0, 0, 0 );
		app.post?.taau?.resetHistory();
		return name;

	};
	// Review-only camera selector avoids rebuilding the whole scene per screenshot.
	// It changes the observer camera, never vehicle position or gameplay state.
	if (new URLSearchParams(location.search).get('view')?.startsWith('port')) {
		const select = document.createElement('select');
		select.setAttribute('aria-label', 'Bracken review camera');
		select.style.cssText = 'position:fixed;top:50px;left:20px;z-index:10000;background:#18232a;color:white;padding:8px';
		for (const key of Object.keys(VIEWS).filter(key => key.startsWith('port'))) {
			const option = document.createElement('option'); option.value = key; option.textContent = key;
			select.appendChild(option);
		}
		select.value = new URLSearchParams(location.search).get('view');
		select.addEventListener('change', () => window.__view(select.value));
		document.body.appendChild(select);
		const evidence = document.createElement('output');
		evidence.setAttribute('aria-label', 'Vehicle review telemetry');
		evidence.style.cssText = 'position:fixed;bottom:18px;left:160px;z-index:10000;background:#18232ae8;color:white;padding:8px;font:12px monospace;pointer-events:none';
		document.body.appendChild(evidence);
		setInterval(() => {
			const port = app.portIsland, car = port?.playerCar;
			if (!car) return;
			evidence.dataset.raw = JSON.stringify({ at:performance.now(),
				driving:port.driving, speed:port.speed, steer:port.steer,
				pose:{x:car.position.x,y:car.position.y,z:car.position.z,yaw:car.rotation.y},
				player:{x:app.player?.position.x,z:app.player?.position.z},
				asset:port.vehicleAssetStatus,depotPower:port.depotPower,
				traffic:port.traffic.cars.map(ai=>({id:ai.id,kind:ai.kind,...ai.pose,speed:ai.speed,trips:ai.trips})),
				fps:app.fps,heapBytes:performance.memory?.usedJSHeapSize??null,
				cpuMs:app.cpuMs,drawStats:app.engine.meshRenderer.stats,
				gpuProfile:app.profiler?.enabled ? app.profiler.result : null,
				quality:app.settings.qualityProfile,renderScale:app.settings.renderScale,
				renderSize:[app.sceneRenderer.width,app.sceneRenderer.height],
				canvas:[app.engine.domElement.width,app.engine.domElement.height],
				aa:app.post.aaMode,motionBlur:app.post.motionBlur.shutter.value });
			evidence.textContent = `REVIEW ONLY | ${port.vehicleAssetStatus || 'loading'} | ${port.driving ? 'DRIVING' : 'PARKED'} | speed ${port.speed.toFixed(2)} m/s | x ${car.position.x.toFixed(2)} z ${car.position.z.toFixed(2)} | yaw ${car.rotation.y.toFixed(3)} | AI trips ${port.traffic.cars.reduce((sum, ai) => sum + ai.trips, 0)}`;
		}, 100);
	}

}
