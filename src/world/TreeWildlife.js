// Agent Control: original articulated canopy wildlife, four shared draw batches, no external model licence.
import { Group, Mesh, InstancedMesh, InstancedInterleavedBuffer, InterleavedBufferAttribute, SphereGeometry, CylinderGeometry, Vector3, Quaternion, Matrix4 } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { fruitTreeCrownGeometry, fruitTreeLeafMaterial } from './vegetation/FruitTreeCrown.js';

const up = new Vector3(0,1,0);
const surface = (name,color) => {
	const m = standard({name,color,roughness:.88}); m.localLightsCheap=true; return m;
};

// Agent Control: a smooth out-and-back patrol with a stationary turn/rest at either branch end.
export function monkeyPatrol(time) {
	const phase=((time%24)+24)%24;
	const outbound=phase<12, t=outbound?phase:phase-12;
	const moving=t<8, f=Math.min(t/8,1), eased=f*f*(3-2*f);
	const x=(outbound?-1:1)*(1.75-3.5*eased);
	const turn=Math.max(0,Math.min(1,(t-9)/2));
	return {x, yaw:(outbound?Math.PI/2:-Math.PI/2) + Math.PI*turn*turn*(3-2*turn), moving,
		stride: moving ? Math.sin(Math.PI*f)**.5 : 0, phase: time*7.5};
}

