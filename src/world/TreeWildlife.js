// Agent Control: original articulated canopy wildlife, four shared draw batches, no external model licence.
import { Group, Mesh, InstancedMesh, InstancedInterleavedBuffer, InterleavedBufferAttribute, SphereGeometry, CylinderGeometry, Vector3, Quaternion, Matrix4 } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { fruitTreeCrownGeometry, fruitTreeLeafMaterial } from './vegetation/FruitTreeCrown.js';
import {branchPoint,branchRadius,curvedBranchGeometry} from './vegetation/TreeBranch.js';

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

// Agent Control: continuous parabolic leaps between live, wind-transformed branch endpoints.
export function monkeyJump(from,to,f,out=new Vector3()) {
	const height=.65+from.distanceTo(to)*.16;
	out.copy(from).lerp(to,f);out.y+=4*height*f*(1-f);return out;
}

function branchFrame(h,u,yaw,out) {
	const position=branchPoint(u,h.variant).multiplyScalar(h.scale);position.y+=branchRadius(u)*h.scale-.018;
	const forward=branchPoint(u+.002,h.variant).sub(branchPoint(u-.002,h.variant)).normalize();
	const right=new Vector3().crossVectors(up,forward).normalize(),normal=new Vector3().crossVectors(forward,right).normalize();
	const local=new Matrix4().makeBasis(right,normal,forward);
	const rotation=new Quaternion().setFromRotationMatrix(local).multiply(new Quaternion().setFromAxisAngle(up,yaw-Math.PI/2));
	local.compose(position,rotation,new Vector3(1,1,1));h.anchor.updateWorldMatrix(true,false);return out.multiplyMatrices(h.anchor.matrixWorld,local);
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
			const tree=chosen[i], anchor=new Group(); anchor.rotation.y=i*1.73; tree.joints[4+i%3].add(anchor);
			const habitat={anchor,tree,variant:i%3,scale:1,position:new Vector3(),distance:0};this.habitats.push(habitat);
			const branch=(a,b,r)=>{
				const d=new Vector3().subVectors(b,a), mesh=new Mesh(new CylinderGeometry(r*.7,r,d.length(),8),bark);
				mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(up,d.normalize());
				mesh.castShadow=true; anchor.add(mesh);
			};
			const main=new Mesh(curvedBranchGeometry((t,out)=>branchPoint(t,i%3,out),branchRadius),bark);main.castShadow=true;anchor.add(main);
			// Agent Control: other limbs emerge independently at higher trunk joints and different azimuths.
			for(let fork=0;fork<2;fork++) {
				const limb=new Group();limb.rotation.y=i*1.73+2.15+fork*2.1;tree.joints[6+fork].add(limb);
				const mesh=new Mesh(curvedBranchGeometry((t,out)=>branchPoint(t,fork,out).multiplyScalar(.72+fork*.12),t=>branchRadius(t)*.72),bark);mesh.castShadow=true;limb.add(mesh);
				const crown=new Mesh(leafGeometry,leafMaterial);crown.position.copy(branchPoint(.88,fork).multiplyScalar(.72+fork*.12));crown.scale.set(.9,.8,.9);crown.castShadow=true;limb.add(crown);
				this.habitats.push({anchor:limb,tree,variant:fork,scale:.72+fork*.12,position:new Vector3(),distance:0});
			}
			for(let k=0;k<12;k++) {
				const start=branchPoint(.59+(k%4)*.09,i%3),end=start.clone().add(new Vector3(.08,-.19-(k%3)*.05,(k%2?-.3:.3)));
				branch(start,end,.012);
				this.fruit.push({anchor,habitat,point:end.clone().add(new Vector3(0,-.11,0)),seed:k+i*12});
			}
			for(const side of [-1,1]) {
				const start=branchPoint(.66,i%3),end=branchPoint(.95,i%3).add(new Vector3(-.1,.4,side*.55));
				const twig=new Mesh(curvedBranchGeometry((t,out)=>out.copy(start).lerp(end,t).add(new Vector3(0,Math.sin(t*Math.PI)*.18,0)),t=>.055*(1-t)+.008,8),bark);twig.castShadow=true;anchor.add(twig);
				const leaves=new Mesh(leafGeometry,leafMaterial);leaves.position.copy(end);leaves.scale.set(.7,.8,.8);leaves.castShadow=true;anchor.add(leaves);
			}
			if(i<4)this.monkeys.push({anchor,tree,home:habitat,index:i,position:new Vector3()});
		}
		// Agent Control: only admit reachable different-tree landings with clearance from both trunks.
		for(const monkey of this.monkeys) {
			const from=new Vector3().setFromMatrixPosition(branchFrame(monkey.home,.83,-Math.PI/2,new Matrix4()));let best=5;
			for(const candidate of this.habitats) {
				if(candidate.tree===monkey.tree)continue;
				const to=new Vector3().setFromMatrixPosition(branchFrame(candidate,.83,-Math.PI/2,new Matrix4())),d=from.distanceTo(to);
				if(d<1.1||d>=best||Math.abs(to.y-from.y)>1.7)continue;
				let clear=true;
				for(let k=1;k<10;k++){const p=from.clone().lerp(to,k/10);for(const tree of trees)if(Math.hypot(p.x-tree.root.position.x,p.z-tree.root.position.z)<.65)clear=false;}
				if(clear){best=d;monkey.destination=candidate;}
			}
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
			const cycle=(this.time+monkey.index*19)%96,away=monkey.destination&&cycle>=25.25&&cycle<49.25;
			const jumping=!!monkey.destination&&((cycle>=24&&cycle<25.25)||(cycle>=49.25&&cycle<50.5));
			const localTime=monkey.destination?(away?cycle-25.25:cycle>=50.5?Math.min(24,cycle-50.5):Math.min(cycle,24)):this.time+monkey.index*5.7;
			const p=monkeyPatrol(localTime+12), t=p.phase,habitat=away?monkey.destination:monkey.home;
			const u=.48+(p.x+1.75)/3.5*.35;
			branchFrame(habitat,u,p.yaw,this.body);let tuck=0;
			if(jumping) {
				const returning=cycle>=49.25,f=(cycle-(returning?49.25:24))/1.25;
				const start=returning?monkey.destination:monkey.home,end=returning?monkey.home:monkey.destination;
				const first=branchFrame(start,.83,-Math.PI/2,new Matrix4()),last=branchFrame(end,.83,-Math.PI/2,new Matrix4());
				const a=new Vector3(),b=new Vector3(),qa=new Quaternion(),qb=new Quaternion(),scale=new Vector3();first.decompose(a,qa,scale);last.decompose(b,qb,scale);
				monkeyJump(a,b,f,this.pos);qa.slerp(qb,f);this.body.compose(this.pos,qa,scale);tuck=Math.sin(Math.PI*f)*.17;p.stride=0;
			}
			monkey.jumping=jumping;monkey.currentPosition=new Vector3().setFromMatrixPosition(this.body);
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
					const lift=Math.max(0,Math.cos(phase))*.105*p.stride+tuck;
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
