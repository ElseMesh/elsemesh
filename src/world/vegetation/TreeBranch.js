// Agent Control: curved, tapered growth from a buried trunk root; shared by mesh and animal path.
import {BufferGeometry,Float32BufferAttribute,Vector3} from '../../engine/index.js';
export function branchPoint(t,variant=0,target=new Vector3()) {
	return target.set((3.5+variant*.25)*(.35*t+.65*t*t),(.95+variant*.15)*t+.65*t*t,
		.62*Math.sin(Math.PI*t)+.22*t);
}
export const branchRadius=t=>.025+.25*Math.pow(1-t,1.3);
export function curvedBranchGeometry(point,radius,steps=16) {
	const positions=[],uv=[],indices=[],up=new Vector3(0,1,0),p=new Vector3(),q=new Vector3(),tangent=new Vector3(),right=new Vector3(),normal=new Vector3();
	let distance=0,previous=point(0,new Vector3());
	for(let j=0;j<=steps;j++) {
		const t=j/steps;point(t,p);distance+=p.distanceTo(previous);previous.copy(p);
		tangent.subVectors(point(Math.min(1,t+.002),new Vector3()),point(Math.max(0,t-.002),new Vector3())).normalize();
		right.crossVectors(up,tangent).normalize();normal.crossVectors(tangent,right).normalize();
		for(let k=0;k<=10;k++) {
			const a=k/10*Math.PI*2,r=radius(t)*(1+.035*Math.sin(a*3+t*9));
			q.copy(p).addScaledVector(right,Math.cos(a)*r).addScaledVector(normal,Math.sin(a)*r);
			positions.push(q.x,q.y,q.z);uv.push(k/10,distance/1.5);
			if(j<steps&&k<10){const b=j*11+k;indices.push(b,b+1,b+11,b+1,b+12,b+11);}
		}
	}
	const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