export class TreeWildlife {
	constructor(parent,trees,bark) {
		this.time=0; this.monkeys=[]; this.fruit=[]; this.habitats=[];
		this.group=new Group(); this.group.name='Fruit and canopy monkeys'; parent.add(this.group);
		const geo=new SphereGeometry(1,12,8);
		const colors=[0x594132,0xc4a17b,0x201b17,0xead8b7];
		this.batches=colors.map((c,i)=>{
			const m=new InstancedMesh(geo,surface('Monkey '+['fur','face','eyes and hands','chest'][i],c),256);
			m.name='Canopy monkeys '+i; m.frustumCulled=false; m.castShadow=true; this.group.add(m); return m;
		});
		this.mangoBatch=new InstancedMesh(geo,surface('Ripe mango skin',0xc99227),512);
		this.mangoBatch.frustumCulled=false; this.mangoBatch.castShadow=true; this.group.add(this.mangoBatch);
		// Agent Control: retain each limb's previous transform so temporal upscaling tracks real motion.
		for(const batch of [...this.batches,this.mangoBatch]) {
			batch.geometry=batch.geometry.clone();
			batch.previous=new InstancedInterleavedBuffer(new Float32Array(batch.instanceMatrix.array),16);
			batch.material.attributes={};
			for(let k=0;k<4;k++) {
				batch.geometry.setAttribute('previous'+k,new InterleavedBufferAttribute(batch.previous,4,k*4));
				batch.material.attributes['previous'+k]='vec4f';
			}
			batch.material.vertex='v.prevModel = draw.prevModel * mat4x4f(v.previous0,v.previous1,v.previous2,v.previous3);';
		}
		this.matrix=new Matrix4(); this.pos=new Vector3(); this.scale=new Vector3(); this.rot=new Quaternion(); this.delta=new Vector3();
		this.local=new Matrix4(); this.world=new Matrix4(); this.body=new Matrix4();
		const leafGeometry=fruitTreeCrownGeometry(), leafMaterial=fruitTreeLeafMaterial();
		this.a=new Vector3(); this.b=new Vector3(); this.c=new Vector3(); this.rotation=new Quaternion();
		// Agent Control: closest trees to the rental-to-pad path get wildlife; all fruit follows real wind joints.
		const chosen=[...trees].sort((a,b)=>Math.hypot(a.root.position.x-115,a.root.position.z-606)-Math.hypot(b.root.position.x-115,b.root.position.z-606));
		for(let i=0;i<Math.min(8,chosen.length);i++) {
			const tree=chosen[i], anchor=new Group(); anchor.position.set(0,0,0); tree.joints[6].add(anchor);
			const habitat={anchor,position:new Vector3(),distance:0};this.habitats.push(habitat);
			const branch=(a,b,r)=>{
				const d=new Vector3().subVectors(b,a), mesh=new Mesh(new CylinderGeometry(r*.7,r,d.length(),8),bark);
				mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(up,d.normalize());
				mesh.castShadow=true; anchor.add(mesh);
			};
			branch(new Vector3(0,0,0),new Vector3(0,.15,.85),.18);
			branch(new Vector3(0,.15,.85),new Vector3(-2.3,-.05,.85),.13);
			branch(new Vector3(0,.15,.85),new Vector3(2.3,.35,.85),.13);
			for(let k=0;k<12;k++) {
				const x=(k<6?-1:1)*(1.2+(k%3)*.29), y=.15+x*.087;
				const start=new Vector3(x,y,.85), end=new Vector3(x+.15,y-.22,.85+(k%2?-.28:.28));
				branch(start,end,.012);
				this.fruit.push({anchor,habitat,point:end.clone().add(new Vector3(0,-.11,0)),seed:k+i*12});
			}
			for(const side of [-1,1]) {
				branch(new Vector3(side*.9,.15,.85),new Vector3(side*1.85,.7,.25),.055);
				const leaves=new Mesh(leafGeometry,leafMaterial);leaves.position.set(side*2,.5,.65);leaves.scale.set(.7,.8,.8);leaves.castShadow=true;anchor.add(leaves);
			}
			if(i<4)this.monkeys.push({anchor,tree,index:i,position:new Vector3()});
		}
		this.update(0,{x:115,y:10,z:606});
	}
	put(batch,frame,x,y,z,sx,sy,sz,q=null) {
		this.pos.set(x,y,z); this.scale.set(sx,sy,sz); this.rot.copy(q || this.identity);
		this.local.compose(this.pos,this.rot,this.scale); this.world.multiplyMatrices(frame,this.local);
		batch.setMatrixAt(batch.count++,this.world);
	}
	segment(batch,frame,a,b,r) {
		this.delta.subVectors(b,a); const length=this.delta.length();
		this.rotation.setFromUnitVectors(up,this.delta.normalize());
		this.put(batch,frame,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,r,length/2+r*.4,r,this.rotation);
	}
	update(dt,camera) {
		this.time+=dt; this.identity ||= new Quaternion();
		for(const batch of [...this.batches,this.mangoBatch]) {
			batch.previousCount=batch.count;batch.previous.array.set(batch.instanceMatrix.array);batch.count=0;
		}
		for(const h of this.habitats) {h.anchor.getWorldPosition(h.position);h.distance=h.position.distanceToSquared(camera);h.anchor.visible=h.distance<120*120;}
		for(const fruit of this.fruit) {
			if(fruit.habitat.distance>90*90)continue;
			const p=fruit.point, sway=Math.sin(this.time*2+fruit.seed)*.018;
			this.put(this.mangoBatch,fruit.anchor.matrixWorld,p.x+sway,p.y,p.z,.085,.135,.073);
		}
		for(const monkey of this.monkeys) {
			monkey.anchor.getWorldPosition(monkey.position);
			if(monkey.position.distanceToSquared(camera)>110*110)continue;
			const p=monkeyPatrol(this.time+monkey.index*5.7), t=p.phase;
			this.pos.set(p.x,.26+p.x*.087,.85); this.rot.setFromAxisAngle(up,p.yaw); this.scale.setScalar(1);
			this.local.compose(this.pos,this.rot,this.scale); this.body.multiplyMatrices(monkey.anchor.matrixWorld,this.local);
			const [fur,skin,dark,chest]=this.batches, frame=this.body, bob=Math.sin(t*2)*.025*p.stride;
			this.put(fur,frame,0,.66+bob,0,.22,.22,.42);
			this.put(chest,frame,0,.61+bob,.22,.16,.18,.21);
			this.put(fur,frame,0,.91+bob,.37,.21,.23,.21);
			this.put(skin,frame,0,.88+bob,.53,.155,.15,.10);
			this.put(skin,frame,0,.80+bob,.59,.105,.055,.065);
			this.put(dark,frame,0,.875+bob,.622,.034,.025,.014);
			for(const side of [-1,1]) {
				this.put(fur,frame,side*.21,.91+bob,.39,.065,.085,.045);
				this.put(skin,frame,side*.218,.912+bob,.425,.039,.053,.013);
				this.put(dark,frame,side*.069,.95+bob,.611,.025,.029,.012);
				this.put(chest,frame,side*.069-.005,.957+bob,.622,.007,.008,.005);
				for(const front of [true,false]) {
					const phase=t+(side>0?Math.PI:0)+(front?0:Math.PI), swing=Math.sin(phase)*.14*p.stride;
					const lift=Math.max(0,Math.cos(phase))*.105*p.stride;
					const z=front?.31:-.29;
					this.a.set(side*.17,(front?.71:.6)+bob,z);
					this.b.set(side*.205,.30+lift*.5,z+(front?-.09:.12)+swing*.5);
					this.c.set(side*.13,.025+lift,z+swing);
					this.segment(fur,frame,this.a,this.b,front?.063:.09);
					this.segment(fur,frame,this.b,this.c,.047);
					this.put(dark,frame,this.c.x,.024+lift,this.c.z+.035,.053,.03,.083);
				}
			}
			// Agent Control: a articulated curled tail balances the gait; phase remains continuous through pauses.
			this.a.set(0,.65+bob,-.32);
			for(let j=1;j<=10;j++) {
				const f=j/10; this.b.set(Math.sin(this.time*1.7+f*3+monkey.index)*.10*f,
					.64+bob+.38*Math.sin(f*3.3),-.32-.95*f+.24*f*f);
				this.segment(fur,frame,this.a,this.b,.043*(1-f*.65)); this.a.copy(this.b);
			}
		}
		for(const batch of [...this.batches,this.mangoBatch]) {
			batch.visible=batch.count>0;
			if(batch.visible) {
				if(batch.previousCount!==batch.count)batch.previous.array.set(batch.instanceMatrix.array);
				batch.instanceMatrix.needsUpdate=true;batch.previous.needsUpdate=true;
			}
		}
	}
}
