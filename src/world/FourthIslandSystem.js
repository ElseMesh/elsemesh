import { Box3, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, TorusGeometry, Vector3 } from '../engine/index.js';
import { loadGLB, decodeImage } from '../engine/loaders/GLTF.js';
import { Texture } from '../engine/gpu/Texture.js';
import { generateMipmaps } from '../engine/gpu/Mipmaps.js';
import { standard } from '../materials/Materials.js';
import { createTreeBarkMaterial } from './vegetation/ScannedBark.js';
import { FOURTH, fourthIslandContains } from './FourthIslandLayout.js';
import { TreeWildlife } from './TreeWildlife.js';
import { fruitTreeCrownGeometry, fruitTreeLeafMaterial } from './vegetation/FruitTreeCrown.js';

const ASSET = (import.meta.env.BASE_URL || '/') + 'models/buildings/forest-cabin.glb';
const leaf = standard({name:'Island Four forest canopy',color:0x315f32,roughness:.92});
leaf.underwaterLighting='none';leaf.localLightsCheap=true;
const bananaLeaf = standard({name:'Cartoon banana leaves',color:0x39a84d,roughness:.82});
const bananaSkin = standard({name:'Cartoon ripe bananas',color:0xffd83d,roughness:.72});
for(const material of [bananaLeaf,bananaSkin]){material.underwaterLighting='none';material.localLightsCheap=true;}

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
    this.app=app;this.time=0;this.group=new Group();this.group.name='Cartoon Island — forest villa';app.scene.add(this.group);
    this.bark=createTreeBarkMaterial();this.buildForest();this.wildlife=new TreeWildlife(this.group,this.trees,this.bark);this.addCollision();
    const y=app.terrainData.heightAt(FOURTH.villa.x,FOURTH.villa.z);
    this.ready=loadVilla().then(model=>{
      this.model=model;model.rotation.y=FOURTH.villa.yaw;model.scale.setScalar(1.16);model.updateMatrixWorld(true);
      // Agent Control: the source origin is above its visible base. Ground the measured geometry
      // bound rather than assuming y=0 is the cabin floor, which previously left it floating.
      const bounds=new Box3().setFromObject(model), base=bounds.min.y;
      model.position.set(FOURTH.villa.x,y+.08-base,FOURTH.villa.z);model.updateMatrixWorld(true);
      model.userData.grounding={measuredBase:base,targetY:y+.08};app.scene.add(model);return model;
    }).catch(error=>{this.error=error;console.error('Cartoon Island villa failed to load',error);});
  }
  buildForest() {
    const terrain=this.app.terrainData, colliders=this.app.colliders;
    const crownGeometry=fruitTreeCrownGeometry(), crownMaterial=fruitTreeLeafMaterial();
    this.trees=[];
    for(let index=0; index<82; index++) {
      const angle=index*2.3999632297, radius=23+(index%15)*6.1;
      const x=FOURTH.x+Math.cos(angle)*radius, z=FOURTH.z+Math.sin(angle)*radius*.78;
      if(!fourthIslandContains(x,z,-9))continue;
      if(Math.hypot(x-FOURTH.villa.x,(z-FOURTH.villa.z)*.82)<24)continue;
      if(z>FOURTH.villa.z-8&&Math.abs(x-FOURTH.villa.x)<38)continue;
      const y=terrain.heightAt(x,z);if(y<2.2)continue;
      const height=6.8+(index%7)*.72, root=new Group(), joints=[], crowns=[];root.position.set(x,y,z);root.rotation.y=(index*.71)%6.283;this.group.add(root);
      let parent=root;
      for(let jointIndex=0;jointIndex<9;jointIndex++){
        const joint=new Group();joint.position.y=jointIndex?height/9:0;parent.add(joint);joints.push(joint);
        const trunk=new Mesh(new CylinderGeometry(.44-(jointIndex+1)*.032,.44-jointIndex*.032,height/9+.04,8),this.bark);
        trunk.position.y=height/18;trunk.castShadow=true;joint.add(trunk);parent=joint;
      }
      for(let crownIndex=0;crownIndex<4;crownIndex++){
        const crown=new Mesh(crownGeometry,crownMaterial);const a=crownIndex*Math.PI*.5;
        crown.position.set(Math.cos(a)*.85,height/9-.65+crownIndex*.14,Math.sin(a)*.85);
        crown.scale.set(2.25,1.1,1.55);crown.rotation.y=a;crown.castShadow=true;parent.add(crown);crowns.push(crown);
      }
      // Agent Control: side limbs emerge from different trunk joints and rise at
      // varied angles, so the canopy reads as grown wood rather than horizontal props.
      for(let branchIndex=0;branchIndex<3;branchIndex++){
        const joint=joints[4+branchIndex], a=index*.91+branchIndex*2.18;
        const direction=new Vector3(Math.cos(a)*(1.65+branchIndex*.18),.72+branchIndex*.22,Math.sin(a)*(1.65+branchIndex*.18));
        const branch=new Mesh(new CylinderGeometry(.055,.15,direction.length(),7),this.bark);
        branch.position.copy(direction).multiplyScalar(.5);branch.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction.clone().normalize());branch.castShadow=true;joint.add(branch);
        const sideCrown=new Mesh(crownGeometry,crownMaterial);sideCrown.position.copy(direction);sideCrown.scale.set(1.2,.78,1.0);sideCrown.castShadow=true;joint.add(sideCrown);crowns.push(sideCrown);
      }
      this.trees.push({root,joints,crowns});colliders.addCylinder(x,z,.54,y,y+height,{tag:'cartoon-island-tree'});
    }
    this.buildBananaGrove(terrain,colliders);
  }
  buildBananaGrove(terrain,colliders) {
    const stemGeometry=new CylinderGeometry(.20,.31,4.3,8), leafGeometry=new SphereGeometry(1,10,6);
    for(let index=0;index<18;index++){
      const angle=index*2.3999632297,x=FOURTH.x-37+Math.cos(angle)*(13+(index%3)*4),z=FOURTH.z-8+Math.sin(angle)*(14+(index%4)*3);
      const y=terrain.heightAt(x,z);if(y<2||Math.hypot(x-FOURTH.villa.x,z-FOURTH.villa.z)<25)continue;
      const tree=new Group();tree.name='Cartoon banana tree';tree.position.set(x,y,z);tree.rotation.y=index*.83;this.group.add(tree);
      const stem=new Mesh(stemGeometry,leaf);stem.position.y=2.15;stem.castShadow=true;tree.add(stem);
      for(let leafIndex=0;leafIndex<7;leafIndex++){
        const a=leafIndex*Math.PI*2/7,blade=new Mesh(leafGeometry,bananaLeaf);blade.position.set(Math.cos(a)*1.25,4.45,Math.sin(a)*1.25);
        blade.scale.set(1.75,.12,.48);blade.rotation.y=-a;blade.rotation.z=(leafIndex%2?1:-1)*.18;blade.castShadow=true;tree.add(blade);
      }
      const bunch=new Group();bunch.position.set(.35,3.55,.15);tree.add(bunch);
      for(let hand=0;hand<3;hand++)for(let fruit=0;fruit<5;fruit++){
        const banana=new Mesh(new TorusGeometry(.16,.045,6,10,Math.PI*.82),bananaSkin);
        banana.position.set((fruit-2)*.105,-hand*.16,hand*.06);banana.rotation.set(Math.PI/2,.1*fruit,Math.PI*.15);banana.castShadow=true;bunch.add(banana);
      }
      colliders.addCylinder(x,z,.34,y,y+4.4,{tag:'cartoon-banana-tree'});
    }
  }
  addCollision() {
    const {colliders,terrainData}=this.app, {x,z}=FOURTH.villa, y=terrainData.heightAt(x,z);
    colliders.addBox(new Vector3(x,y+.08,z),new Vector3(6.2,.12,11.5),FOURTH.villa.yaw,{walkable:true,solid:true,tag:'island-four-villa-deck'});
    colliders.addBox(new Vector3(x,y+3.1,z-1),new Vector3(4.6,3,6.5),FOURTH.villa.yaw,{solid:true,tag:'island-four-villa-shell'});
  }
  update(dt) {
    this.time+=dt;
    for(let treeIndex=0;treeIndex<this.trees.length;treeIndex++){
      const tree=this.trees[treeIndex];
      for(let jointIndex=0;jointIndex<tree.joints.length;jointIndex++){
        const flex=jointIndex/(tree.joints.length-1);
        tree.joints[jointIndex].rotation.z=flex*Math.sin(this.time*.9+treeIndex*.37-jointIndex*.15)*.026;
        tree.joints[jointIndex].rotation.x=flex*Math.cos(this.time*.7+treeIndex*.29)*.016;
      }
    }
    this.wildlife?.update(dt,this.app.camera.position);
  }
}
