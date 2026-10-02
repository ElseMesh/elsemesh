import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from '../src/engine/scene/Camera.js';
import { LODLoadQueue, WorldObjectLOD, selectObjectLOD } from '../src/network/WorldObjectLOD.js';
import { loadWorldPackage, updateWorldPackageLOD, disposeWorldPackage, registerWorldPackageCollisions } from '../src/network/WorldPackage.js';
import { Colliders } from '../src/world/Colliders.js';

const camera = new PerspectiveCamera(60,1,.1,1000);
const object = {id:'tw-object:lod', kind:'asset-instance', label:'LOD fixture', assetId:'full', transform:{position:[0,0,-10],yaw:0},scale:[1,1,1], streamingBounds:{center:[0,0,0],radius:1}, collision:{enabled:true,shape:'box',center:[0,0,0],halfExtents:[1,1,1],walkable:true,solid:true},lods:[{assetId:'medium',maxScreenFraction:.12},{assetId:'low',maxScreenFraction:.04}]};
assert.equal(selectObjectLOD(object,camera),0);
camera.position.z = 20;
assert.equal(selectObjectLOD(object,camera),1);
camera.position.z = 60;
assert.equal(selectObjectLOD(object,camera),2);
camera.position.z = 4;
assert.equal(selectObjectLOD(object,camera,1),1,'Retain lower detail in hysteresis band');
camera.position.z = 0;
assert.equal(selectObjectLOD(object,camera,1),0);
let finish;
const shown = [];
const controller = new WorldObjectLOD({object,loadLevel: () => new Promise(resolve => {finish=resolve;}),showLevel: level => shown.push(level)});
camera.position.z = 60; controller.update(camera); await Promise.resolve();
camera.position.z = 0; controller.update(camera); finish(); await controller.pending.get(2);
assert.deepEqual(shown,[0],'Late distant download cannot change near view');
camera.position.z = 60; controller.update(camera); assert.equal(shown.at(-1),2);
controller.dispose(); controller.dispose(); assert.ok(controller.controller.signal.aborted);

