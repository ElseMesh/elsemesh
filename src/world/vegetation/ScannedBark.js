// Agent Control: shared, bounded CC0 bark maps for instanced and articulated trees.
import { Texture } from '../../engine/gpu/Texture.js';
import { generateMipmaps } from '../../engine/gpu/Mipmaps.js';
import { standard } from '../../materials/Materials.js';

const sets = {};
let loading;
export function loadScannedBark() {
	return loading ||= Promise.all(['palm_tree_bark', 'tree_bark_03'].map(async id => {
		const textures = {};
		await Promise.all(['Diffuse', 'nor_gl', 'arm'].map(async name => {
			const response = await fetch((import.meta.env?.BASE_URL || '/') + `textures/vegetation/${id}-${name}.jpg`);
			if (!response.ok) throw new Error(`Missing bark map: ${id}/${name}`);
			const bitmap = await createImageBitmap(await response.blob());
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
			ctx.drawImage(bitmap, 0, 0);
			const texture = new Texture({label: id + name, width: bitmap.width, height: bitmap.height,
				format: name === 'Diffuse' ? 'rgba8unorm-srgb' : 'rgba8unorm', mips: true,
				data: new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer)});
			bitmap.close(); texture.getGPU(); generateMipmaps(texture);
			textures['bark' + name] = texture;
		}));
		sets[id] = textures;
	}));
}
export const barkTextures = palm => sets[palm ? 'palm_tree_bark' : 'tree_bark_03'];

// Agent Control: tangent reconstruction respects bent branches, with no displacement mesh cost.
export const barkSurface = uv => `
	let barkUV = ${uv};
	let barkColor = textureSample(barkDiffuse, smpAniso4Repeat, barkUV).rgb;
	let barkARM = textureSample(barkarm, smpLinearRepeat, barkUV).rgb;
	let barkN = textureSample(barknor_gl, smpLinearRepeat, barkUV).xyz * 2.0 - 1.0;
	s.albedo = barkColor;
	s.normal = perturbNormalByMap(in.P, in.N, barkUV, vec3f(barkN.xy * 0.65, barkN.z));
	s.roughness = clamp(barkARM.g, 0.6, 1.0);
	s.ao *= barkARM.r;
`;

export function createTreeBarkMaterial() {
	const m = standard({name: 'Scanned wind-bent bark', textures: barkTextures(false), surface: barkSurface('in.uv')});
	m.localLightsCheap = true;
	return m;
}
