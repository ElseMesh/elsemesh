import { App } from '../src/App.js';

globalThis.location = { search: '' };
const linux = new App();
if ( ! linux.desktopAdaptiveScale || linux.settings.renderScale !== 0.75 || linux.desktopCanvasScale !== 0.8 ) throw new Error( 'Linux desktop should start with adaptive scaling' );

Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { platform: 'Linux arm64', userAgent: 'Mozilla/5.0 Android 16' } } );
const android = new App();
if ( android.desktopAdaptiveScale || android.autoScale || android.settings.renderScale !== 1 || android.desktopCanvasScale !== 1 ) throw new Error( 'Android should keep the original full-quality path' );

const scales = { engine: 1, post: 1 };
linux.engine = { get renderScale() { return scales.engine; }, setRenderScale( v ) { scales.engine = v; } };
linux.post = { get scale() { return scales.post; }, setScale( v ) { scales.post = v; } };
linux.clouds = { resolutionScale: 1 };
linux.setRenderScale( 0.75 ); // initialization must apply the Linux output scale despite the default setting
if ( scales.engine !== 0.8 || Math.abs( scales.post - 0.9375 ) > 1e-6 || linux.clouds.resolutionScale !== 0.75 ) throw new Error( 'Linux should preserve internal scale while reducing post output size' );
linux.setRenderScale( 0.5 );
if ( scales.engine !== 0.8 || Math.abs( scales.post - 0.625 ) > 1e-6 ) throw new Error( 'Linux render scale should keep the canvas at 80% and preserve effective internal scale' );

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
