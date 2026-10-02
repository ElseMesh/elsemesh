import { GPU } from '../engine/gpu/GPU.js';
import { G, FrameUniforms } from '../engine/render/Frame.js';
import { Vector3 } from '../engine/math/index.js';

const SIZE = [1600, 900];
const REVIEW_VIEWS = ['beach', 'village', 'underwater', 'islandFourVilla', 'portJunction-warehouse', 'portCargoWide'];
const VARIANTS = {
  transforms: 'Scene transforms',
  waterDepth: 'Unused water depth copy',
  effects: 'Inactive effect passes',
  combined: 'All optimizations',
};
const STAGE_TWO_VARIANTS = {
  forest: 'Distant forest', submission: 'Scene submission', depthSort: 'Opaque depth ordering',
  water: 'Distant water optics', combined: 'All stage two changes',
  safeCombined: 'Stage two without depth ordering',
};
const ARCHITECTURE_VARIANTS = {
  animatedForest: 'Near animated forest', collisions: 'Spatial collision queries',
  combined: 'Animated forest + spatial queries',
};
const ABBA = ['baseline', 'candidate', 'candidate', 'baseline'];

export function summarizeRendererSamples(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { samples: values.length, meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    medianMs: percentile(.5), p90Ms: percentile(.9), p95Ms: percentile(.95), p99Ms: percentile(.99),
    maxMs: sorted.at(-1), meanFPS: 1000 * values.length / values.reduce((a, b) => a + b, 0), medianFPS: 1000 / percentile(.5),
    framesOver33ms: values.filter(x => x > 1000 / 30).length, framesOver50ms: values.filter(x => x > 50).length };
}

function configuration(app) {
  return { requestedQuality: app.qs.get('quality'), profile: app.settings.qualityProfile,
    renderScale: app.settings.renderScale, autoResolution: app.settings.autoResolution,
    aa: app.post.aaMode, ssr: app.waterMaterial.params.ssr.value,
    ao: app.post.params.aoStrength.value, bloom: app.post.params.bloom.value,
    motionBlur: app.post.motionBlur.shutter.value, exposure: app.settings.exposure,
    clockMode: app.settings.clockMode, timeSpeed: app.settings.timeSpeed,
    postScale: app.post.scale, shadows: app.shadows.enabled,
    refractionEnabled: app.refraction.enabled, refractionScale: app.refraction.scale,
    hazeEnabled: app.haze?.enabled.value ?? null, hazeDensity: app.haze?.density.value ?? null,
    shafts: app.haze?.shafts.value ?? null };
}

function switches(app, stage = 1) {
  if (stage === 3) return [
    [app.fourthIsland, 'optimizeAnimatedForest', 'animatedForest'],
    [app.colliders, 'optimizeSpatialQueries', 'collisions'],
  ];
  if (stage === 2) return [
    [app.fourthIsland, 'optimizeDistantForest', 'forest'],
    [app.engine.meshRenderer, 'optimizeSceneSubmission', 'submission'],
    [app.engine.meshRenderer, 'optimizeOpaqueDepthSort', 'depthSort'],
    [app.waterMaterial, 'optimizeDistantWater', 'water'],
  ];
  return [
    [app.engine.meshRenderer, 'optimizeSceneTransforms', 'transforms'],
    [app.sceneRenderer, 'optimizeWaterDepthCopy', 'waterDepth'],
    [app.post, 'optimizeDisabledEffects', 'effects'],
  ];
}

function applyVariant(app, variant, candidate, stage = 1) {
  for (const [target, key, name] of switches(app, stage)) {
    if (typeof target[key] !== 'boolean') throw Error(`Renderer candidate unavailable: ${key}`);
    target[key] = candidate && (variant === 'combined' || variant === name || (variant === 'safeCombined' && name !== 'depthSort'));
  }
}

