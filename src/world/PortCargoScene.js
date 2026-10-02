import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,Mesh,Vector3,CylinderGeometry} from '../engine/index.js';
import {standard} from '../materials/Materials.js';
import {PORT} from './PortRoadGraph.js';
import {PortCargoSequence} from './PortCargoSequence.js';
import {mergeGeometries} from '../engine/geometry/BufferGeometryUtils.js';
import {createPortVehicleCandidate} from './PortVehicleAsset.js';
import {spinPortWheels} from './PortWheelRig.js';

// Original code-authored trial asset. Not an externally sourced production ship.
const mat=(name,color,roughness=.8)=>{
  const m=standard({name,color,roughness});m.underwaterLighting='none';m.localLightsCheap=true;return m;
};
const paint=mat('Cargo coaster faded hull blue',0x344b57),steel=mat('Cargo coaster dark fittings',0x30383b);
const deck=mat('Cargo coaster worn deck',0x6e726d),white=mat('Cargo coaster off-white bridge',0xb7b8af);
const glass=mat('Cargo coaster bridge glazing',0x29434c,.22),red=mat('Cargo coaster cargo oxide',0x79473b);
const yellow=mat('Quayside crane faded ochre',0xaa8740),rubber=mat('Berth rubber fender',0x242b29);
function box(parent,name,w,h,d,x,y,z,material){
  const o=new Mesh(new BoxGeometry(w,h,d),material);o.name=name;o.position.set(x,y,z);
  o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function beam(parent,name,a,b,r,material){
  const A=new Vector3(...a),B=new Vector3(...b),delta=B.clone().sub(A);
  const o=new Mesh(new CylinderGeometry(r,r,delta.length(),6),material);
  o.position.copy(A).add(B).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new Vector3(0,1,0),delta.normalize());
  o.name=name;parent.add(o);return o;
}
function hull(){
  const sections=[[-25,2.8],[-21,4.5],[14,4.5],[22,3.1],[27,.1]];
  const rings=sections.map(([x,w])=>[[x,3.3,-w],[x,.3,-w],[x,-2.2,-w*.55],[x,-2.2,w*.55],[x,.3,w],[x,3.3,w]]);
  const vertices=[];
  const tri=(a,b,c)=>vertices.push(...a,...b,...c);
  for(let s=0;s<rings.length-1;s++)for(let j=0;j<6;j++){
    const k=(j+1)%6,a=rings[s][j],b=rings[s+1][j],c=rings[s+1][k],d=rings[s][k];
    tri(a,b,c);tri(a,c,d);
  }
  for(const [index,reverse] of [[0,true],[rings.length-1,false]])for(let j=1;j<5;j++){
    const r=rings[index];reverse?tri(r[0],r[j+1],r[j]):tri(r[0],r[j],r[j+1]);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}
function batchStatic(parent,exclude=[]){
  const groups=new Map();
  for(const mesh of [...parent.children]){
    if(!mesh.isMesh||exclude.includes(mesh))continue;
    mesh.updateMatrix();
    const key=mesh.material.name+':'+Object.keys(mesh.geometry.attributes).sort().join(',')+':'+!!mesh.geometry.index;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(mesh);
  }
  for(const meshes of groups.values()){
    if(meshes.length<2)continue;
    const parts=meshes.map(m=>m.geometry.clone().applyMatrix4(m.matrix));
    const merged=mergeGeometries(parts);if(!merged)throw Error('cargo_static_batch_failed');
    const mesh=new Mesh(merged,meshes[0].material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='Batched '+meshes[0].material.name;
    for(const old of meshes){parent.remove(old);old.geometry.dispose();}
    for(const part of parts)part.dispose();
    parent.add(mesh);
  }
}
export class PortCargoScene {
  constructor(parent){
    this.sequence=new PortCargoSequence();
    this.root=new Group();this.root.name='Bracken cargo arrival trial';this.root.position.set(PORT.x,0,PORT.z);parent.add(this.root);
    this.ship=new Group();this.root.add(this.ship);
    const body=new Mesh(hull(),paint);body.castShadow=true;body.receiveShadow=true;this.ship.add(body);
    box(this.ship,'weather deck',39,.12,8.7,-2,3.36,0,deck);
    box(this.ship,'aft accommodation',9,3.3,7.8,-18,5,0,white);
    box(this.ship,'wheelhouse',6.5,2.4,7.4,-17,7.8,0,white);
    box(this.ship,'wheelhouse roof',7.1,.22,8,-17,9.11,0,deck);
    for(const side of [-1,1]){
      for(let i=0;i<4;i++)box(this.ship,'bridge side window',1,.9,.035,-19+i*1.35,8.05,side*3.72,glass);
      for(let x=-23;x<=21;x+=3.5){
        beam(this.ship,'deck railing stanchion',[x,3.35,side*4.25],[x,4.35,side*4.25],.035,white);
        if(x<18)beam(this.ship,'deck rail',[x,4.35,side*4.25],[x+3.5,4.35,side*4.25],.035,white);
      }
    }
    for(let z=-2.7;z<=2.7;z+=1.35)box(this.ship,'forward bridge glass',.04,.9,1,-13.73,8.05,z,glass);
    box(this.ship,'funnel',1.5,3,1.6,-21,9,0,steel);
    beam(this.ship,'navigation mast',[-16,9,0],[-16,13,0],.08,white);
    beam(this.ship,'radar crossbar',[-16,12,-1.6],[-16,12,1.6],.09,steel);
    for(const x of [-5,2])box(this.ship,'secured deck freight',6.1,2.6,2.44,x,4.7,-1.25,red);
    for(const x of [-5,2])for(const side of [-1,1])for(let rib=-2.8;rib<=2.8;rib+=.4)
      box(this.ship,'secured container rib',.05,2.45,.055,x+rib,4.7,-1.25+side*1.245,steel);
    for(const side of [-1,1]){
      box(this.ship,'watertight service door',1.15,2,.075,-19.5,4.65,side*3.94,deck);
      box(this.ship,'door inspection glass',.44,.42,.085,-19.5,5.17,side*3.95,glass);
      beam(this.ship,'door handle',[-19.15,4.6,side*4],[-19.15,4.88,side*4],.025,steel);
      for(let x=-22;x<=-16;x+=2)for(let slat=0;slat<5;slat++)
        box(this.ship,'engine ventilation louvre',1.05,.045,.06,x,4.2+slat*.12,side*3.93,steel);
      for(let rung=0;rung<9;rung++)beam(this.ship,'access ladder rung',[-12.9,3.7+rung*.3,side*2.7],[-12.9,3.7+rung*.3,side*3.4],.028,white);
      for(const z of [side*2.7,side*3.4])beam(this.ship,'access ladder rail',[-12.9,3.4,z],[-12.9,6.7,z],.038,white);
      for(const x of [-22,20]){
        box(this.ship,'deck mooring bitt',.3,.55,.35,x,3.67,side*3.7,steel);
        box(this.ship,'bitt crosshead',.65,.12,.3,x,3.95,side*3.7,steel);
      }
    }
    this.cargo=new Group();this.root.add(this.cargo);
    box(this.cargo,'container floor',6.1,.08,2.44,0,-1.26,0,deck);
    box(this.cargo,'container roof',6.1,.08,2.44,0,1.26,0,red);
    box(this.cargo,'container back',.08,2.6,2.44,3.01,0,0,red);
    for(const side of [-1,1])box(this.cargo,'container side',6.1,2.6,.06,0,0,side*1.19,red);
    this.doors=[-1,1].map(side=>{
      const pivot=new Group();pivot.position.set(-3.05,0,side*1.22);this.cargo.add(pivot);
      box(pivot,'container door',.08,2.6,1.22,0,0,-side*.61,red);
      beam(pivot,'door locking bar',[ -.07,-1,-side*.55],[-.07,1,-side*.55],.025,steel);
      return {pivot,side};
    });
    this.ramp=box(this.root,'vehicle unloading ramp',2,.08,2.3,3.96,5.16,145,steel);
    this.ramp.rotation.z=.04;this.ramp.visible=false;
    for(const side of [-1,1])for(let x=-2.8;x<=2.8;x+=.35)box(this.cargo,'container corrugation',.05,2.4,.05,x,0,side*1.235,steel);
    // Engineered pier extension reaches beyond the reclaimed island to deep water.
    box(this.root,'berth platform',80,2,30,0,4.12,145,deck);
    for(let x=-36;x<=36;x+=12){
      box(this.root,'pier support',1.4,10,1.4,x,0,156,steel);
      box(this.root,'berth fender',1.3,4,.8,x,2,160.5,rubber);
      box(this.root,'mooring bollard',.8,.65,.65,x,5.44,158,steel);
    }
    // Portal crane carries its trolley parallel to the ship-to-quay transfer.
    for(const x of [3,13])for(const z of [132,156]){
      box(this.root,'crane column',.7,19,.7,x,14.62,z,yellow);
      beam(this.root,'crane side brace',[x,6,z],[x,23,z===132?156:132],.12,yellow);
    }
    for(const x of [3,13])box(this.root,'crane runway girder',.6,1,47,x,24.5,151.5,yellow);
    for(const z of [129,157,175])box(this.root,'crane cross beam',10.5,.6,.6,8,24.5,z,yellow);
    this.trolley=box(this.root,'crane travelling trolley',8,1.1,2.5,8,24,172,steel);
    this.hook=box(this.root,'container lifting spreader',6.2,.25,2.5,8,21,172,yellow);
    this.ropes=[-2.7,2.7].map(offset=>({offset,mesh:box(this.root,'hoist cable',.035,1,.035,8+offset,22,172,steel)}));
    this.mooring=new Group();this.root.add(this.mooring);
    beam(this.mooring,'aft mooring line',[-22,3.95,167.9],[-24,5.5,158],.05,deck);
    beam(this.mooring,'fore mooring line',[20,3.95,167.9],[24,5.5,158],.05,deck);
    batchStatic(this.ship);batchStatic(this.cargo);batchStatic(this.mooring);
    batchStatic(this.root,[this.ramp,this.trolley,this.hook,...this.ropes.map(r=>r.mesh)]);
    this.update(0);
  }
  async loadVehicle(){
    try {
      this.vehicle=await createPortVehicleCandidate('car',0xb6b8ba,0);
      this.vehicle.name='Sedan collection vehicle';this.root.add(this.vehicle);this.update(0);
      return this.vehicle;
    } catch(error){this.vehicleError=String(error);console.error('Cargo sedan load failed',error);return null;}
  }
  update(dt){
    const p=this.sequence.update(dt);this.ship.position.set(p.ship.x,p.ship.y,p.ship.z);
    this.mooring.visible=p.moored;
    this.cargo.position.set(p.cargo.x,p.cargo.y,p.cargo.z);
    for(const {pivot,side} of this.doors)pivot.rotation.y=side*p.doors*Math.PI*.85;
    this.ramp.visible=p.seconds>=96;
    if(this.vehicle&&!this.collected){
      const previous=this.vehicle.userData.deliveryX;
      this.vehicle.visible=p.seconds>=92;
      this.vehicle.position.set(p.vehicle.x,p.vehicle.y,p.vehicle.z);
      this.vehicle.rotation.y=p.vehicle.yaw;
      if(previous!==undefined&&p.seconds>=98)spinPortWheels(this.vehicle,Math.max(0,previous-p.vehicle.x));
      this.vehicle.userData.deliveryX=p.vehicle.x;
    }
    this.hook.position.set(p.hook.x,p.hook.y,p.hook.z);this.trolley.position.z=p.hook.z;
    for(const {mesh,offset} of this.ropes){mesh.position.set(8+offset,(24+p.hook.y)/2,p.hook.z);mesh.scale.y=24-p.hook.y;}
    return p;
  }
}
