import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const path = process.argv[2];
const raw = readFileSync(path);
const report = JSON.parse(raw);
assert.equal(report.status, 'complete');
assert.equal(report.valid, true);
assert.equal(report.kind, 'foreground');
assert.equal(report.stage, 3);
assert.equal(report.runs.length, report.selectedViews.length * report.selectedVariants.length * 8);
const stats = values => {
  const sorted = [...values].sort((a,b) => a-b);
  assert.ok(values.every(v => Number.isFinite(v) && v >= 0));
  return {frames:values.length, meanMs:values.reduce((a,b)=>a+b,0)/values.length,
    fps:1000*values.length/values.reduce((a,b)=>a+b,0),
    p95:sorted[Math.floor((values.length-1)*.95)], p99:sorted[Math.floor((values.length-1)*.99)],
    max:sorted.at(-1), over50:values.filter(v=>v>50).length, over150:values.filter(v=>v>150).length};
};
const collect = runs => ({...stats(runs.flatMap(r=>r.intervalsMs)),
  cpu:stats(runs.flatMap(r=>r.cpuSubmitMs)).meanMs,
  drawCounts:runs.map(r=>r.drawStats.draws), animatedForest:runs.map(r=>r.animatedForestStats)});
const groups = [];
for (const view of report.selectedViews) for (const variant of report.selectedVariants) {
  const runs = report.runs.filter(r=>r.view===view && r.variant===variant);
  assert.deepEqual(runs.map(r=>r.mode), ['baseline','candidate','candidate','baseline','baseline','candidate','candidate','baseline']);
  for (const run of runs) {
    assert.equal(run.complete,true);
    assert.equal(run.intervalsMs.length,180);
    assert.equal(run.cpuSubmitMs.length,180);
    assert.ok(run.intervalsMs.every(v=>v>0));
    assert.deepEqual(run.internal, runs[0].internal);
    assert.deepEqual(run.cameraBefore,runs[0].cameraBefore);
    assert.deepEqual(run.cameraAfter,runs[0].cameraAfter);
    assert.deepEqual(run.lighting,runs[0].lighting);
  }
  const baseline=collect(runs.filter(r=>r.mode==='baseline'));
  const candidate=collect(runs.filter(r=>r.mode==='candidate'));
  groups.push({view,variant,baseline,candidate,gainPercent:(candidate.fps/baseline.fps-1)*100,
    cycles:[1,2].map(cycle=>{
      const a=collect(runs.filter(r=>r.mode==='baseline'&&r.cycle===cycle));
      const b=collect(runs.filter(r=>r.mode==='candidate'&&r.cycle===cycle));
      return {cycle,baseline:a.fps,candidate:b.fps,gainPercent:(b.fps/a.fps-1)*100};
    })});
}
const baseline=collect(report.runs.filter(r=>r.mode==='baseline'));
const candidate=collect(report.runs.filter(r=>r.mode==='candidate'));
const result={reportPath:path,sha256:createHash('sha256').update(raw).digest('hex'),
  rawSamplesRetained:true,configuration:report.configuration,cameraMotion:report.cameraMotion,
  simulationDt:report.simulationDt,baseline,candidate,gainPercent:(candidate.fps/baseline.fps-1)*100,groups};
writeFileSync(path.replace(/\.json$/, '-summary.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({gainPercent:result.gainPercent,baselineFPS:baseline.fps,candidateFPS:candidate.fps,
  baselineCPU:baseline.cpu,candidateCPU:candidate.cpu,baselineP99:baseline.p99,candidateP99:candidate.p99,
  groups:groups.map(g=>({view:g.view,gainPercent:g.gainPercent,cycles:g.cycles}))},null,2));
