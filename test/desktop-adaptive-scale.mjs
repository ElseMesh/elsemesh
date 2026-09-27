import { App } from '../src/App.js';
import { Engine } from '../src/engine/Engine.js';

globalThis.location = { search: '' };
const linux = new App();
if ( ! linux.desktopAdaptiveScale || linux.settings.renderScale !== 0.75 || linux.desktopCanvasScale !== 0.8 || linux.desktopFrameRateLimit !== 24 ) throw new Error( 'Linux desktop should start with adaptive scaling and a 24 fps GPU budget' );

Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { platform: 'Linux arm64', userAgent: 'Mozilla/5.0 Android 16' } } );
const android = new App();
if ( android.desktopAdaptiveScale || android.autoScale || android.settings.renderScale !== 1 || android.desktopCanvasScale !== 1 || android.desktopFrameRateLimit !== 0 ) throw new Error( 'Android should keep the original full-quality path' );

const originalRAF = globalThis.requestAnimationFrame;
function countFrames( maxFps, rafFrames ) {

	let callback, n = 0;
	globalThis.requestAnimationFrame = ( fn ) => { callback = fn; return 1; };
	const clock = {
		last: 0, delta: 0, elapsed: 0,
		update( t ) { this.delta = t - this.last; this.last = t; this.elapsed = t; },
		getDelta() { return this.delta / 1000; },
		getElapsed() { return this.elapsed / 1000; },
	};
	const engine = { clock, frame: 0 };
	Engine.prototype.start.call( engine, () => n ++, maxFps );
	for ( let i = 1; i <= rafFrames; i ++ ) callback( i * 1000 / 60 );
	return n;

}
if ( countFrames( 24, 120 ) !== 48 ) throw new Error( 'Linux frame pacing should average 24 fps on a 60 Hz display' );
if ( countFrames( 0, 120 ) !== 120 ) throw new Error( 'Uncapped frame pacing should preserve every animation frame' );
if ( originalRAF === undefined ) delete globalThis.requestAnimationFrame;
else globalThis.requestAnimationFrame = originalRAF;

const scales = { engine: 1, post: 1 };
linux.engine = { get renderScale() { return scales.engine; }, setRenderScale( v ) { scales.engine = v; } };
linux.post = { get scale() { return scales.post; }, setScale( v ) { scales.post = v; } };
linux.clouds = { resolutionScale: 1 };
linux.setRenderScale( 0.75 ); // initialization must apply the Linux output scale despite the default setting
if ( scales.engine !== 0.8 || Math.abs( scales.post - 0.9375 ) > 1e-6 || Math.abs( linux.clouds.resolutionScale - 0.9375 ) > 1e-6 ) throw new Error( 'Linux should preserve internal and cloud resolution while reducing post output size' );
linux.setRenderScale( 0.5 );
if ( scales.engine !== 0.8 || Math.abs( scales.post - 0.625 ) > 1e-6 || Math.abs( linux.clouds.resolutionScale - 0.625 ) > 1e-6 ) throw new Error( 'Linux render scale should keep the canvas at 80% and preserve effective internal and cloud scale' );

globalThis.location.search = '?scale=0.5';
const manual = new App();
if ( manual.autoScale ) throw new Error( '?scale must disable automatic render-scale changes' );

const changes = [];
const app = {
	autoScale: true,
	settings: { renderScale: 0.75 },
	_scaleBelowTarget: 0,
	_scaleAboveTarget: 0,
	setRenderScale( scale ) { changes.push( scale ); this.settings.renderScale = scale; },
};

App.prototype.adaptRenderScale.call( app, 23 );
if ( changes.length !== 0 ) throw new Error( 'scale changed before a sustained low-FPS sample' );
App.prototype.adaptRenderScale.call( app, 23 );
if ( changes.at( - 1 ) !== 0.7 ) throw new Error( 'scale did not step down below 24 fps' );

for ( let i = 0; i < 16; i ++ ) App.prototype.adaptRenderScale.call( app, 38 );
if ( changes.at( - 1 ) !== 0.75 ) throw new Error( 'scale did not recover slowly above 36 fps' );

app.autoScale = false;
for ( let i = 0; i < 20; i ++ ) App.prototype.adaptRenderScale.call( app, 10 );
if ( changes.length !== 2 ) throw new Error( 'manual scale should disable automatic changes' );

app.autoScale = true;
app.settings.renderScale = 0.5;
app._scaleBelowTarget = 0;
changes.length = 0;
for ( let i = 0; i < 20; i ++ ) App.prototype.adaptRenderScale.call( app, 10 );
if ( changes.length !== 0 ) throw new Error( 'automatic scaling must stop at 50% resolution' );

console.log( 'ok   Linux adaptive render scale hysteresis and manual override' );
