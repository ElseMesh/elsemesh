import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const assetRoot=new URL('../public/models/port/ivy-trial/',import.meta.url);
test('public ivy provenance identifies the retained generated source texture',()=>{
  const provenance=readFileSync(new URL('PROVENANCE.md',assetRoot),'utf8');
  const texture=readFileSync(new URL('ivy-leaf-source.png',assetRoot));
  const hash=createHash('sha256').update(texture).digest('hex');
  assert.ok(provenance.includes(hash),'source PNG matches the public provenance hash');
  assert.match(provenance,/generated artwork, not a photograph and not a CC0 third-party asset/i);
  assert.match(provenance,/transparent_background: true/);
});
for (const kind of ['building', 'fence']) test(`${kind} ivy retains UVs, masked foliage and bounded geometry`, () => {
  const bytes = readFileSync(new URL(`${kind}-ivy.glb`,assetRoot));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  let triangles=0,foliagePrimitives=0;
  // Clustered growth now includes more plants and connecting petioles.
  assert.ok(bytes.length < 1000000);
  assert.equal(json.images.length, 1);
  const image=json.images[0],view=json.bufferViews[image.bufferView];
  assert.equal(image.mimeType,'image/png');
  const imageStart=28+bytes.readUInt32LE(12)+(view.byteOffset||0);
  const png=bytes.subarray(imageStart,imageStart+view.byteLength);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);
  assert.equal(png[25],6,'embedded leaf PNG retains RGBA alpha');
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode??4,4);
    triangles+=json.accessors[primitive.indices??primitive.attributes.POSITION].count/3;
    const material = json.materials[primitive.material];
    if (!material.pbrMetallicRoughness.baseColorTexture) continue;
    foliagePrimitives++;
    assert.equal(json.textures[material.pbrMetallicRoughness.baseColorTexture.index].source,0);
    assert.equal(material.alphaMode, 'MASK');
    assert.equal(material.alphaCutoff??.5,.5);
    assert.equal(material.doubleSided, true);
    assert.notEqual(primitive.attributes.TEXCOORD_0, undefined);
    assert.equal(json.accessors[primitive.attributes.TEXCOORD_0].count,
      json.accessors[primitive.attributes.POSITION].count);
  }
  assert.ok(foliagePrimitives>0,'real leaf geometry uses the embedded source texture');
  assert.ok(triangles>0 && triangles < (kind === 'building' ? 10000 : 1600));
});