// Texture-free real GLBs exercise package installation without a fake GPU.
function meshGLB(triangles) {
 const positions = new Float32Array(triangles * 9);
 for(let t=0;t<triangles;t++) positions.set([0,0,0,1,0,0,0,1,0],t*9);
 const json = {asset:{version:'2.0'},buffers:[{byteLength:positions.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength}],accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:'VEC3'}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.4,.6,1]}}],meshes:[{primitives:[{attributes:{POSITION:0},material:0,mode:4}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
 const encoded = new TextEncoder().encode(JSON.stringify(json)); const padded = Math.ceil(encoded.length/4)*4;
 const buffer = new ArrayBuffer(12+8+padded+8+positions.byteLength); const view = new DataView(buffer);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,buffer.byteLength,true);
 view.setUint32(12,padded,true);view.setUint32(16,0x4e4f534a,true);
 new Uint8Array(buffer,20,padded).fill(32);new Uint8Array(buffer,20,encoded.length).set(encoded);
 view.setUint32(20+padded,positions.byteLength,true);view.setUint32(24+padded,0x004e4942,true);
 new Uint8Array(buffer,28+padded).set(new Uint8Array(positions.buffer));return buffer;
}
const payloads = new Map([['full',meshGLB(8)],['medium',meshGLB(4)],['low',meshGLB(2)]]);
const requests=[];
const connector={worldId:'tw-world:lod',manifest:{objects:[object],portals:[]},getAsset:async id => {requests.push(id);return payloads.get(id);}};
const root = await loadWorldPackage(connector,{assets:new Map([['full',payloads.get('full')]])});
const instance=root.children[0]; const colliders = new Colliders(); registerWorldPackageCollisions(root,colliders);
const originalCollider=root.userData.worldPackage.activeColliders.get(object.id).collider;
function visibleTriangles() {
 let total=0; function visit(node) {if(!node.visible)return;if(node.isMesh)total+=node.geometry.getAttribute('position').count/3;for(const child of node.children)visit(child);}visit(root);return total;
}
assert.equal(visibleTriangles(),8);
camera.position.z=60;updateWorldPackageLOD(root,camera);
await root.userData.worldPackage.lodControllers.get(object.id).pending.get(2);
updateWorldPackageLOD(root,camera);
assert.equal(visibleTriangles(),2); assert.deepEqual(requests,['low'],'Far view loads desired variant directly');
assert.equal(root.children[0],instance,'Visual replacement preserves instance wrapper');
registerWorldPackageCollisions(root,colliders);
assert.equal(root.userData.worldPackage.activeColliders.get(object.id).collider,originalCollider,'LOD does not replace collision');
camera.position.z=0;updateWorldPackageLOD(root,camera);assert.equal(visibleTriangles(),8);
const portalCamera=new PerspectiveCamera(60,1,.1,1000);portalCamera.position.z=20;
updateWorldPackageLOD(root,portalCamera);await root.userData.worldPackage.lodControllers.get(object.id).pending.get(1);
updateWorldPackageLOD(root,portalCamera);assert.equal(visibleTriangles(),4,'Independent camera selects its own detail');
updateWorldPackageLOD(root,camera);assert.equal(visibleTriangles(),8,'Main view restores its detail after preview');
// Sustained-load bias changes actual visible geometry using each render camera.
camera.position.z=0;
const adaptive=root.userData.worldPackage.lodControllers.get(object.id);
adaptive.update(camera,performance.now(),1);await adaptive.pending.get(1);
adaptive.update(camera,performance.now(),1);assert.equal(visibleTriangles(),4,'Load bias selects real reduced geometry');
adaptive.update(camera,performance.now(),0);assert.equal(visibleTriangles(),8,'Headroom restores original geometry');
portalCamera.position.z=60;adaptive.update(portalCamera,performance.now(),2);
assert.equal(visibleTriangles(),2,'Mapped distant preview uses its own biased level');
camera.position.z=-7;adaptive.update(camera,performance.now(),2);
assert.equal(visibleTriangles(),8,'Large near view retains full detail under maximum load');
disposeWorldPackage(root);disposeWorldPackage(root);
assert.ok(root.userData.worldPackage.lodControllers.get(object.id).controller.signal.aborted);
console.log('Object LOD: projected selection, hysteresis, async races, real GLB triangle reductions, collision and per-camera restoration passed');

const authored = JSON.parse(readFileSync(new URL('../worlds/island/world-source.json',import.meta.url)));
authored.objects[0].lods=[{assetId:'sha256:'+'a'.repeat(64),maxScreenFraction:.12},{assetId:'sha256:'+'b'.repeat(64),maxScreenFraction:.04}];
const validation = `import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('actions',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
source=json.load(sys.stdin)
module.validate_source(source)
source['objects'][0]['lods'][1]['maxScreenFraction']=.5
try: module.validate_source(source)
except ValueError: pass
else: raise AssertionError('unordered LOD thresholds accepted')
`;
execFileSync('python3',['-B','-c',validation,fileURLToPath(new URL('../tools/blender/world_actions.py',import.meta.url))],{input:JSON.stringify(authored),stdio:['pipe','pipe','pipe']});
console.log('Blender authoring accepts valid levels and rejects unordered thresholds');

const queue = new LODLoadQueue(1), release = [];
const firstSignal = new AbortController(), cancelledSignal = new AbortController();
let releaseFirst;
const firstTask = queue.run(firstSignal.signal, () => new Promise(resolve => {releaseFirst=resolve;}));
await Promise.resolve();
const cancelledTask = queue.run(cancelledSignal.signal, () => {throw new Error('Cancelled queued work ran');});
const lastTask = queue.run(firstSignal.signal, () => release.push('last'));
const rejected = assert.rejects(cancelledTask,{name:'AbortError'});
cancelledSignal.abort(new DOMException('World unloaded','AbortError')); await rejected;
assert.equal(queue.active,1); assert.deepEqual(release,[]);
releaseFirst(); await firstTask; await lastTask; assert.deepEqual(release,['last']);
console.log('LOD acquisition concurrency and queued cancellation passed');
