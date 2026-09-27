// Agent Control: shared, mipmapped CC0 stone maps; world projection also works on unwrapped scans.
import { Texture } from '../engine/gpu/Texture.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';
import { standard } from '../materials/Materials.js';

export async function loadCaveStone() {
	const base = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'textures/cave/';
	const textures = {};
	await Promise.all(['albedo', 'normal', 'arm'].map(async name => {
		const response = await fetch(base + name + '.jpg');
		if (!response.ok) throw new Error('Cave stone map missing: ' + name);
		const bitmap = await createImageBitmap(await response.blob());
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
		ctx.drawImage(bitmap, 0, 0);
		const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
		const texture = new Texture({ label: 'caveStone_' + name, width: bitmap.width, height: bitmap.height,
			format: name === 'albedo' ? 'rgba8unorm-srgb' : 'rgba8unorm', mips: true,
			data: new Uint8Array(pixels.data.buffer) });
		bitmap.close();
		texture.getGPU(); generateMipmaps(texture);
		textures['stone' + name] = texture;
	}));
	const material = standard({ name: 'UNDERNEATH_scanned_stone', color: 0xffffff, side: 'double', roughness: 0.9,
		textures, surface: /* wgsl */`
		let p = in.P / 1.8;
		let n = normalize(in.N);
		let weights = pow(abs(n), vec3f(4.0));
		let w = weights / max(dot(weights, vec3f(1.0)), 0.0001);
		let a = textureSample(stonealbedo, smpAniso4Repeat, p.zy).rgb * w.x
			+ textureSample(stonealbedo, smpAniso4Repeat, p.xz).rgb * w.y
			+ textureSample(stonealbedo, smpAniso4Repeat, p.xy).rgb * w.z;
		let arm = textureSample(stonearm, smpLinearRepeat, p.zy).rgb * w.x
			+ textureSample(stonearm, smpLinearRepeat, p.xz).rgb * w.y
			+ textureSample(stonearm, smpLinearRepeat, p.xy).rgb * w.z;
		let nx = textureSample(stonenormal, smpLinearRepeat, p.zy).xyz * 2.0 - 1.0;
		let ny = textureSample(stonenormal, smpLinearRepeat, p.xz).xyz * 2.0 - 1.0;
		let nz = textureSample(stonenormal, smpLinearRepeat, p.xy).xyz * 2.0 - 1.0;
		s.normal = normalize(perturbNormalByMap(in.P, n, p.zy, nx) * w.x
			+ perturbNormalByMap(in.P, n, p.xz, ny) * w.y
			+ perturbNormalByMap(in.P, n, p.xy, nz) * w.z);
		let wet = 1.0 - smoothstep(-0.3, 1.8, in.P.y);
		s.albedo = a * mix(0.95, 0.53, wet);
		s.roughness = max(0.24, arm.g * mix(1.0, 0.5, wet));
		s.ao = arm.r;
		s.emissive = a * 0.025;
	` });
	material.localLightsCheap = true;
	return material;
}

export function isCaveRock(name) {
	return /Cavern|Entrance_Rock|Passage|Junction|Underneath_Hall|Hall_Roof|Salt|Landing|Wading|Basalt|Descent|Alcove|Corridor|Station_Approach/.test(name);
}
