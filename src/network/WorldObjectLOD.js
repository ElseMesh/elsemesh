import { Vector3 } from '../engine/math/Vector3.js';
import { transformBoundsCenter } from './WorldStreaming.js';

const center = new Vector3();

// Screen fraction is projected sphere diameter divided by viewport height.
// Selection stays outside renderer traversal so hidden meshes can become active.
export function selectObjectLOD(object, camera, previous = 0) {
 if (!object.lods?.length || !object.streamingBounds) return 0;
 transformBoundsCenter(object, object.streamingBounds.center, center);
 const radius = object.streamingBounds.radius * Math.max(...(object.scale || [1,1,1]));
 const distance = camera.position.distanceTo(center);
 const fraction = distance <= radius ? Infinity : radius * Math.abs(camera.projectionMatrix.elements[5]) / Math.sqrt(distance * distance - radius * radius);
 let level = Math.min(previous, object.lods.length);
 while (level < object.lods.length && fraction < object.lods[level].maxScreenFraction * .88) level++;
 while (level > 0 && fraction > object.lods[level-1].maxScreenFraction * 1.12) level--;
 return level;
}

export class WorldObjectLOD {
 constructor({object, loadLevel, showLevel, onError = error => console.warn('Object LOD unavailable', error)}) {
  this.object = object; this.loadLevel = loadLevel; this.showLevel = showLevel; this.onError = onError;
  this.level = 0; this.desired = 0; this.loaded = new Set([0]); this.pending = new Map();
  this.controller = new AbortController(); this.retryAfter = new Map(); this.disposed = false;
 }
 update(camera, now = performance.now()) {
  if (this.disposed) return;
  const level = selectObjectLOD(this.object, camera, this.desired);
  this.desired = level;
  if (this.loaded.has(level)) {
   this.showLevel(level); this.level = level; return;
  }
  if (this.pending.has(level) || now < (this.retryAfter.get(level) || 0)) return;
  const pending = Promise.resolve().then(() => this.loadLevel(level, this.controller.signal)).then(() => {
   if (!this.disposed) this.loaded.add(level);
   // Visibility changes only in update(), using that render pass's camera.
  }).catch(error => {
   if (!this.disposed) { this.retryAfter.set(level, performance.now() + 5000); this.onError(error); }
  }).finally(() => this.pending.delete(level));
  this.pending.set(level,pending);
 }
 dispose() { if (this.disposed) return; this.disposed = true; this.controller.abort(new DOMException('World unloaded','AbortError')); }
}

// Bound simultaneous variant fetch/decode work across one package.
export class LODLoadQueue {
 constructor(limit = 2) { this.limit = limit; this.active = 0; this.waiting = []; }
 run(signal, task) {
  return new Promise((resolve,reject) => {
   if (signal.aborted) { reject(signal.reason); return; }
   const entry = {signal,task,resolve,reject};
   entry.abort = () => { const index = this.waiting.indexOf(entry); if (index >= 0) { this.waiting.splice(index,1); reject(signal.reason); } };
   signal.addEventListener('abort',entry.abort,{once:true});
   this.waiting.push(entry); this.pump();
  });
 }
 pump() {
  while (this.active < this.limit && this.waiting.length) {
   const entry = this.waiting.shift(); entry.signal.removeEventListener('abort',entry.abort);
   if (entry.signal.aborted) {entry.reject(entry.signal.reason);continue;}
   this.active++;
   Promise.resolve().then(() => entry.task()).then(entry.resolve,entry.reject).finally(() => {this.active--;this.pump();});
  }
 }
}
