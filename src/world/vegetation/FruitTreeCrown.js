// Agent Control: shared clusters of folded lance-shaped mango leaves, replacing solid canopy balls.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from '../../engine/index.js';
import { standard } from '../../materials/Materials.js';
import { mulberry32 } from '../../util/Noise.js';

export function fruitTreeCrownGeometry() {
	const random=mulberry32(7319), positions=[],uvs=[],indices=[];
	for(let i=0;i<64;i++) {
		const az=random()*Math.PI*2, elevation=(random()-.5)*1.8, r=.25+random()*.72;
		const center=new Vector3(Math.cos(az)*r,Math.sin(elevation)*r,Math.sin(az)*r);
		const along=new Vector3(Math.cos(az),-.3-random()*.8,Math.sin(az)).normalize();
		const across=new Vector3(-Math.sin(az),0,Math.cos(az));
		const length=.34+random()*.22,width=.09+random()*.035, base=positions.length/3;
		for(const [s,t,lift] of [[0,0,0],[-1,.48,-.035],[0,.5,.025],[1,.48,-.035],[0,1,-.08]]) {
			const p=center.clone().addScaledVector(along,(t-.5)*length).addScaledVector(across,s*width);p.y+=lift;
			positions.push(p.x,p.y,p.z);uvs.push(s*.5+.5,t);
		}
		for(const tri of [[0,1,2],[0,2,3],[1,4,2],[2,4,3]])indices.push(...tri.map(n=>n+base));
	}
	const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
export function fruitTreeLeafMaterial() {
	const m=standard({name:'Mango leaves with midribs',color:0x426930,roughness:.62,side:'double',surface:`
		let vein = 1.0-smoothstep(0.012,0.026,abs(in.uv.x-0.5));
		let lateral = pow(max(0.0,cos((in.uv.y-abs(in.uv.x-0.5)*0.5)*100.0)),16.0)*0.08;
		s.albedo *= (0.8 + in.uv.y*0.3 + vein*0.45 + lateral);
		s.translucency = s.albedo * 0.25;
	`});m.localLightsCheap=true;return m;
}
