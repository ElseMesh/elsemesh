import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Reads retained real-browser telemetry. No browser simulation or invented FPS.
const filename=process.argv[2];
if(!filename)throw Error('usage: node tools/summarize-port-drive.mjs REPORT.json');
const bytes=await readFile(filename), report=JSON.parse(bytes);
const quantile=(values,p)=>{
  const a=[...values].sort((x,y)=>x-y),n=(a.length-1)*p;
  return a.length?a[Math.floor(n)]+(a[Math.ceil(n)]-a[Math.floor(n)])*(n%1):null;
};
const frames=report.frames.filter(ms=>Number.isFinite(ms)&&ms>0);
const fps=frames.map(ms=>1000/ms),rows=report.rows;
const seconds=[];let elapsed=0,count=0;
for(const ms of frames){elapsed+=ms;count++;if(elapsed>=1000){seconds.push(count*1000/elapsed);elapsed=0;count=0;}}
const heap=rows.map(r=>r.heapBytes).filter(Number.isFinite);
const loops=report.arrivals.filter(a=>a.label.endsWith(':return-to-start'));
console.log(JSON.stringify({
  source:filename,sha256:createHash('sha256').update(bytes).digest('hex'),
  outcome:report.outcome,method:report.method,asset:report.asset,
  startedAt:report.startedAt,finishedAt:report.finishedAt,
  loopReturns:loops,arrivals:report.arrivals.length,requiredWaypoints:report.route.length,
  recoveries:report.recoveries??[],
  performance:{method:'requestAnimationFrame intervals during real-browser automated driving; instantaneous FPS, not one-second averages',
    samples:fps.length,median:quantile(fps,.5),p10:quantile(fps,.1),p90:quantile(fps,.9),
    minimum:fps.length?Math.min(...fps):null,framesBelow20:fps.filter(f=>f<20).length,
    framesOver100ms:frames.filter(ms=>ms>100).length,maxFrameMs:frames.length?Math.max(...frames):null,
    heapPeakBytes:heap.length?Math.max(...heap):null,
    oneSecondWindows:{samples:seconds.length,median:quantile(seconds,.5),p10:quantile(seconds,.1),p90:quantile(seconds,.9),
      minimum:seconds.length?Math.min(...seconds):null,below20:seconds.filter(f=>f<20).length},
    observedRenderSizes:[...new Set(rows.map(r=>JSON.stringify(r.renderSize)))]},
  trafficStart:rows[0]?.traffic,trafficEnd:rows.at(-1)?.traffic,
  limitations:['Provisional fleet, not final asset admission','Arrival tolerance 3.8 metres; no full-stop requirement',
    'Depot junction traversal does not prove interior breaker interaction','Automated input, not a manual driving review',
    'Telemetry collection and periodic DOM JSON publication remain enabled and may affect timings']
},null,2));
