import { GPU } from './gpu/GPU.js';
import { PerspectiveCamera } from './scene/Camera.js';
import { Scene } from './scene/Scene.js';
import { Timer } from './math/Timer.js';
import { MeshRenderer } from './render/MeshRenderer.js';
import { FrameUniforms } from './render/Frame.js';
import { FrameTiming } from './FrameTiming.js';

// Canvas, device, main camera / scene and the frame loop.
export class Engine {

	constructor( container ) {

		this.container = container;
		this.renderScale = 1;
		this.maxOutputPixels = Infinity; // Agent Control: cap full-resolution post buffers on smaller GPUs.
		this.clock = new Timer();
		this._frameTiming = new FrameTiming();
		this.activeFrameTiming = null;
		this.frame = 0;
		this.onResize = [];

	}

	async init() {

		const canvas = document.createElement( 'canvas' );
		canvas.tabIndex = 0;
		this.container.appendChild( canvas );
		this.canvas = canvas;
		this.domElement = canvas;
		await GPU.init( { canvas } );
		this.meshRenderer = new MeshRenderer();
		this.meshRenderer.syncPipelines = false; // compile in the background (App.precompile waits for them)
		this.camera = new PerspectiveCamera( 62, window.innerWidth / window.innerHeight, 0.06, 60000 );
		this.scene = new Scene();
		window.addEventListener( 'resize', () => this.resize() );
		this.resize();

	}

	setRenderScale( s ) {

		this.renderScale = s;
		this.resize();

	}

	// output (canvas) size in pixels
	get width() {

		return this.canvas.width;

	}

	get height() {

		return this.canvas.height;

	}

	resize() {

		const w = window.innerWidth, h = window.innerHeight;
		const dpr = Math.min(this.renderScale, Math.sqrt(this.maxOutputPixels / (w * h)));
		this.canvas.width = Math.max( 1, Math.floor( w * dpr ) );
		this.canvas.height = Math.max( 1, Math.floor( h * dpr ) );
		this.canvas.style.width = w + 'px';
		this.canvas.style.height = h + 'px';
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		FrameUniforms.fields.outputResolution.value.set( this.canvas.width, this.canvas.height );
		for ( const f of this.onResize ) f( w, h );

	}

	// the canvas texture of this frame (render target of the final post pass)
	currentTexture() {

		return GPU.context.getCurrentTexture();

	}

	start( update ) {

		this.stop();
		this._running = true;
		this._frameTiming.invalidate();
		this.clock.reset();
		this._visibilityDocument = typeof document === 'undefined' ? null : document;
		if ( this._visibilityDocument ) {

			this.clock.connect( this._visibilityDocument );
			this._visibilityHandler = () => this._frameTiming.invalidate();
			this._visibilityDocument.addEventListener( 'visibilitychange', this._visibilityHandler );

		}
		const loop = ( t ) => {

			if ( ! this._running || this._loop !== loop ) return;
			this.clock.update( t );
			const hidden = this._visibilityDocument?.hidden === true;
			const timing = this._frameTiming.update( t, hidden );
			if ( ! hidden ) {

				const dt = timing.valid ? Math.max( 0, Math.min( this.clock.getDelta(), 0.1 ) ) : 0;
				this.frame ++;
				// Only expose this sample during the live callback. Manual benchmark
				// frames must not accidentally reuse an old display interval.
				this.activeFrameTiming = timing;
				try { update( dt, this.clock.getElapsed(), timing ); }
				finally { this.activeFrameTiming = null; }

			}
			if ( this._running && this._loop === loop ) this._raf = requestAnimationFrame( loop );

		};

		this._loop = loop;
		this._raf = requestAnimationFrame( loop );

	}

	stop() {

		this._running = false;
		this._loop = null;
		if ( this._raf !== undefined ) cancelAnimationFrame( this._raf );
		this._raf = undefined;
		this.clock.disconnect();
		if ( this._visibilityHandler ) {

			this._visibilityDocument.removeEventListener( 'visibilitychange', this._visibilityHandler );
			this._visibilityHandler = null;

		}
		this._visibilityDocument = null;
		this._frameTiming.invalidate();

	}

}
