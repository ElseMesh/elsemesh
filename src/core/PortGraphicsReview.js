import { isolatePortGraphics } from './PortGraphicsIsolation.js';
// Explicit development UI: measures real GPU timestamp queries, not simulated FPS.
export function installPortGraphicsReview(app) {
  const panel=document.createElement('section');
  panel.style.cssText='position:fixed;top:100px;left:20px;z-index:10000;background:#18232aee;color:white;padding:8px';
  const button=document.createElement('button');button.textContent='Run port graphics benchmark';
  const output=document.createElement('output');output.setAttribute('aria-label','Port graphics benchmark results');
  output.style.display='block';output.textContent='Fixed views, 30 warm-up + 90 measured frames. Not a physical phone benchmark.';
  const isolation=document.createElement('button');isolation.textContent='Run off-screen isolation comparison';
  const inspect=document.createElement('button');inspect.textContent='Inspect Godzilla with animated culling';
  inspect.onclick=()=>{
    if(button.disabled || !app.kaiju?.model)return;
    app.engine.stop();app.setFreeCam(true);app.settings.timeOfDay=16.4;
    const p=app.kaiju.pose;
    app.fly.setPose(app.camera.position.clone().set(p.x+42,p.feet+12,p.z+45),Math.atan2(42,45),0);
    app.engine.start((dt,t)=>app.frame(dt,t));
  };
  panel.append(button,isolation,inspect,output);document.body.append(panel);
  let bench;
  button.onclick=async()=>{
    button.disabled=isolation.disabled=true;output.textContent='Waiting for vehicle assets…';
    try {
      await Promise.all([app.portIsland.vehicleAssetsReady,app.portIsland.cargoVehicleReady,app.portIsland.gatehouseReady]);
      const {Bench}=await import('./Bench.js');bench??=new Bench(app);
      if(!bench.enabled)throw Error('GPU timestamp queries unavailable');
      app.engine.stop();app.thirdIsland.active=false;app.player.mode='walk';app.monorail.state='station';
      app.settings.clockMode='manual';app.settings.timeSpeed=0;app.settings.autoResolution=false;
      bench.setSize=()=>Bench.prototype.setSize.call(bench,1600,900);
      output.textContent='Measuring actual GPU passes in three fixed port views…';
      const result=await bench.run({views:['portDepotInterior','portJunction-warehouse','portCargoWide'],warm:30,frames:90,dt:0,top:12});
      const report={at:new Date().toISOString(),variant:app.qs.get('detailBatches')==='spatial'?'spatial-64m':'legacy',
        platform:navigator.userAgent,profile:app.settings.qualityProfile,output:[1600,900],
        internal:[app.sceneRenderer.width,app.sceneRenderer.height],warm:30,frames:90,dt:0,result,
        limitations:['Desktop GPU, not Pixel 8','Fixed-view GPU throughput, not live driving frame pacing','No cold-start or thermal-soak measurement']};
      output.dataset.raw=JSON.stringify(report);output.textContent=`COMPLETE ${report.variant}: GPU milliseconds per view ${Object.entries(result).filter(([k])=>k!=='total').map(([k,v])=>`${k} ${v.gpu}`).join(', ')}`;
    }catch(error){output.textContent=`FAILED: ${error.message}`;}
    finally{button.disabled=isolation.disabled=false;}
  };
  isolation.onclick=async()=>{
    button.disabled=isolation.disabled=true;
    const report={at:new Date().toISOString(),profile:app.settings.qualityProfile,platform:navigator.userAgent,
      output:[1600,900],warm:30,frames:90,dt:0,runs:[],
      limitations:['Fixed-view throughput, not driving stutter diagnosis','Desktop, not Pixel 8','Tree variant freezes animation but retains geometry','Traffic variant removes AI rendering and simulation, not player car']};
    try{
      await Promise.all([app.portIsland.vehicleAssetsReady,app.portIsland.cargoVehicleReady,app.portIsland.gatehouseReady]);
      if(!app.kaiju?.model)throw Error('Kaiju model must be loaded for a valid comparison');
      const {Bench}=await import('./Bench.js');bench??=new Bench(app);
      if(!bench.enabled)throw Error('GPU timestamp queries unavailable');
      app.engine.stop();app.thirdIsland.active=false;app.player.mode='walk';app.monorail.state='station';
      app.settings.clockMode='manual';app.settings.timeSpeed=0;app.settings.autoResolution=false;
      bench.setSize=()=>Bench.prototype.setSize.call(bench,1600,900);
      const variants=app.qs.has('cullingReview')?['baseline','legacy-kaiju-culling','legacy-kaiju-culling','baseline']:['baseline','no-kaiju','no-distant-tree-animation','no-ai-traffic','no-ai-traffic','no-distant-tree-animation','no-kaiju','baseline'];
      for(const variant of variants){
        output.textContent=`Isolation ${report.runs.length+1}/${variants.length}: ${variant}`;
        const restore=isolatePortGraphics(app,variant);
        const submissions={};
        const callbacks=app.kaiju.model.meshes.map(mesh=>{
          const previous=mesh.onBeforeRender;
          mesh.onBeforeRender=function(r,s,c,...args){const key=c.isShadowCamera?'shadow':(c.name||c.type||'other');submissions[key]=(submissions[key]||0)+1;previous?.call(this,r,s,c,...args);};
          return ()=>{mesh.onBeforeRender=previous;};
        });
        try{
          const result=await bench.run({views:['portJunction-warehouse','portCargoWide'],warm:30,frames:90,dt:0,top:12});
          report.runs.push({variant,result,kaijuSubmissions:submissions,kaijuBounds:app.kaiju.model.meshes.map(m=>({name:m.name,culled:m.frustumCulled,radius:m.geometry.boundingSphere.radius})),drawStats:{...app.engine.meshRenderer.stats}});output.dataset.raw=JSON.stringify(report);
        }finally{for(const restoreCallback of callbacks)restoreCallback();restore();}
      }
      report.complete=true;report.internal=[app.sceneRenderer.width,app.sceneRenderer.height];
      output.dataset.raw=JSON.stringify(report);output.textContent=`COMPLETE off-screen isolation: ${report.runs.length} runs. All diagnostic overrides restored; reload to resume gameplay.`;
    }catch(error){report.error=error.message;output.dataset.raw=JSON.stringify(report);output.textContent=`FAILED isolation: ${error.message}`;}
    finally{button.disabled=isolation.disabled=false;}
  };
}
