// Small headless correctness check, not an FPS benchmark. Run separately from
// browser performance measurements: node test/animated-forest-gpu.mjs [report.json]
import './headless.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { OrthographicCamera, PerspectiveCamera, Scene, Vector3 } from '../src/engine/index.js';
import { GPU } from '../src/engine/gpu/GPU.js';
import { RenderTarget, Texture } from '../src/engine/gpu/Texture.js';
import { readTexture } from '../src/engine/gpu/Readback.js';
import { FrameUniforms, createViewUniforms, setFrameCamera } from '../src/engine/render/Frame.js';
import { MeshRenderer } from '../src/engine/render/MeshRenderer.js';
import { setShadowMap } from '../src/engine/render/wgsl/lighting.js';
import { fromHalfFloat } from '../src/engine/math/DataUtils.js';
import { animatedForestFixture } from './animated-forest-fixture.mjs';

const W=256,H=256, errors=[];
const originalError=console.error;
console.error=(...args)=>{errors.push(args.map(String).join(' '));originalError(...args);};
// readTexture returns an ArrayBuffer, not a typed-array view.
const decodeHalf = data => Float32Array.from(new Uint16Array(data),fromHalfFloat);
const decodeFloat = data => new Float32Array(data);

async function renderTree(enabled,kind) {
  const s=animatedForestFixture({count:1,diagnosticMaterials:true}), scene=new Scene(), mr=new MeshRenderer();
  const tree=s.trees[0];tree.root.position.set(0,0,0);scene.add(s.group);
  const camera=kind==='depth' ? new OrthographicCamera(-9,9,14,-2,.1,80) : new PerspectiveCamera(42,1,.1,100);
  camera.position.set(14,10,18);camera.lookAt(0,5,0);
  if(kind==='depth'){camera.reversedDepth=false;camera.updateProjectionMatrix();camera.isShadowCamera=true;}
  const formats=kind==='depth'?[]:kind==='main'?['rgba16float','rgba16float','rgba8unorm']:['rgba16float'];
  const rt=new RenderTarget(W,H,{colors:formats,depth:'depth32float',label:`forest-${enabled}-${kind}`});
  const block=createViewUniforms(`forest-${enabled}-${kind}`);
  FrameUniforms.fields.seaLevel.value=5;
  for(const time of [4,4.35]) {
    GPU.beginFrame();
    if(time>4){s.group.position.x=.035;s.group.rotation.y=.004;}
    s.distantForest.update(time,new Vector3(),false);
    s.animatedForest.update(enabled);
    setFrameCamera(camera,W,H,{block});
    mr.render(scene,{camera,frameBlock:block,kind,cull:false,
      colorViews:rt.textures.map(t=>t.view()),colorFormats:formats,
      clearColors:formats.map(()=>[0,0,0,0]),depthView:rt.depthTexture.view(),depthFormat:'depth32float',
      clearDepth:kind==='depth'?1:0,depthCompare:kind==='depth'?'less-equal':'greater-equal',
      ...(kind==='color'?{defines:{REFRACTION_CLIP:1,REFRACTION_CLIP_MARGIN:.02}}:{})});
    GPU.submit();
  }
  await GPU.pipelinesReady();
  const depth=decodeFloat((await readTexture(rt.depthTexture)).data);
  const color=rt.textures[0]?decodeHalf((await readTexture(rt.textures[0])).data):null;
  const velocity=kind==='main'?decodeHalf((await readTexture(rt.textures[1])).data):null;
  assert.equal(depth.length,W*H,'depth readback contains the complete fixture');
  if(color)assert.equal(color.length,W*H*4,'color readback contains the complete fixture');
  if(velocity)assert.equal(velocity.length,W*H*4,'motion readback contains the complete fixture');
  assert.equal(mr.stats.draws,enabled?2:19,'fixture exercises the intended draw reduction');
  return {depth,color,velocity};
}

function compare(a,b,channels,stride,pixels) {
  let total=0,max=0,signal=0;const values=[];
  for(const pixel of pixels)for(let k=0;k<channels;k++) {
    const x=a[pixel*stride+k],y=b[pixel*stride+k];
    assert.ok(Number.isFinite(x)&&Number.isFinite(y),'rendered values must be finite');
    const error=Math.abs(x-y);values.push(error);total+=error*error;max=Math.max(max,error);signal+=Math.abs(x);
  }
  values.sort((x,y)=>x-y);
  return {samples:values.length,rms:Math.sqrt(total/values.length),p995:values[Math.floor((values.length-1)*.995)],max,
    signal:signal/values.length};
}

try {
  await GPU.init({headless:true});
  GPU.device.addEventListener('uncapturederror',event=>errors.push(event.error.message));
  // MeshShader installs the lighting module's binding layout even for unlit
  // diagnostics. The real game supplies this texture through SunShadows.
  setShadowMap(new Texture({width:1,height:1,depth:1,dimension:'2d-array',format:'depth32float',usage:['sample']}));
  const report={schema:'elsemesh.animated-forest-gpu/v1',width:W,height:H,results:[]};
  for(const kind of ['main','depth','color']) {
    const baseline=await renderTree(false,kind),candidate=await renderTree(true,kind);
    const pixels=[];let union=0,mismatch=0;
    for(let i=0;i<W*H;i++) {
      const a=kind==='depth'?baseline.depth[i]<1:baseline.depth[i]>0;
      const b=kind==='depth'?candidate.depth[i]<1:candidate.depth[i]>0;
      if(a||b)union++;if(a!==b)mismatch++;if(a&&b)pixels.push(i);
    }
    assert.ok(pixels.length>100,`${kind}: enough actual geometry must be visible`);
    assert.ok(mismatch<=Math.max(2,union*.01),`${kind}: coverage differs at ${mismatch}/${union} pixels`);
    const result={kind,coveredPixels:pixels.length,coverageMismatch:mismatch,coverageUnion:union,
      depth:compare(baseline.depth,candidate.depth,1,1,pixels)};
    assert.ok(result.depth.rms<1e-5,`${kind}: depth RMS ${result.depth.rms}`);
    if(baseline.color) {
      result.color=compare(baseline.color,candidate.color,3,4,pixels);
      assert.ok(result.color.rms<.005,`${kind}: normal/UV color RMS ${result.color.rms}`);
      assert.ok(result.color.p995<.003,`${kind}: normal/UV color p99.5 ${result.color.p995}`);
    }
    if(baseline.velocity) {
      result.velocity=compare(baseline.velocity,candidate.velocity,2,4,pixels);
      assert.ok(result.velocity.signal>1e-5,'moving-pose fixture must have a nonzero motion signal');
      assert.ok(result.velocity.rms<3e-5,`current/previous wind velocity RMS ${result.velocity.rms}`);
      assert.ok(result.velocity.p995<1e-4,`current/previous wind velocity p99.5 ${result.velocity.p995}`);
    }
    report.results.push(result);
  }
  await GPU.device.queue.onSubmittedWorkDone();
  assert.deepEqual(errors,[]);
  report.valid=true;
  if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  process.exit(0);
} catch(error) { console.error(error);process.exit(1); }
