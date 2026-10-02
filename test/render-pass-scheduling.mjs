import test from 'node:test';
import assert from 'node:assert/strict';
import { GPU } from '../src/engine/gpu/GPU.js';
import { FrameUniforms, G } from '../src/engine/render/Frame.js';
import { Matrix4, Vector2 } from '../src/engine/math/index.js';
import { SceneRenderer } from '../src/engine/render/SceneRenderer.js';
import { WaterMaterial } from '../src/ocean/WaterMaterial.js';
import { PostFX } from '../src/post/PostFX.js';
import { AirHaze } from '../src/post/AirHaze.js';
import { GTAO } from '../src/post/GTAO.js';

const texture = name => ({ view: () => name, getGPU: () => name });
const target = name => ({ texture: texture(name) });
const pass = (events, name) => ({ render: () => events.push(name) });

test('unused SSR depth is skipped without skipping refraction, and resumes before water in the same frame', () => {
  const events = [], originalEncoder = GPU.getEncoder;
  GPU.getEncoder = () => ({ copyTextureToTexture: (from, to) => events.push(to.texture) });
  try {
    const water = Object.create(WaterMaterial.prototype);
    water.params = { ssr: { value: 0 } };
    const scene = Object.assign(Object.create(SceneRenderer.prototype), {
      scene: {}, camera: {}, waterMaterial: water, optimizeWaterDepthCopy: false,
      meshRenderer: { render: (_scene, p) => events.push(p.label) },
      sceneRT: { textures: [texture('color')], texture: texture('color'), depthTexture: texture('depth'), formats: [], width: 8, height: 8 },
      opaqueCopy: { texture: texture('color copy'), depthTexture: texture('depth copy') },
      opaqueDepthHalf: target('half depth'), _depthHalfPass: pass(events, 'SSR depth'),
      hullMasks: [], onBeforeWater: () => events.push('refraction'),
    });
    scene.render();
    assert(events.includes('SSR depth'), 'baseline still renders the existing pass');
    events.length = 0;
    scene.optimizeWaterDepthCopy = true;
    scene.render();
    assert.deepEqual(events, ['opaque', 'color copy', 'depth copy', 'refraction', 'water + transparent']);
    events.length = 0;
    water.params.ssr.value = 1;
    scene.render();
    assert.deepEqual(events, ['opaque', 'color copy', 'depth copy', 'SSR depth', 'refraction', 'water + transparent']);
    events.length = 0;
    water.params.ssr.value = 0.5;
    scene.render();
    assert(!events.includes('SSR depth'), 'threshold matches the shader');
    events.length = 0;
    scene.waterMaterial = null;
    scene.render();
    assert(events.includes('SSR depth'), 'unknown consumer fails closed');
  } finally { GPU.getEncoder = originalEncoder; }
});

function postFixture(events) {
  return Object.assign(Object.create(PostFX.prototype), {
    _built: true, optimizeDisabledEffects: false, params: { optimizeDisabledEffects: { value: 0 }, aoStrength: { value: 0 }, bloom: { value: 0 } },
    motionBlur: { compute() {} }, _outW: 8, _outH: 8,
    _aoDepthPass: pass(events, 'AO depth'), aoDepth: target('AO depth'), aoPass: { ...pass(events, 'AO'), advanceFrame: () => events.push('AO phase') },
    _aoBlurXPass: pass(events, 'AO x'), aoBlurX: target('AO x'), _aoBlurYPass: pass(events, 'AO y'), aoBlurY: target('AO y'),
    _mediumPass: pass(events, 'medium'), medium: target('medium'), underwater: {},
    haze: { update() {}, render: flag => events.push(`haze:${flag}`) },
    _beautyPass: pass(events, 'beauty'), beauty: target('beauty'), aaMode: 'taa', taau: pass(events, 'TAA'),
    _bloomPasses: Array.from({ length: 9 }, (_, i) => [pass(events, `bloom:${i}`), target(`bloom:${i}`)]),
    outputTexture: texture('out'), _finalPass: pass(events, 'final'), meterKernel: { dispatch: () => events.push('exposure') },
  });
}

