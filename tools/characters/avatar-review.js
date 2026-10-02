// Local-only visual qualification with the actual game shader and animation runtime.
import { GPU } from '../../src/engine/gpu/GPU.js';
import { RenderTarget } from '../../src/engine/gpu/Texture.js';
import { G,setFrameCamera } from '../../src/engine/render/Frame.js';
import { Material } from '../../src/engine/render/Material.js';
import { MeshRenderer } from '../../src/engine/render/MeshRenderer.js';
import { SunShadows } from '../../src/engine/render/Shadows.js';
import { FullscreenPass } from '../../src/engine/render/FullscreenPass.js';
import { SkinnedModel } from '../../src/engine/render/Skinning.js';
import { loadGLB } from '../../src/engine/loaders/GLTF.js';
import { avatarMaterialOptions,tintAvatar } from '../../src/player/AvatarMaterials.js';
import { DEFAULT_APPEARANCE, AVATAR_STYLES } from '../../src/player/AvatarAppearance.js';
import * as E from '../../src/engine/index.js';
const canvas=document.getElementById('view'),W=900,H=800;
await GPU.init({canvas});
const scene=new E.Scene(),camera=new E.PerspectiveCamera(30,W/H,.1,100);
camera.position.set(0,1.1,4.1); camera.lookAt(0,.95,0);
scene.add(new E.Mesh(new E.PlaneGeometry(30,30).rotateX(-Math.PI/2),new Material({color:0x79766c,roughness:.9})));
G.sunDir.value.set(.45,.75,.5).normalize(); G.sunColor.value.setRGB(3,2.9,2.7); G.skyIrradiance.value.setRGB(.3,.36,.45);
const rt=new RenderTarget(W,H,{colors:['rgba16float','rgba16float','rgba8unorm'],depth:'depth32float'});
const renderer=new MeshRenderer(),shadows=new SunShadows();
const tonemap=new FullscreenPass({label:'avatar-review',colorFormats:[GPU.format],bindings:{hdr:{texture:()=>rt.texture}},code:`fn fragment(in:FSIn)->vec4f { let c=textureLoad(hdr,vec2i(in.pos.xy),0).rgb*.8; let t=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14); return vec4f(linearToSrgb(sat3(t)),1.); }`});
let model,appearance={...DEFAULT_APPEARANCE},clip='walk',version=0;
async function select(style){
 const v=++version; appearance.style=style;
 const next=await SkinnedModel.create(await loadGLB(`/models/characters/${AVATAR_STYLES[style].asset}.glb`),{materials:avatarMaterialOptions});
 if(v!==version){next.dispose();return;}
 if(model){scene.remove(model.group);model.dispose();} model=next;scene.add(model.group);model.play(clip,{fade:.01});tintAvatar(model,appearance);
 document.getElementById('status').textContent=`${style} · ${clip} · ${model.joints} bones`;
}
for(const style of ['male','female'])document.getElementById(style).onclick=()=>select(style);
for(const name of ['idle','walk','run','helm'])document.getElementById(name).onclick=()=>{clip=name;model.play(clip,{fade:.2});};
document.getElementById('turn').onclick=()=>model.group.rotation.y+=Math.PI/2;
document.getElementById('colour').onclick=()=>{appearance={...appearance,shirt:'#c54343',trousers:'#e2d9c5',skin:'#805136',hair:'#171512'};tintAvatar(model,appearance);};
await select('male');
let previous=performance.now();
function frame(t){const dt=Math.min(.05,(t-previous)/1000);previous=t;model.update(dt);GPU.beginFrame();setFrameCamera(camera,W,H);shadows.render(scene,renderer,shadows.update(camera,G.sunDir.value));renderer.render(scene,{camera,kind:'main',colorViews:rt.textures.map(t=>t.view()),colorFormats:rt.formats,clearColors:[[.35,.42,.5,1],[0,0,0,0],[0,0,0,0]],depthView:rt.depthTexture.view(),depthFormat:'depth32float',clearDepth:0});tonemap.render({colorViews:[GPU.context.getCurrentTexture().createView()]});GPU.submit();window.avatarReview?.capture?.(canvas);requestAnimationFrame(frame);}
window.avatarReview={select,get model(){return model;},get appearance(){return appearance;}};
requestAnimationFrame(frame);
