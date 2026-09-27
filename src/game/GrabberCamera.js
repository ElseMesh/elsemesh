import { Color, PerspectiveCamera, Vector3 } from '../engine/index.js';
import { GPU } from '../engine/gpu/GPU.js';
import { createViewUniforms, setFrameCamera } from '../engine/render/Frame.js';

const WIDTH = 512;
const HEIGHT = 288;
const INTERVAL = 100;

/** Independent low-rate WebGPU view mounted above the salvage grabber. */
export class GrabberCamera {
	constructor(app, canvas) {
		this.app = app;
		this.canvas = canvas;
		this.visible = false;
		this.lastRender = -Infinity;
		this.error = null;
		this.context = null;
		this.depth = null;
		this.camera = new PerspectiveCamera(62, WIDTH / HEIGHT, 0.03, 60);
		this.camera.up.set(0, 0, 1);
		this.frameBlock = createViewUniforms('salvage-grabber-camera');
		const copyGlobals = this.frameBlock.onBeforePack;
		this.frameBlock.onBeforePack = () => {
			copyGlobals();
			// These values are deliberately owned rather than mutated after the global copy.
			this.frameBlock.fields.cameraUnderwater.value = 1;
			this.frameBlock.fields.exposure.value = 1.35;
			this.frameBlock.fields.skyIrradiance.value = new Color(0.18, 0.42, 0.52);
			this.frameBlock.fields.sunColor.value = new Color(0.12, 0.34, 0.4);
		};
		this._target = new Vector3();
		this._init();
	}

	_init() {
		try {
			if (!GPU.device || !this.canvas?.getContext) throw new Error('WebGPU is unavailable');
			this.canvas.width = WIDTH;
			this.canvas.height = HEIGHT;
			this.context = this.canvas.getContext('webgpu');
			if (!this.context) throw new Error('WebGPU canvas context is unavailable');
			this.context.configure({ device: GPU.device, format: GPU.format, usage: GPUTextureUsage.RENDER_ATTACHMENT, alphaMode: 'opaque' });
			this.depth = GPU.device.createTexture({
				label: 'salvage-grabber-depth',
				size: [WIDTH, HEIGHT],
				format: 'depth32float',
				usage: GPUTextureUsage.RENDER_ATTACHMENT,
			});
		} catch (error) {
			this.error = `Grabber camera unavailable: ${error.message}`;
		}
	}

	setVisible(visible) {
		this.visible = !!visible;
	}

	render(hook, now = performance.now()) {
		if (!this.visible || this.error || !hook || now - this.lastRender < INTERVAL) return false;
		const renderer = this.app.engine?.meshRenderer;
		if (!renderer || !GPU.encoder || !this.context || !this.depth) return false;
		this.lastRender = now;
		try {
			this.camera.position.set(hook[0], hook[1] - 0.23, hook[2]);
			this._target.set(hook[0], hook[1] - 4, hook[2] + 0.08);
			this.camera.lookAt(this._target);
			this.camera.updateProjectionMatrix();
			setFrameCamera(this.camera, WIDTH, HEIGHT, { block: this.frameBlock });
			renderer.render(this.app.scene, {
				camera: this.camera,
				frameBlock: this.frameBlock,
				kind: 'color',
				colorViews: [this.context.getCurrentTexture().createView()],
				colorFormats: [GPU.format],
				depthView: this.depth.createView(),
				depthFormat: 'depth32float',
				clearColors: [[0.015, 0.09, 0.12, 1]],
				clearDepth: 0,
			});
			return true;
		} catch (error) {
			this.error = `Grabber camera stopped: ${error.message}`;
			return false;
		}
	}

	dispose() {
		this.visible = false;
		this.depth?.destroy();
		this.depth = null;
		if (this.context?.unconfigure) this.context.unconfigure();
		this.context = null;
	}
}
