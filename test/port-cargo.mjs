import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cargoPose,PortCargoSequence,CARGO_DURATION} from '../src/world/PortCargoSequence.js';
import {PORT,portIslandHeight} from '../src/world/PortRoadGraph.js';
import {PortCargoScene} from '../src/world/PortCargoScene.js';
import {Group,Vector3} from '../src/engine/index.js';
import {PORT_VEHICLE_FOOTPRINTS} from '../src/world/PortTraffic.js';
test('arrival hull remains in water and clear of berth',()=>{
  for(let t=0;t<=35;t+=.1){
    const p=cargoPose(t);
    for(const dx of [-25,0,27])for(const dz of [-4.5,4.5])
      assert.ok(portIslandHeight(PORT.x+p.ship.x+dx,PORT.z+p.ship.z+dz)<-2.2);
    assert.ok(p.ship.z-4.5>161);
  }
});
test('cargo stays attached during lift and traverses above gunwale',()=>{
  for(let t=43;t<80;t+=.1){
    const p=cargoPose(t);assert.ok(p.attached);
    assert.ok(Math.abs(p.hook.y-p.cargo.y-1.4)<1e-9);
    assert.equal(p.hook.z,p.cargo.z);
    if(t>=55&&t<68)assert.ok(p.cargo.y-1.3>9);
  }
});
test('stable final placement and safe repeat/reset',()=>{
  const seq=new PortCargoSequence();assert.ok(seq.start());assert.equal(seq.start(),false);
  for(let i=0;i<1200;i++)seq.update(.1);
  assert.equal(seq.running,false);assert.equal(seq.pose.seconds,CARGO_DURATION);
  assert.deepEqual(seq.pose.cargo,{x:8,y:6.42,z:145});assert.equal(seq.pose.attached,false);
  assert.ok(Math.abs(seq.pose.cargo.y-1.3-PORT.roadY)<1e-9);
  assert.ok(seq.start());assert.equal(seq.seconds,0);seq.update(NaN);assert.equal(seq.seconds,0);
  seq.update(.1);seq.reset();assert.equal(seq.running,false);assert.equal(seq.pose.ship.x,-170);
});
test('phase boundaries have continuous cargo/hook positions',()=>{
  for(const t of [35,43,55,68,80,92]){
    const a=cargoPose(t-1e-5),b=cargoPose(t+1e-5);
    for(const part of ['ship','cargo','hook'])for(const axis of ['x','y','z'])assert.ok(Math.abs(a[part][axis]-b[part][axis])<.001,`${t} ${part}.${axis}`);
  }
});
test('batched trial geometry has bounded inventory and reset hides moorings',()=>{
  const scene=new PortCargoScene(new Group());let meshes=0,triangles=0;
  scene.root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  assert.ok(meshes<=26);assert.ok(triangles<=5500);assert.equal(scene.mooring.visible,false);
  scene.sequence.start();for(let i=0;i<1200;i++)scene.update(.1);
  assert.equal(scene.mooring.visible,true);assert.equal(scene.sequence.pose.complete,true);
  scene.sequence.reset();scene.update(0);assert.equal(scene.mooring.visible,false);
  assert.equal(scene.ship.position.x,-170);assert.equal(scene.cargo.position.x,-162);
});

test('vehicle only leaves after landing, hoist clearance and fully open doors',()=>{
  for(let t=0;t<98;t+=.1)assert.equal(cargoPose(t).vehicle.x,8);
  assert.equal(cargoPose(96).doors,1);
  assert.ok(cargoPose(98).hook.y>20);
  let previous=8;
  for(let t=98;t<=112;t+=.05){const p=cargoPose(t);assert.ok(p.vehicle.x<=previous);previous=p.vehicle.x;assert.equal(p.vehicle.z,145);assert.ok(p.vehicle.y>=5.12);}
  const end=cargoPose(112);assert.equal(end.ready,true);assert.equal(end.vehicle.x,-4);
  // Car rear clears container end at x=4.95 by over six metres.
  assert.ok(end.vehicle.x+PORT_VEHICLE_FOOTPRINTS.player.length/2<4.95);
  assert.equal(cargoPose(0).ready,false);assert.equal(cargoPose(0).doors,0);
});

test('exported sedan fits the container, ramp and player collision footprint',()=>{
  const data=fs.readFileSync(new URL('../public/models/port/mmc-sedan-ai68.glb',import.meta.url));
  const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)));
  const nodes=gltf.nodes.map(n=>{
    const node=new Group();
    node.position.set(...(n.translation||[0,0,0]));
    node.quaternion.set(...(n.rotation||[0,0,0,1]));
    node.scale.set(...(n.scale||[1,1,1]));
    return node;
  });
  for(let i=0;i<nodes.length;i++)for(const child of gltf.nodes[i].children||[])nodes[i].add(nodes[child]);
  const root=new Group();
  for(const index of gltf.scenes[gltf.scene||0].nodes)root.add(nodes[index]);
  root.updateMatrixWorld(true);
  const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  for(let i=0;i<nodes.length;i++)for(const primitive of gltf.meshes[gltf.nodes[i].mesh]?.primitives||[]){
    const bounds=gltf.accessors[primitive.attributes.POSITION];
    for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){
      const point=new Vector3(x,y,z).applyMatrix4(nodes[i].matrixWorld);
      min.min(point);max.max(point);
    }
  }
  const footprint=PORT_VEHICLE_FOOTPRINTS.player;
  assert.ok(Math.max(Math.abs(min.z),Math.abs(max.z))<footprint.length/2);
  assert.ok(Math.max(Math.abs(min.x),Math.abs(max.x))<footprint.halfWidth);
  // At -PI/2 the sedan length runs along the container's local X axis.
  assert.ok(min.z>-2.97 && max.z<2.97,'body clears closed end panels');
  assert.ok(min.x>-1.16 && max.x<1.16,'mirrors clear container side walls');
  assert.ok(min.x>-1.15 && max.x<1.15,'tyres and body fit unloading ramp');
  const loaded=cargoPose(92),parked=cargoPose(CARGO_DURATION);
  assert.ok(loaded.vehicle.y+min.y>=5.2,'tyres clear container floor');
  assert.ok(loaded.vehicle.y+max.y<7.64,'roof clears container ceiling');
  assert.ok(parked.vehicle.y+min.y>=PORT.roadY,'tyres clear quayside');
});
