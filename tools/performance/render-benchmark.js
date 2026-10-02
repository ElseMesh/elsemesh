// Agent Control: run from a ?bench page; fixed output, views and sample counts for before/after comparison.
export async function measure(app = window.__app, bench = window.__bench, profile = 'balanced', width = 1280, height = 720) {
	if (!bench?.enabled) throw new Error('GPU timestamps unavailable; this device cannot run the GPU benchmark');
	app.engine.stop(); app.thirdIsland.active = false; app.player.mode = 'walk'; app.monorail.state = 'station';
	app.kaiju.elapsed = 92; app.monorail.marine.time = 0;
	app.settings.clockMode = 'manual'; app.settings.timeSpeed = 0; app.setQuality(profile);
	const originalSize = bench.setSize;
	bench.setSize = () => originalSize.call(bench, width, height);
	try {
		return { author: 'Agent Control', profile, output: [width, height], internalScale: app.post.scale,
			device: navigator.userAgent, warm: 45, frames: 90,
			result: await bench.run({ views: ['beach', 'boatHelm', 'cave', 'tunnel'], warm: 45, frames: 90, top: 8 }) };
	} finally { bench.setSize = originalSize; }
}
