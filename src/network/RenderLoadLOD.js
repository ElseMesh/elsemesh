// Render work excludes intentional frame pacing and loading-screen compilation.
// CPU submission and, when available, GPU execution share the same frame budget.
export class RenderLoadLOD {
 constructor({ overloadSeconds = 2, recoverySeconds = 6 } = {}) {
  this.overloadSeconds = overloadSeconds; this.recoverySeconds = recoverySeconds;
  this.bias = 0; this.cpuOverload = 0; this.gpuOverload = 0; this.cpuHeadroom = 0; this.gpuHeadroom = 0; this.cpuFiltered = null; this.gpuFiltered = null;
 }
 sample({ cpuMs, gpuMs = null, budgetMs, elapsedSeconds, gpuElapsedSeconds = elapsedSeconds }) {
  if (![cpuMs, budgetMs, elapsedSeconds].every(Number.isFinite) ||
      cpuMs < 0 || budgetMs <= 0 || elapsedSeconds <= 0 || gpuMs !== null && (!Number.isFinite(gpuMs) || gpuMs < 0)) return this.bias;
  // A suspended tab or one compiler stall must not count as seconds of overload.
  const dt = Math.min(elapsedSeconds, .1);
  const cpuRatio = cpuMs / budgetMs;
  this.cpuFiltered = this.cpuFiltered === null ? cpuRatio : this.cpuFiltered + (cpuRatio - this.cpuFiltered) * (1 - Math.exp(-dt / .5));
  this.cpuOverload = this.cpuFiltered > 1.1 ? this.cpuOverload + dt : 0;
  this.cpuHeadroom = this.cpuFiltered < .75 ? this.cpuHeadroom + dt : 0;
  if (gpuMs !== null && Number.isFinite(gpuElapsedSeconds) && gpuElapsedSeconds > 0) {
   const gpuDt = Math.min(gpuElapsedSeconds, 1);
   const gpuRatio = gpuMs / budgetMs;
   this.gpuFiltered = this.gpuFiltered === null ? gpuRatio : this.gpuFiltered + (gpuRatio - this.gpuFiltered) * (1 - Math.exp(-gpuDt / .5));
   this.gpuOverload = this.gpuFiltered > 1.1 ? this.gpuOverload + gpuDt : 0;
   this.gpuHeadroom = this.gpuFiltered < .75 ? this.gpuHeadroom + gpuDt : 0;
  }
  if (this.cpuOverload >= this.overloadSeconds || this.gpuOverload >= this.overloadSeconds) {
   this.bias = Math.min(2, this.bias + 1); this.cpuOverload = this.gpuOverload = 0; this.cpuHeadroom = this.gpuHeadroom = 0;
  } else if (this.cpuHeadroom >= this.recoverySeconds && (this.gpuFiltered === null || this.gpuHeadroom >= this.recoverySeconds)) {
   this.bias = Math.max(0, this.bias - 1); this.cpuHeadroom = this.gpuHeadroom = 0;
  }
  return this.bias;
 }
}
