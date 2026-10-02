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
		this._sunDir = new Vector3(0, 1, 0);
		this._sunColor = new Color(2.4, 2.6, 2.8);
		const copyGlobals = this.frameBlock.onBeforePack;
		this.frameBlock.onBeforePack = () => {
			copyGlobals();
			// Camera-owned worklight values; never mutate the global frame uniforms.
			this.frameBlock.fields.sunDir.value = this._sunDir;
			this.frameBlock.fields.sunColor.value = this._sunColor;
			this.frameBlock.fields.envIntensity.value = 1;
		};
		this._filter = (object) => {
			const grabber = this.app.game?.salvage?.grabber;
			for (let current = object; current; current = current.parent) {
				if (current === grabber) return false;
			}
			return true;
		};
		this._target = new Vector3();
		this._up = new Vector3();
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
			this._up.set(0, 0, 1);
			const boatQuaternion = this.app.boatCtl?.quaternion;
			if (boatQuaternion) this._up.applyQuaternion(boatQuaternion);
			this._up.y = 0;
			if (this._up.lengthSq() < 1e-6) this._up.set(0, 0, 1);
			this.camera.up.copy(this._up.normalize());
			this.camera.lookAt(this._target);
			this.camera.updateProjectionMatrix();
			setFrameCamera(this.camera, WIDTH, HEIGHT, { block: this.frameBlock });
			renderer.render(this.app.scene, {
				camera: this.camera,
				frameBlock: this.frameBlock,
				kind: 'color',
				defines: { STUDIO_LIGHTING: 1 },
				filter: this._filter,
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
