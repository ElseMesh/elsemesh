import { BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from '../engine/index.js';
import { loadGLB, decodeImage } from '../engine/loaders/GLTF.js';
import { Texture } from '../engine/gpu/Texture.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';
import { standard } from '../materials/Materials.js';
import { createTreeBarkMaterial } from './vegetation/ScannedBark.js';
import { FOURTH, fourthIslandContains } from './FourthIslandLayout.js';

const ASSET = (import.meta.env.BASE_URL || '/') + 'models/buildings/forest-cabin.glb';
const leaf = standard({name:'Island Four forest canopy',color:0x315f32,roughness:.92});
leaf.underwaterLighting='none';leaf.localLightsCheap=true;

function floats(attribute) {
  if (attribute.array instanceof Float32Array) return attribute.array;
  const output = new Float32Array(attribute.array.length);
  const divisor = attribute.normalized ? ({Int8Array:127,Uint8Array:255,Int16Array:32767,Uint16Array:65535}[attribute.array.constructor.name] || 1) : 1;
  for (let index=0; index<output.length; index++) output[index] = Math.max(-1, attribute.array[index] / divisor);
  return output;
}

async function texture(gltf, info, srgb, cache) {
  if (!info) return null;
  const source = gltf.textures[info.index]?.source;
  if (source === undefined) return null;
  const key = `${source}:${srgb?'s':'l'}`;
  if (cache.has(key)) return cache.get(key);
  const image = gltf.images[source], pixels = await decodeImage(image.bytes,image.mimeType);
  const result = new Texture({label:`island-four-villa-${key}`,width:pixels.width,height:pixels.height,format:srgb?'rgba8unorm-srgb':'rgba8unorm',data:pixels.data,mips:true,usage:['sample','copyDst'],sampler:'anisoRepeat'});
  result.getGPU();generateMipmaps(result);cache.set(key,result);return result;
}

async function material(gltf, index, textureCache, materialCache) {
  if (materialCache.has(index)) return materialCache.get(index);
  const source=gltf.materials[index]||{}, pbr=source.pbrMetallicRoughness||{};
  const albedo=await texture(gltf,pbr.baseColorTexture,true,textureCache);
  const orm=await texture(gltf,pbr.metallicRoughnessTexture,false,textureCache);
  const normal=await texture(gltf,source.normalTexture,false,textureCache);
  const base=pbr.baseColorFactor||[1,1,1,1];
  const color=(Math.round(base[0]*255)<<16)|(Math.round(base[1]*255)<<8)|Math.round(base[2]*255);
  const surface=`
#if HAS_ALBEDO
 let bc=textureSample(villaAlbedo,smpAnisoRepeat,in.uv);s.albedo*=bc.rgb;s.alpha*=bc.a;
#endif
#if HAS_ORM
 let mr=textureSample(villaOrm,smpAnisoRepeat,in.uv);s.roughness*=mr.g;s.metalness*=mr.b;
#endif
#if HAS_NORMAL
 let nm=textureSample(villaNormal,smpAnisoRepeat,in.uv).xyz*2.0-1.0;s.normal=perturbNormalByMap(in.P,in.N,in.uv,nm);
#endif`;
  const result=standard({name:`Island Four villa · ${source.name||index}`,color,opacity:base[3],roughness:pbr.roughnessFactor??1,metalness:pbr.metallicFactor??1,textures:{...(albedo&&{villaAlbedo:albedo}),...(orm&&{villaOrm:orm}),...(normal&&{villaNormal:normal})},surface,side:source.doubleSided?'double':'front',alphaTest:source.alphaMode==='OPAQUE'?0:(source.alphaCutoff??.5),defines:{HAS_ALBEDO:albedo?1:0,HAS_ORM:orm?1:0,HAS_NORMAL:normal?1:0}});
  result.underwaterLighting='none';result.localLightsCheap=true;materialCache.set(index,result);return result;
}

async function loadVilla() {
  const gltf=await loadGLB(ASSET), root=new Group();
  const nodes=gltf.nodes.map(node=>{const group=new Group();group.name=node.name;group.position.set(...node.t);group.quaternion.set(node.r[0],node.r[1],node.r[2],node.r[3]);group.scale.set(...node.s);return group;});
  const textures=new Map(), materials=new Map();
  for(let index=0; index<gltf.nodes.length; index++) {
    const node=gltf.nodes[index];
    if(node.mesh!==undefined) for(const primitive of gltf.meshes[node.mesh]) {
      if(primitive.mode!==4) continue;
      const geometry=new BufferGeometry(), attributes=primitive.attributes;
      geometry.setAttribute('position',new BufferAttribute(floats(attributes.POSITION),3));
      if(attributes.NORMAL)geometry.setAttribute('normal',new BufferAttribute(floats(attributes.NORMAL),3));
      if(attributes.TEXCOORD_0)geometry.setAttribute('uv',new BufferAttribute(floats(attributes.TEXCOORD_0),2));
      if(primitive.indices)geometry.setIndex(new BufferAttribute(primitive.indices,1));
      geometry.computeBoundingSphere();
      const mesh=new Mesh(geometry,await material(gltf,primitive.material,textures,materials));mesh.castShadow=true;mesh.receiveShadow=true;nodes[index].add(mesh);
    }
    for(const child of node.children)nodes[index].add(nodes[child]);
  }
  for(const rootIndex of gltf.roots)root.add(nodes[rootIndex]);
  root.userData={sourceUrl:'https://www.blendkit.com/asset-gallery-detail/a1b23c3e-5e04-4ee5-8dc5-ce4016d0e90a/',license:'CC0',runtimeSha256:'d63b2edf668272d53c1217e9413f3810b94e548b4ea56313c2cf3a264c457d6c'};
  return root;
}

export class FourthIslandSystem {
  constructor(app) {
    this.app=app;this.group=new Group();this.group.name='Island Four — forest villa';app.scene.add(this.group);
    this.bark=createTreeBarkMaterial();this.buildForest();this.addCollision();
    const y=app.terrainData.heightAt(FOURTH.villa.x,FOURTH.villa.z);
    this.ready=loadVilla().then(model=>{this.model=model;model.position.set(FOURTH.villa.x,y+.08,FOURTH.villa.z);model.rotation.y=FOURTH.villa.yaw;model.scale.setScalar(1.16);app.scene.add(model);return model;}).catch(error=>{this.error=error;console.error('Island Four villa failed to load',error);});
  }
  buildForest() {
    const terrain=this.app.terrainData, colliders=this.app.colliders;
    const trunkGeometry=new CylinderGeometry(.42,.58,1,8), crownGeometry=new SphereGeometry(1,9,6);
    this.trees=[];
    for(let index=0; index<92; index++) {
      const angle=index*2.3999632297, radius=23+(index%15)*6.1;
      const x=FOURTH.x+Math.cos(angle)*radius, z=FOURTH.z+Math.sin(angle)*radius*.78;
      if(!fourthIslandContains(x,z,-9))continue;
      if(Math.hypot(x-FOURTH.villa.x,(z-FOURTH.villa.z)*.82)<24)continue;
      if(z>FOURTH.villa.z-8&&Math.abs(x-FOURTH.villa.x)<38)continue;
      const y=terrain.heightAt(x,z);if(y<2.2)continue;
      const height=6.8+(index%7)*.72, root=new Group();root.position.set(x,y,z);root.rotation.y=(index*.71)%6.283;this.group.add(root);
      const trunk=new Mesh(trunkGeometry,this.bark);trunk.position.y=height*.5;trunk.scale.set(1+(index%3)*.08,height,1+(index%3)*.08);trunk.castShadow=true;root.add(trunk);
      const crown=new Mesh(crownGeometry,leaf);crown.position.y=height+.8;crown.scale.set(2.6+(index%4)*.28,2.2+(index%3)*.22,2.6+(index%5)*.2);crown.castShadow=true;root.add(crown);
      this.trees.push(root);colliders.addCylinder(x,z,.54,y,y+height,{tag:'island-four-tree'});
    }
  }
  addCollision() {
    const {colliders,terrainData}=this.app, {x,z}=FOURTH.villa, y=terrainData.heightAt(x,z);
    colliders.addBox(new Vector3(x,y+.08,z),new Vector3(6.2,.12,11.5),FOURTH.villa.yaw,{walkable:true,solid:true,tag:'island-four-villa-deck'});
    colliders.addBox(new Vector3(x,y+3.1,z-1),new Vector3(4.6,3,6.5),FOURTH.villa.yaw,{solid:true,tag:'island-four-villa-shell'});
  }
  update() {}
}
