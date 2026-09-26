// Records actual game canvas frames, with a small evidence overlay, to a local
// receiver. No video frames are synthesized; the 3D view is drawImage(game canvas).
export class VideoEvidence {
	constructor(demo, receiver = 'ws://127.0.0.1:42907') {
		this.demo = demo; this.receiver = receiver; this.started = false;
	}
	start() {
		if (this.started || !window.MediaRecorder) return;
		this.started = true;
		const socket = new WebSocket(this.receiver);
		socket.binaryType = 'arraybuffer';
		socket.onopen = () => {
			const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
			const ctx = canvas.getContext('2d');
			const source = this.demo.app.engine.domElement;
			const start = performance.now();
			const draw = () => {
				try { ctx.drawImage(source, 0, 0, 960, 540); } catch { return; }
				ctx.fillStyle = 'rgba(3,19,29,.78)'; ctx.fillRect(0, 0, 960, 85);
				ctx.fillStyle = '#eaffff'; ctx.font = 'bold 23px system-ui';
				ctx.fillText(`BURNING HORIZONS · ${this.demo.role.toUpperCase()} — ${this.demo.role === 'loz' ? 'HUMAN' : 'AI'}`, 20, 30);
				ctx.font = '15px system-ui';
				ctx.fillText(`Node ${this.demo.identity.nodeId.slice(0, 20)}… · ${this.demo.physical ? 'TWO PHYSICAL NODES' : 'LOCAL TWO-NODE DEMO'} · ${this.demo.remote.state ? 'CONNECTED' : 'WAITING'}`, 20, 54);
				ctx.fillText(`Sector bh:ISLAND-01 · Authority ${this.demo.role === 'loz' ? 'LOZ' : 'LOZ remote'} · Agent ${this.demo.agent?.command.tool || 'human input'}`, 20, 75);
				ctx.fillStyle = this.demo.remote.verified() && this.demo.localMoved && this.demo.remoteMoved ? '#9cffb2' : '#ffda90';
				ctx.fillText(this.demo.remote.verified() && this.demo.localMoved && this.demo.remoteMoved ? 'NETWORK VERIFIED' : 'Awaiting bidirectional movement', 20, 520);
		};
			draw(); this.timer = setInterval(draw, 83);
			const recorder = new MediaRecorder(canvas.captureStream(12), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 2500000 });
			this.recorder = recorder;
			recorder.ondataavailable = async (event) => {
				if (event.data.size && socket.readyState === WebSocket.OPEN) socket.send(await event.data.arrayBuffer());
			};
			recorder.onstop = () => { clearInterval(this.timer); setTimeout(() => socket.close(), 1000); };
			recorder.start(1000);
			setTimeout(() => recorder.stop(), 30000);
		};
	}
}