function nextFrame(signal) {
  return new Promise((resolve, reject) => {
    let id;
    const abort = () => { cancelAnimationFrame(id); reject(signal.reason || Error('Review aborted')); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    id = requestAnimationFrame(time => {
      signal.removeEventListener('abort', abort);
      if (document.hidden) reject(Error('Page hidden: foreground evidence invalid'));
      else resolve(time);
    });
  });
}

// Explicit developer tool. It never runs automatically and is excluded from production imports.
export function installRendererReview(app, views) {
  const stage = ['2', '3'].includes(app.qs.get('rendererStage')) ? Number(app.qs.get('rendererStage')) : 1;
  const variants = stage === 3 ? ARCHITECTURE_VARIANTS : stage === 2 ? STAGE_TWO_VARIANTS : VARIANTS;
  views = { ...views, forestTransition: { p: [-500, 24, 850], yaw: 0, pitch: -.08, time: 16.4 } };
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Renderer development review');
  panel.style.cssText = 'position:fixed;right:16px;top:16px;z-index:12000;width:330px;max-width:calc(100vw - 48px);max-height:85vh;overflow:auto;padding:12px;background:#11202ff2;color:#edf7ff;border:1px solid #54778f;border-radius:8px;font:12px/1.45 system-ui';
  const title = document.createElement('strong'); title.textContent = `Renderer review · stage ${stage} · development only`;
  const description = document.createElement('p');
  description.textContent = '1600 × 900; fixed simulation clock; quality from URL. Two ABBA cycles. Keep this tab visible. Inactive-effect savings require effects already off; settings are identical in A and B.';
  const view = document.createElement('select'); view.setAttribute('aria-label', 'Renderer review view');
  const variant = document.createElement('select'); variant.setAttribute('aria-label', 'Renderer optimization variant');
  const preset = document.createElement('select'); preset.setAttribute('aria-label', 'Renderer review effect preset');
  const motion = document.createElement('select'); motion.setAttribute('aria-label', 'Renderer review camera motion');
  const option = (select, value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; select.append(o); };
  for (const name of REVIEW_VIEWS) option(view, name, name);
  option(view, 'all', 'All six views');
  for (const name of ['forestTransition', 'islandFourAerial', 'deepBlue', 'pierShallows', 'waterline', 'surf']) option(view, name, name);
  for (const [key, name] of Object.entries(variants)) option(variant, key, name);
  option(variant, 'all', 'Every variant separately + combined'); variant.value = 'combined';
  option(preset, 'unchanged', 'Existing quality settings');
  option(preset, 'effectsOff', 'Separate scenario: AO 0 and bloom 0 in A + B');
  option(motion, 'fixed', 'Fixed camera');
  option(motion, 'sweep', 'Repeatable camera sweep · fixed simulation');
  if (stage === 3) option(motion, 'windSweep', 'Repeatable camera + wind · fixed physics');
  if (REVIEW_VIEWS.includes(app.qs.get('view'))) view.value = app.qs.get('view');
  for (const select of [view, variant, preset, motion]) select.style.cssText = 'display:block;box-sizing:border-box;width:100%;margin:8px 0;padding:5px';
  const controls = document.createElement('div'); controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  const button = label => { const b = document.createElement('button'); b.textContent = label; b.style.padding = '5px 7px'; controls.append(b); return b; };
  const live = button('Run foreground ABBA · 60 / 180');
  const gpu = button('Run GPU ABBA · 30 / 90');
  const baseline = button('Render baseline still');
  const optimized = button('Render optimized still');
  const previewA = button('Preview baseline movement');
  const previewB = button('Preview optimized movement');
  const collisionReview = stage === 3 ? button('Measure world collision queries') : null;
  const abort = button('Abort'); abort.disabled = true;
  const download = button('Download results'); download.disabled = true;
  const output = document.createElement('output'); output.setAttribute('aria-label', 'Renderer review results');
  output.setAttribute('aria-live', 'polite'); output.style.cssText = 'display:block;margin-top:10px;white-space:pre-wrap;overflow-wrap:anywhere';
  output.textContent = 'Ready after game loading. Use ?bench&rendererReview&quality=balanced&noAudio for seeded comparisons.';
  panel.append(title, description, view, variant, preset, motion, controls, output); document.body.append(panel);

  let active = null, bench = null, report = null;
  const publish = () => { output.dataset.raw = JSON.stringify(report); download.disabled = !report; };
  const setBusy = busy => {
    for (const control of [live, gpu, baseline, optimized, previewA, previewB, collisionReview, view, variant, preset, motion].filter(Boolean)) control.disabled = busy;
    abort.disabled = !busy;
  };
  const invalidate = reason => { if (active && !active.signal.aborted) active.abort(Error(reason)); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) invalidate('Page hidden: foreground evidence invalid'); });
  window.addEventListener('resize', () => invalidate('Viewport resized: comparison invalid'));
  window.addEventListener('blur', () => { if (report?.kind === 'foreground') invalidate('Window lost focus: foreground evidence invalid'); });
  GPU.device.lost.then(info => invalidate(`GPU device lost: ${info.reason}`));
  abort.onclick = () => invalidate('User aborted comparison');

  function guard(signal, signature) {
    if (signal.aborted) throw signal.reason;
    if (document.hidden) throw Error('Page hidden: foreground evidence invalid');
    if (report?.kind === 'foreground' && !document.hasFocus()) throw Error('Window not focused: foreground evidence invalid');
    if (signature && JSON.stringify(configuration(app)) !== signature) throw Error('Quality or effect settings changed during comparison');
    if (signature && (app.engine.canvas.width !== SIZE[0] || app.engine.canvas.height !== SIZE[1])) throw Error('Render output size changed during comparison');
  }

  async function prepare(signal) {
    if (!app.qs.has('bench')) throw Error('Seeded review requires ?bench&rendererReview. Reload with both parameters.');
    if (!app.qs.get('quality') || app.qs.get('quality') === 'auto') throw Error('Choose a fixed quality in the URL, for example quality=balanced.');
    if (['profile', 'graphicsReview', 'driveReview', 'auto', 'shots', 'demo', 'room'].some(key => app.qs.has(key))) throw Error('Use a fresh rendererReview page without other profiler, automatic benchmark or network modes.');
    output.textContent = 'Waiting for initialization and public scene assets…';
    // DebugViews installs before App.precompile. Main creates __bench after hideLoader.
    while (!window.__bench || document.getElementById('loader')?.style.display !== 'none') await nextFrame(signal);
    bench = window.__bench;
    if (bench.app !== app) throw Error('Existing benchmark belongs to another scene');
    if (bench._capture) throw Error('Another GPU benchmark is active');
    if (app.profiler?.enabled) throw Error('Disable the separate GPU profiler before comparison');
    if (app.networkDemo) throw Error('Network sessions cannot be used for renderer comparisons');
    if (app.game?.salvage?.open) throw Error('Close the salvage camera before comparison');
    if (stage >= 2 && switches(app).some(([target, key]) => target[key] !== true)) throw Error('Baseline requires all published stage-one optimizations enabled');
    if (stage === 3 && switches(app, 2).some(([target, key, name]) => target[key] !== (name !== 'depthSort'))) throw Error('Architecture baseline requires the published stage-two settings');
    await Promise.all([app.clouds?.ready, app.fourthIsland?.ready, app.avatar?.ready,
      app.game?.stand?.ready, app.game?.chandlery?.ready, app.portIsland?.vehicleAssetsReady,
      app.portIsland?.cargoVehicleReady, app.portIsland?.gatehouseReady, app.portIsland?.ivyReady]);
    const port = app.portIsland;
    if (!app.fourthIsland?.model || !port?.cargoScene?.vehicle || !port.gatehouseModel || port.vehicleAssetStatus === 'PROXY_FALLBACK') throw Error('A required scene asset failed to load');
    for (const error of [app.fourthIsland.error, port.vehicleAssetError, port.gatehouseError, port.ivyError]) if (error) throw Error('Required asset load error; inspect the game loader');
    await GPU.pipelinesReady(); await GPU.queue.onSubmittedWorkDone(); guard(signal);
    app.engine.stop();
  }

  function freeze() {
    const snapshot = { autoResolution: app.settings.autoResolution, clockMode: app.settings.clockMode,
      timeSpeed: app.settings.timeSpeed, queryView: app.qs.get('view'),
      ao: app.post.params.aoStrength.value, bloom: app.post.params.bloom.value,
      flags: switches(app, stage).map(([target, key]) => [target, key, target[key]]) };
    app.settings.autoResolution = false; app.settings.clockMode = 'manual'; app.settings.timeSpeed = 0;
    if (preset.value === 'effectsOff') { app.post.params.aoStrength.value = 0; app.post.params.bloom.value = 0; }
    // The normal ?view floor clamp forbids the explicitly underwater benchmark camera.
    app.qs.delete('view');
    bench.setSize(...SIZE); FrameUniforms.fields.outputResolution.value.set(...SIZE);
    return () => {
      for (const [target, key, value] of snapshot.flags) target[key] = value;
      app.settings.autoResolution = snapshot.autoResolution;
      app.settings.clockMode = snapshot.clockMode; app.settings.timeSpeed = snapshot.timeSpeed;
      app.post.params.aoStrength.value = snapshot.ao; app.post.params.bloom.value = snapshot.bloom;
      if (snapshot.queryView !== null) app.qs.set('view', snapshot.queryView);
    };
  }

  let currentView = null, currentViewName = null, motionFrame = 0, animatePreview = false, lightingPoseFrame = -1;
  const motionPosition = new Vector3();
  function pose(name) {
    if (!views[name]) throw Error(`Unknown review view: ${name}`);
    // The transition route is local to this review; Bench only knows DebugViews.
    bench.pose(name === 'forestTransition' ? 'islandFourVilla' : name);
    if (name === 'forestTransition') {
      const v = views[name];
      app.settings.timeOfDay = v.time;
      app.fly.setPose(new Vector3(...v.p), v.yaw, v.pitch);
    }
    app.post.taau?.resetHistory();
    G.time.value = 1000;
    // Irradiance readback normally advances on simulation dt. A dt=0 review
    // otherwise retains the launch-time sun colour after moving to a daytime
    // camera. Request one fresh readback; the warm-up allows it to complete.
    app.atmosphere._irrTimer = 0;
    lightingPoseFrame = GPU.frame;
    currentView = views[name]; currentViewName = name; motionFrame = 0;
    // Each comparison starts the forest at the same wind phase, including when
    // previewing its time-dependent near/far transition.
    if (app.fourthIsland) app.fourthIsland.time = 1000;
  }

  function assertLightingSettled() {
    if (app.atmosphere._irrPending || app.atmosphere.readback.frame <= lightingPoseFrame) {
      throw Error('Atmosphere irradiance did not refresh for the selected camera/time');
    }
  }

  function render(signal, signature) {
    guard(signal, signature); G.time.value = 1000;
    if (motion.value === 'windSweep') {
      G.time.value += motionFrame / 60;
      app.fourthIsland.time = G.time.value;
    }
    if (currentView && (['sweep', 'windSweep'].includes(motion.value) || animatePreview)) {
      const phase = motionFrame++ * Math.PI * 2 / (animatePreview ? 360 : 240);
      const offset = Math.sin(phase) * 8;
      motionPosition.fromArray(currentView.p);
      motionPosition.x += Math.cos(currentView.yaw) * offset;
      motionPosition.z -= Math.sin(currentView.yaw) * offset;
      if (currentViewName === 'forestTransition') motionPosition.z += Math.sin(phase) * 100;
      app.fly.setPose(motionPosition, currentView.yaw + Math.sin(phase) * .18, currentView.pitch + Math.sin(phase * 2) * .025);
    }
    const start = performance.now(); app.frame(animatePreview ? 1 / 60 : 0);
    return performance.now() - start;
  }

  async function paced(count, signal, signature, progress) {
    let timestamp;
    for (let frame = 0; frame < count; frame++) {
      timestamp = await nextFrame(signal); render(signal, signature);
      if ((frame + 1) % 30 === 0) progress?.(frame + 1);
    }
    return timestamp;
  }

  async function foreground(run, signal, signature, label) {
    // The last warm frame primes the clock. 60 + 180 preserves the four-frame
    // shadow cadence across variants, with no extra submitted prime frame.
    let previous = await paced(60, signal, signature, n => { output.textContent = `${label}\nWarm-up ${n}/60`; });
    assertLightingSettled();
    run.internal = [app.sceneRenderer.width, app.sceneRenderer.height];
    run.lighting = { sunColor: G.sunColor.value.toArray(), skyIrradiance: G.skyIrradiance.value.toArray(),
      sunDirection: G.sunDir.value.toArray() };
    for (let frame = 0; frame < 180; frame++) {
      const now = await nextFrame(signal);
      run.intervalsMs.push(now - previous); previous = now;
      run.cpuSubmitMs.push(render(signal, signature));
      if (run.internal[0] !== app.sceneRenderer.width || run.internal[1] !== app.sceneRenderer.height) throw Error('Internal render size changed during sampling');
      if ((frame + 1) % 30 === 0) output.textContent = `${label}\nForeground samples ${frame + 1}/180`;
    }
    run.framePacing = summarizeRendererSamples(run.intervalsMs);
    run.cpuSubmission = summarizeRendererSamples(run.cpuSubmitMs);
  }

  async function gpuFrames(run, signal, signature, label) {
    if (!bench.enabled) throw Error('GPU timestamp queries unavailable; foreground measurement remains available');
    await paced(30, signal, signature, n => { output.textContent = `${label}\nGPU warm-up ${n}/30`; });
    assertLightingSettled();
    run.internal = [app.sceneRenderer.width, app.sceneRenderer.height];
    await GPU.queue.onSubmittedWorkDone();
    while (bench.ring.some(slot => slot.busy)) await nextFrame(signal);
    bench.frames = []; bench._labels = []; bench._capture = true;
    bench.captureDiagnostics = { submitted: 0, captured: 0, ringDrops: 0, mapFailures: 0, invalidFrames: 0, truncatedPasses: 0, lastMapError: null };
    run.capturePacing = { method: 'GPU-only: maximum two queued frames and a free readback slot before every submission', ringWaitFrames: 0, maxBusySlots: 0 };
    try {
      let pending = null;
      for (let frame = 0; frame < 90; frame++) {
        await nextFrame(signal);
        const slotDeadline = performance.now() + 10000;
        while (bench.ring.every(slot => slot.busy)) {
          if (performance.now() >= slotDeadline) throw Error('GPU readback ring did not free a capture slot');
          run.capturePacing.ringWaitFrames++;
          await nextFrame(signal); guard(signal, signature);
        }
        render(signal, signature);
        run.capturePacing.maxBusySlots = Math.max(run.capturePacing.maxBusySlots, bench.ring.filter(slot => slot.busy).length);
        const done = GPU.queue.onSubmittedWorkDone();
        if (pending) await pending;
        pending = done;
        guard(signal, signature);
        if ((frame + 1) % 30 === 0) output.textContent = `${label}\nGPU timestamp samples ${frame + 1}/90 (capture backpressure)`;
      }
      await pending;
      const deadline = performance.now() + 10000;
      while (bench.ring.some(slot => slot.busy) && performance.now() < deadline) await nextFrame(signal);
      guard(signal, signature);
      if (run.internal[0] !== app.sceneRenderer.width || run.internal[1] !== app.sceneRenderer.height) throw Error('Internal render size changed during GPU sampling');
      run.gpuFrames = bench.frames.map(frame => ({ gpuMs: frame.gpu, passesMs: Object.fromEntries(frame.passes) }));
      run.captureDiagnostics = { ...bench.captureDiagnostics };
      if (run.captureDiagnostics.ringDrops || run.captureDiagnostics.mapFailures || run.captureDiagnostics.invalidFrames || run.captureDiagnostics.truncatedPasses) throw Error('GPU capture diagnostics report lost or incomplete timestamp data');
      if (run.gpuFrames.length !== 90) throw Error(`Incomplete GPU readback: ${run.gpuFrames.length}/90 frames`);
      run.gpuTime = summarizeRendererSamples(run.gpuFrames.map(frame => frame.gpuMs));
      const totals = new Map();
      for (const frame of run.gpuFrames) for (const [name, ms] of Object.entries(frame.passesMs)) totals.set(name, (totals.get(name) || 0) + ms / run.gpuFrames.length);
      run.meanPassMs = Object.fromEntries([...totals].sort((a, b) => b[1] - a[1]));
    } finally {
      bench._capture = false;
      run.captureDiagnostics = { ...bench.captureDiagnostics };
    }
  }

  function comparisons(runs, metric) {
    const groups = new Map();
    for (const run of runs.filter(run => run.complete)) {
      const key = `${run.view}/${run.variant}`;
      if (!groups.has(key)) groups.set(key, { baseline: [], candidate: [] });
      groups.get(key)[run.mode].push(...(metric === 'framePacing' ? run.intervalsMs : run.gpuFrames.map(frame => frame.gpuMs)));
    }
    return [...groups].map(([name, group]) => {
      const base = summarizeRendererSamples(group.baseline), candidate = summarizeRendererSamples(group.candidate);
      const a = base?.meanMs, b = candidate?.meanMs;
      return { name, baseline: base, candidate,
        baselineMeanMs: a ?? null, candidateMeanMs: b ?? null,
        reductionPercent: a > 0 && b !== undefined ? (a - b) / a * 100 : null };
    });
  }

  async function execute(kind, stillCandidate = false) {
    if (active) return;
    const controller = new AbortController(); active = controller; setBusy(true);
    const selectedViews = view.value === 'all' ? REVIEW_VIEWS : [view.value];
    const selectedVariants = variant.value === 'all' ? Object.keys(variants) : [variant.value];
    report = { schema: 'elsemesh.renderer-review/v1', startedAt: new Date().toISOString(), kind,
      status: 'running', valid: false, stage, output: SIZE, simulationDt: kind === 'preview' ? 1 / 60 : 0, simulationTime: 1000,
      cameraMotion: motion.value, windTimeStep: motion.value === 'windSweep' ? 1 / 60 : 0,
      baseline: stage === 3 ? 'Published stage-one and stage-two settings remain enabled; only architecture flags toggle; timing correction shared by both modes' : stage === 2 ? 'Published stage-one optimizations remain enabled; only stage-two flags toggle' : 'Original renderer',
      effectPreset: preset.value, effectPresetNote: preset.value === 'effectsOff'
        ? 'AO and bloom are both zero for baseline and candidate; this is a separate scenario, not a default-quality speedup.' : 'Existing quality and effect settings preserved.',
      platform: navigator.userAgent, selectedViews, selectedVariants, cycles: ['still', 'preview'].includes(kind) ? 0 : 2,
      warmFrames: kind === 'foreground' ? 60 : 30, sampleFrames: kind === 'foreground' ? 180 : 90,
      runs: [], limitations: ['Fixed-camera screening with dt=0, not live gameplay or thermal qualification',
        'Simulation clock is fixed, but renderer frame counters and some frame-driven animation advance',
        'Foreground intervals include refresh-rate limits; GPU samples are a separate instrumented run',
        stage === 3 ? 'Frozen physics does not measure collision-index gameplay benefit; windSweep advances wind and camera only; normal-dt previews are visual checks, not equivalent-state FPS comparisons' : stage === 2 ? 'Distant forest motion and converged water optics may differ; moving visual review required' : 'No asset removal or quality reduction; candidate work savings depend on the recorded effect settings'] };
    publish(); let restore;
    try {
      await prepare(controller.signal); restore = freeze();
      report.configuration = configuration(app); const signature = JSON.stringify(report.configuration);
      report.adapter = GPU.adapter.info ? { vendor: GPU.adapter.info.vendor, architecture: GPU.adapter.info.architecture,
        device: GPU.adapter.info.device, description: GPU.adapter.info.description } : null;
      if (kind === 'still' || kind === 'preview') {
        const name = selectedViews[0], selected = variant.value === 'all' ? 'combined' : variant.value;
        applyVariant(app, selected, stillCandidate, stage); pose(name);
        animatePreview = kind === 'preview';
        output.textContent = `Settling ${stillCandidate ? 'optimized' : 'baseline'} still: ${name}`;
        await paced(kind === 'preview' ? 360 : 60, controller.signal, signature, n => { output.textContent = `${kind} · ${name} · ${stillCandidate ? 'candidate' : 'baseline'} · ${n} frames`; });
        await GPU.queue.onSubmittedWorkDone(); guard(controller.signal, signature);
        assertLightingSettled();
        report.still = { view: name, variant: selected, mode: stillCandidate ? 'candidate' : 'baseline',
          internal: [app.sceneRenderer.width, app.sceneRenderer.height], drawStats: { ...app.engine.meshRenderer.stats } };
      } else {
        const total = selectedViews.length * selectedVariants.length * 8;
        for (const name of selectedViews) for (const selected of selectedVariants) for (let cycle = 0; cycle < 2; cycle++) for (const mode of ABBA) {
          guard(controller.signal, signature); applyVariant(app, selected, mode === 'candidate', stage); pose(name);
          const run = { view: name, variant: selected, cycle: cycle + 1, mode, complete: false,
            intervalsMs: [], cpuSubmitMs: [], gpuFrames: [],
            submissionStatsBefore: { ...app.engine.meshRenderer.submissionStats },
            heapBefore: performance.memory?.usedJSHeapSize ?? null,
            cameraBefore: { position: app.camera.position.toArray(), quaternion: app.camera.quaternion.toArray(), timeOfDay: app.settings.timeOfDay } };
          report.runs.push(run);
          const label = `${report.runs.length}/${total} · ${name} · ${selected} · ${mode} · cycle ${cycle + 1}`;
          output.textContent = `${label}\nWarming up…`;
          if (kind === 'foreground') await foreground(run, controller.signal, signature, label);
          else await gpuFrames(run, controller.signal, signature, label);
          guard(controller.signal, signature);
          run.internal = [app.sceneRenderer.width, app.sceneRenderer.height];
          run.cameraAfter = { position: app.camera.position.toArray(), quaternion: app.camera.quaternion.toArray(), timeOfDay: app.settings.timeOfDay };
          run.drawStats = { ...app.engine.meshRenderer.stats };
          run.submissionStats = { ...app.engine.meshRenderer.submissionStats };
          run.forestStats = { ...app.fourthIsland?.forestStats };
          if (stage === 3) run.animatedForestStats = { ...app.fourthIsland?.animatedForestStats };
          run.heapAfter = performance.memory?.usedJSHeapSize ?? null;
          run.complete = true; publish();
        }
        report.comparisons = comparisons(report.runs, kind === 'foreground' ? 'framePacing' : 'gpuTime');
      }
      report.status = 'complete'; report.valid = true;
      output.textContent = report.still ? `STILL READY · ${report.still.view} · ${report.still.mode}\n1600 × 900. Scene remains frozen for a screenshot.`
        : `COMPLETE · ${report.runs.length} runs\n${report.comparisons.map(row => `${row.name}: ${row.baseline.meanFPS.toFixed(2)} → ${row.candidate.meanFPS.toFixed(2)} mean FPS (${row.reductionPercent.toFixed(1)}% frame-time reduction)`).join('\n')}\nRaw results are ready to download.`;
    } catch (error) {
      report.status = controller.signal.aborted ? 'invalidated' : 'failed'; report.error = String(error.message || error);
      output.textContent = `${report.status.toUpperCase()} · ${report.error}\nPartial samples retained; do not count this run as evidence.`;
    } finally {
      if (bench) bench._capture = false;
      restore?.(); report.finishedAt = new Date().toISOString(); publish(); active = null; setBusy(false);
      animatePreview = false;
    }
  }

  live.onclick = () => execute('foreground'); gpu.onclick = () => execute('gpu');
  baseline.onclick = () => execute('still', false); optimized.onclick = () => execute('still', true);
  previewA.onclick = () => execute('preview', false); previewB.onclick = () => execute('preview', true);
  if (collisionReview) collisionReview.onclick = async () => {
    if (active) return;
    const controller = new AbortController(); active = controller; setBusy(true);
    report = { schema: 'elsemesh.world-collision-review/v1', kind: 'collision', stage,
      startedAt: new Date().toISOString(), status: 'running', valid: false,
      limitations: ['CPU query workload on the loaded collider geometry; not a game FPS benchmark'] };
    publish();
    try {
      await prepare(controller.signal);
      output.textContent = 'Measuring deterministic queries against the loaded world…';
      await nextFrame(controller.signal);
      const { runCollisionReview } = await import('./CollisionReview.js');
      report.result = runCollisionReview(app.colliders);
      if (!report.result.valid || !report.result.equivalence?.exact) throw Error('Indexed queries differ from the flat reference; result retained for diagnosis');
      report.status = 'complete'; report.valid = true;
      output.textContent = 'COMPLETE · world collision queries. Exact results and CPU timings are ready to download.';
    } catch (error) {
      report.status = 'failed'; report.error = String(error.message || error);
      output.textContent = `FAILED · ${report.error}`;
    } finally {
      report.finishedAt = new Date().toISOString(); publish(); active = null; setBusy(false);
    }
  };
  download.onclick = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `elsemesh-renderer-${report.kind}-${report.startedAt.replaceAll(':', '-')}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
