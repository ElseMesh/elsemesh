// Building #002 — exact author-linked "Abandoned Warehouse" runtime integration.
// Building #001 (PortalInterior) remains a separate system. Source/provenance: CREDITS.md.
import { BufferAttribute, BufferGeometry, Group, Mesh, Vector3 } from '../engine/index.js';
import { loadGLB, decodeImage } from '../engine/loaders/GLTF.js';
import { Texture } from '../engine/gpu/Texture.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';
import { standard } from '../materials/Materials.js';

const ASSET = (import.meta.env.BASE_URL || '/') + 'models/buildings/abandoned-warehouse.glb';
const ORIGIN = Object.freeze({ x: 145, z: 600, yaw: Math.PI / 2 });

function floats(attribute) {
  if (attribute.array instanceof Float32Array) return attribute.array;
  const out = new Float32Array(attribute.array.length);
  const divisor = attribute.normalized ? ({ Int8Array:127, Uint8Array:255, Int16Array:32767, Uint16Array:65535 }[attribute.array.constructor.name] || 1) : 1;
  for (let i=0;i<out.length;i++) out[i] = Math.max(-1, attribute.array[i] / divisor);
  return out;
}

async function makeTexture(gltf, textureInfo, srgb, cache) {
  if (!textureInfo) return null;
  const source = gltf.textures[textureInfo.index]?.source;
  if (source === undefined) return null;
  const key = `${source}:${srgb?'s':'l'}`;
  if (cache.has(key)) return cache.get(key);
  const image = gltf.images[source];
  const pixels = await decodeImage(image.bytes, image.mimeType);
  const texture = new Texture({label:`building-002-${key}`,width:pixels.width,height:pixels.height,format:srgb?'rgba8unorm-srgb':'rgba8unorm',data:pixels.data,mips:true,usage:['sample','copyDst'],sampler:'anisoRepeat'});
  texture.getGPU(); generateMipmaps(texture); cache.set(key,texture); return texture;
}

async function makeMaterial(gltf, index, textureCache, materialCache) {
  if (materialCache.has(index)) return materialCache.get(index);
  const source = gltf.materials[index] || {}, pbr = source.pbrMetallicRoughness || {}, textures = {};
  textures.albedo = await makeTexture(gltf,pbr.baseColorTexture,true,textureCache);
  textures.orm = await makeTexture(gltf,pbr.metallicRoughnessTexture,false,textureCache);
  textures.normal = await makeTexture(gltf,source.normalTexture,false,textureCache);
  Object.keys(textures).forEach(k=>{if(!textures[k])delete textures[k];});
  const base=pbr.baseColorFactor||[1,1,1,1];
  const surface=`
#if HAS_ALBEDO
 let bc=textureSample(chAlbedo,smpAnisoRepeat,in.uv);s.albedo*=bc.rgb;s.alpha*=bc.a;
#endif
#if HAS_ORM
 let orm=textureSample(chOrm,smpAnisoRepeat,in.uv);s.roughness*=orm.g;s.metalness*=orm.b;
#endif
#if HAS_NORMAL
 let nm=textureSample(chNormal,smpAnisoRepeat,in.uv).xyz*2.0-1.0;s.normal=perturbNormalByMap(in.P,in.N,in.uv,nm);
#endif`;
  const color=(Math.round(base[0]*255)<<16)|(Math.round(base[1]*255)<<8)|Math.round(base[2]*255);
  const material=standard({name:`Building 002 · ${source.name||index}`,color,opacity:base[3],roughness:pbr.roughnessFactor??1,metalness:pbr.metallicFactor??1,textures:{...(textures.albedo&&{chAlbedo:textures.albedo}),...(textures.orm&&{chOrm:textures.orm}),...(textures.normal&&{chNormal:textures.normal})},surface,side:source.doubleSided?'double':'front',alphaTest:source.alphaMode==='OPAQUE'?0:(source.alphaCutoff??.5),defines:{HAS_ALBEDO:textures.albedo?1:0,HAS_ORM:textures.orm?1:0,HAS_NORMAL:textures.normal?1:0}});
  material.underwaterLighting='none'; materialCache.set(index,material); return material;
}

