import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGLB } from '../src/engine/loaders/GLTF.js';

const load = name => parseGLB(readFileSync(new URL(`../public/models/characters/${name}.glb`, import.meta.url)));
const triangles = source => source.meshes.flat().reduce((sum, p) => sum + p.indices.length / 3, 0);
for (const name of ['stock-player', 'stock-female']) {
	const full = load(name);
	for (const [level, ratio] of [['medium', .5], ['low', .25]]) {
		const lod = load(`${name}-${level}`);
		assert.ok(Math.abs(triangles(lod) / triangles(full) - ratio) < .02, `${name} ${level}: expected triangle reduction`);
		assert.equal(lod.skins.length, full.skins.length);
		for (let i = 0; i < lod.skins.length; i++) {
			const boneNames = source => source.skins[i].joints.map(j => source.nodes[j].name).sort();
			assert.deepEqual(boneNames(lod), boneNames(full), 'Every source joint survives');
			assert.equal(lod.skins[i].inverseBindMatrices.length, full.skins[i].inverseBindMatrices.length);
		}
		assert.deepEqual(lod.animations.map(a => a.name).sort(), ['helm', 'idle', 'run', 'walk']);
		for (const clip of full.animations) {
			const reduced = lod.animations.find(a => a.name === clip.name);
			assert.ok(Math.abs(reduced.duration - clip.duration) < .00001, `${clip.name}: duration preserved`);
			assert.equal(reduced.channels.length, clip.channels.length);
			for (const channel of reduced.channels) assert.ok(channel.values.every(Number.isFinite));
		}
		for (const material of full.materials) {
			const reduced = lod.materials.find(m => m.name === material.name);
			assert.ok(reduced, `${material.name}: tint material preserved`);
			assert.ok(reduced.pbrMetallicRoughness.baseColorTexture);
			assert.equal(reduced.alphaMode, material.alphaMode);
			assert.equal(reduced.doubleSided, material.doubleSided);
			if (material.normalTexture) assert.ok(reduced.normalTexture);
			if (material.occlusionTexture) assert.ok(reduced.occlusionTexture);
		}
		for (const primitive of lod.meshes.flat()) {
			for (const field of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) assert.ok(primitive.attributes[field], `${field} survives decimation`);
			const weights = primitive.attributes.WEIGHTS_0.array;
			for (let i = 0; i < weights.length; i += 4) assert.ok(Math.abs(weights[i] + weights[i+1] + weights[i+2] + weights[i+3] - 1) < .001, 'Skin weights remain normalized');
			assert.ok(primitive.attributes.JOINTS_0.array.every(j => j < lod.skins[0].joints.length));
		}
		console.log(`${name} ${level}: ${triangles(lod)} triangles; skeleton, clips, skin weights and tint materials preserved`);
	}
}