test('zero effects preserve lens/exposure downsamples and restore all consumers before nonzero effects', () => {
  const events = [], post = postFixture(events);
  post.render();
  assert.equal(events.filter(x => x.startsWith('AO')).length, 4);
  assert.equal(events.filter(x => x.startsWith('bloom:')).length, 9);
  events.length = 0;
  post.optimizeDisabledEffects = true;
  post.render();
  assert.equal(post.params.optimizeDisabledEffects.value, 1);
  assert.deepEqual(events.filter(x => x.startsWith('AO')), ['AO phase']);
  assert.deepEqual(events.filter(x => x.startsWith('bloom:')), ['bloom:0', 'bloom:1', 'bloom:2', 'bloom:3']);
  assert(events.includes('haze:true'));
  assert.deepEqual(events.slice(-2), ['final', 'exposure']);
  events.length = 0;
  post.params.aoStrength.value = 0.000001;
  post.params.bloom.value = 0.000001;
  post.render();
  assert.equal(events.filter(x => x.startsWith('AO')).length, 4, 'no approximate zero threshold');
  assert.equal(events.filter(x => x.startsWith('bloom:')).length, 9);
  assert(events.indexOf('AO y') < events.indexOf('beauty'));
  assert(events.indexOf('bloom:8') < events.indexOf('final'));
  events.length = 0;
  post.optimizeDisabledEffects = false;
  post.params.aoStrength.value = 0;
  post.params.bloom.value = 0;
  post.render();
  assert.equal(post.params.optimizeDisabledEffects.value, 0);
  assert.equal(events.filter(x => x.startsWith('bloom:')).length, 9);
});

test('skipped AO frames preserve the temporal sampling sequence on resume', () => {
  const makeAO = () => {
    const ao = new GTAO(null, null);
    ao.useTemporalFiltering = true;
    ao._currentSamples = ao.samples.value;
    ao._pass = { render() {} };
    return ao;
  };
  const baseline = makeAO(), candidate = makeAO();
  const F = FrameUniforms.fields, oldProj = F.proj.value, oldJitter = F.jitter.value;
  try {
    F.proj.value = new Matrix4();
    F.jitter.value = new Vector2();
    for (let frame = 0; frame < 17; frame++) {
      baseline.render();
      candidate.advanceFrame();
    }
    assert.equal(candidate._frame, 17);
    baseline.render();
    candidate.render();
    assert.equal(candidate.uniforms.fields.temporalDirection.value, baseline.uniforms.fields.temporalDirection.value);
    assert.equal(candidate.uniforms.fields.temporalOffset.value, baseline.uniforms.fields.temporalOffset.value);
    candidate.useTemporalFiltering = false;
    candidate.advanceFrame();
    assert.equal(candidate._frame, 18, 'non-temporal AO does not advance the sequence');
    assert.equal(candidate.uniforms.fields.temporalDirection.value, 0);
    assert.equal(candidate.uniforms.fields.temporalOffset.value, 1);
  } finally { F.proj.value = oldProj; F.jitter.value = oldJitter; }
});

test('inactive haze skips unused work and invalidates history before resuming', () => {
  const events = [], previousUnderwater = G.cameraUnderwater.value;
  const historyValue = { value: 1 };
  const haze = Object.assign(Object.create(AirHaze.prototype), {
    enabled: { value: 1 }, shafts: { value: 1 }, ssFade: { value: 0 }, _histValid: true, _hc: 0,
    uniforms: { fields: { histValid: historyValue } }, low: target('low'), hist: [target('h0'), target('h1')],
    _passes: { march: pass(events, 'march'), temporal: [0, 1].map(() => ({ render: () => events.push(`history:${historyValue.value}`) })) },
  });
  try {
    G.cameraUnderwater.value = 0;
    haze.render(true);
    assert.deepEqual(events, ['march', 'history:1']);
    events.length = 0;
    G.cameraUnderwater.value = 1;
    haze.render(true);
    assert.deepEqual(events, []);
    assert.equal(haze._histValid, false);
    G.cameraUnderwater.value = 0;
    haze.render(true);
    assert.deepEqual(events, ['march', 'history:0'], 'first resumed frame cannot use stale shafts');
    events.length = 0;
    haze.shafts.value = 0;
    haze.render(true);
    assert.deepEqual(events, []);
    haze.render(false);
    assert.deepEqual(events, ['march', 'history:0'], 'baseline remains available');
  } finally { G.cameraUnderwater.value = previousUnderwater; }
});