async function buildGLBScene(url) {
  const gltf=await loadGLB(url), root=new Group(), nodes=gltf.nodes.map(n=>{const g=new Group();g.name=n.name;g.position.set(...n.t);g.quaternion.set(n.r[0],n.r[1],n.r[2],n.r[3]);g.scale.set(...n.s);return g;});
  const textures=new Map(), materials=new Map();
  for(let i=0;i<gltf.nodes.length;i++){
    const node=gltf.nodes[i];
    if(node.mesh!==undefined)for(const primitive of gltf.meshes[node.mesh]){
      if(primitive.mode!==4)continue;
      const geometry=new BufferGeometry(), A=primitive.attributes;
      geometry.setAttribute('position',new BufferAttribute(floats(A.POSITION),3));
      if(A.NORMAL)geometry.setAttribute('normal',new BufferAttribute(floats(A.NORMAL),3));
      if(A.TEXCOORD_0)geometry.setAttribute('uv',new BufferAttribute(floats(A.TEXCOORD_0),2));
      if(primitive.indices)geometry.setIndex(new BufferAttribute(primitive.indices,1));
      geometry.computeBoundingSphere();
      const mesh=new Mesh(geometry,await makeMaterial(gltf,primitive.material,textures,materials));mesh.castShadow=true;nodes[i].add(mesh);
    }
    for(const child of node.children)nodes[i].add(nodes[child]);
  }
  for(const index of gltf.roots)root.add(nodes[index]);
  root.userData={sourceUrl:'https://sketchfab.com/3d-models/abandoned-warehouse-698a34300af34095ac6593f348585daa',runtimeMeshes:gltf.meshes.length};
  return root;
}

export class AbandonedWarehouse {
  constructor(app){
    this.app=app;this.group=new Group();this.group.name='Building #002 — Abandoned Warehouse';
    const ground=app.terrainData.heightAt(ORIGIN.x,ORIGIN.z);this.ground=ground;
    this.group.position.set(ORIGIN.x,ground+.52,ORIGIN.z);this.group.rotation.y=ORIGIN.yaw;app.scene.add(this.group);
    this.addAccessAndCollision();
    this.ready=buildGLBScene(ASSET).then(scene=>{this.model=scene;this.group.add(scene);return scene;}).catch(error=>{console.error('Building #002 failed to load',error);this.error=error;});
  }
  addAccessAndCollision(){
    const C=this.app.colliders, y=this.ground;
    // Source bounds after its 90 degree placement: x 121.7..169.3, z 589.6..630.9.
    C.addBox(new Vector3(145,y-.04,610.25),new Vector3(23.6,.12,20.5),0,{walkable:true,solid:true,tag:'building-002-floor'});
    C.addBox(new Vector3(169,y+3,610.25),new Vector3(.28,3,20.5),0,{solid:true,tag:'building-002-wall'});
    C.addBox(new Vector3(145,y+3,630.7),new Vector3(24,3,.28),0,{solid:true,tag:'building-002-wall'});
    C.addBox(new Vector3(145,y+3,589.8),new Vector3(24,3,.28),0,{solid:true,tag:'building-002-wall'});
    // West wall leaves the source main-gate span (z 592..600) open.
    C.addBox(new Vector3(121.9,y+3,590.9),new Vector3(.28,3,1.1),0,{solid:true,tag:'building-002-wall'});
    C.addBox(new Vector3(121.9,y+3,615.35),new Vector3(.28,3,15.35),0,{solid:true,tag:'building-002-wall'});
    // The island heightfield now provides continuous grass between both
    // warehouses. Building #001's signed portal remains the shared landmark.
  }
  update(){}
}

export { ORIGIN as BUILDING_002_ORIGIN };
