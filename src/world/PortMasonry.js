import { standard } from '../materials/Materials.js';

// Reuse the already loaded, credited Poly Haven maps from the portal scene.
// No additional downloads, texture copies, or per-object materials.
export function portMasonry(portal, kind, color=0xffffff) {
  const brick=kind==='brick', source=brick?portal.materials.brick:portal.materials.polishedTile;
  const prefix=brick?'portalBrick':'portalFloor', metres=brick?'3.0':'2.1';
  const maps=()=>({portAlbedo:source.bindings[`${prefix}Albedo`].texture,
    portNormal:source.bindings[`${prefix}Normal`].texture,portArm:source.bindings[`${prefix}Arm`].texture});
  const result=standard({name:`Bracken reclaimed ${kind}`,color,roughness:.9,
    underwaterLighting:'none',localLightsCheap:true,textures:maps(),surface:`
      let wallU=select(in.P.x,in.P.z,abs(in.N.x)>abs(in.N.z));
      let uv=select(vec2f(wallU,in.P.y),in.P.xz,abs(in.N.y)>.6)/${metres};
      let base=textureSample(portAlbedo,smpAnisoRepeat,uv);
      let arm=textureSample(portArm,smpAnisoRepeat,uv);
      var nm=textureSample(portNormal,smpAnisoRepeat,uv).xyz*2.0-1.0;
      nm=vec3f(nm.xy*.45,nm.z);
      s.albedo*=${kind==='asphalt'?'vec3f(dot(base.rgb,vec3f(.2126,.7152,.0722)))':'base.rgb'};
      s.ao*=arm.r;s.roughness=clamp(arm.g*.7+.25,.65,1.0);
      s.normal=perturbNormalByMap(in.P,in.N,uv,nm);
    `});
  portal.textureReady.then(()=>{
    for(const [key,texture] of Object.entries(maps()))result.bindings[key].texture=texture;
    result.needsUpdate=true;
  });
  return result;
}
