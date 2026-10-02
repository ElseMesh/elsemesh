import { Box3 } from '../math/Box3.js';
import { Matrix4 } from '../math/Matrix4.js';
import { Vector3 } from '../math/Vector3.js';
import { Sphere } from '../math/Sphere.js';

// A normalized, nonnegative weighted skin vertex is inside the convex hull of
// its joint-transformed positions. Union transformed per-joint bind-space boxes
// to bound that hull, without reskinning every vertex on the CPU each frame.
export class SkinBounds {
  constructor(positions, indices, weights, joints) {
    this.boxes=Array.from({length:joints},()=>new Box3());
    this.box=new Box3();this.sphere=new Sphere();
    this._box=new Box3();this._matrix=new Matrix4();this._point=new Vector3();
    this.valid=positions.length>0 && positions.length%3===0 && indices.length===positions.length/3*4 && weights.length===indices.length;
    for(let v=0;this.valid && v<positions.length/3;v++){
      this._point.fromArray(positions,v*3);
      let sum=0;
      for(let k=0;k<4;k++){
        const j=indices[v*4+k],w=weights[v*4+k];sum+=w;
        if(!Number.isInteger(j)||j<0||j>=joints||!Number.isFinite(w)||w<0){this.valid=false;break;}
        if(w>0)this.boxes[j].expandByPoint(this._point);
      }
      if(!Number.isFinite(this._point.x+this._point.y+this._point.z)||Math.abs(sum-1)>1e-5)this.valid=false;
    }
  }
  update(matrices) {
    if(!this.valid){this.sphere.radius=Infinity;return false;}
    this.box.makeEmpty();
    for(let j=0;j<this.boxes.length;j++){
      if(this.boxes[j].isEmpty())continue;
      this._matrix.fromArray(matrices,j*16);
      this.box.union(this._box.copy(this.boxes[j]).applyMatrix4(this._matrix));
    }
    this.box.getBoundingSphere(this.sphere);
    // Float32 weights/matrix arithmetic can move the GPU result a little beyond
    // the ideal convex hull. Scale the guard by model-space magnitude.
    this.sphere.radius+=1e-4*(1+this.sphere.center.length()+this.sphere.radius);
    if(!Number.isFinite(this.sphere.radius+this.sphere.center.length())){this.sphere.radius=Infinity;return false;}
    return true;
  }
}
