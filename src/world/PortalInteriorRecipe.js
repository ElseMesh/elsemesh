const box=(name,size,position,material,options={})=>({name,shape:'box',size,position,rotation:options.rotation||[0,0,0],material,collider:options.collider,walkable:options.walkable});
const cyl=(name,size,position,material,options={})=>({name,shape:'cylinder',size,position,rotation:options.rotation||[0,0,0],material,collider:options.collider,walkable:options.walkable});
const sphere=(name,size,position,material)=>({name,shape:'sphere',size,position,rotation:[0,0,0],material});
const torus=(name,size,position,material,rotation=[Math.PI/2,0,0])=>({name,shape:'torus',size,position,rotation,material});

export function buildRecipe(){
 const materials={
  brick:{color:0x7d4034,roughness:.92,metalness:0},brickDark:{color:0x532d28,roughness:.96,metalness:0},mortar:{color:0xb49a82,roughness:1,metalness:0},concrete:{color:0x6f7779,roughness:.95,metalness:.05},steel:{color:0x26343a,roughness:.35,metalness:.8},glass:{color:0xb9c4c0,roughness:.2,metalness:.05,opacity:.28,transparent:true,depthWrite:false},wood:{color:0x825735,roughness:.7,metalness:0},leather:{color:0x29323a,roughness:.7,metalness:0},cream:{color:0xe8d6b5,roughness:.8,metalness:0},rug:{color:0x8f4b3e,roughness:1,metalness:0},white:{color:0xf2eee2,roughness:.45,metalness:.05},black:{color:0x101619,roughness:.35,metalness:.5},amber:{color:0xffb34b,roughness:.35,metalness:.2,emissive:0x7a3c08},green:{color:0x4f865f,roughness:.9,metalness:0},graffiti:{color:0xd95c78,roughness:.6,metalness:0,emissive:0x35101c},blue:{color:0x3b70ad,roughness:.65,metalness:0}};
 const objects=[]; const add=o=>objects.push(o);
 add(box('concrete ground',[32,.3,30],[0,-.15,3],'concrete',{collider:true,walkable:true}));
 add(box('west structural wall',[.35,12,30],[-16,6,3],'mortar',{collider:true}));
 add(box('east structural wall',[.35,12,30],[16,6,3],'mortar',{collider:true}));
 for(const z of [-12,18]){
  add(box('window wall lower',[32,4,.35],[0,2,z],'brick',{collider:true}));
  add(box('window wall upper',[32,3.4,.35],[0,10.3,z],'brick',{collider:true}));
  for(const x of [-15.1,-10,-5,0,5,10,15.1])add(box('window masonry pier',[1.7,4.6,.35],[x,6.3,z],'brick',{collider:true}));
  for(const x of [-12.55,-7.5,-2.5,2.5,7.5,12.55]){
   add(box('factory window',[3.35,4.35,.08],[x,6.25,z+(z<0?.2:-.2)],'glass'));
   add(box('window vertical mullion',[.1,4.45,.18],[x,6.25,z+(z<0?.12:-.12)],'steel'));
   for(const y of [4.85,6.25,7.65])add(box('window horizontal mullion',[3.45,.1,.18],[x,y,z+(z<0?.12:-.12)],'steel'));
  }
 }
 add(box('roof',[32,.3,30],[0,12,3],'steel',{collider:true}));
 for(const x of [-12,-6,0,6,12])for(const z of [-11.6,17.6])add(box('steel roof frame',[.22,11.7,.22],[x,6,z],'steel'));
 // Staggered individual inner-face brick courses provide actual relief and mortar joints.
 for(const x of [-15.79,15.79])for(let course=0;course<20;course++){
  const offset=course%2?1:0;
  for(let bay=0;bay<15;bay++){const z=-10.9+bay*2+(offset?-.95:0);if(z>-11.5&&z<17.5)add(box('staggered face brick',[.12,.48,1.82],[x,.38+course*.57,z],(course+bay)%7===0?'brickDark':'brick'));}
 }
 for(const z of [-11.79,17.79])for(let course=0;course<7;course++)for(let bay=0;bay<18;bay++){const x=-15.1+bay*1.78+(course%2?.85:0);if(x<15.3)add(box('lower face brick',[1.58,.45,.12],[x,.35+course*.54,z],(course+bay)%8===0?'brickDark':'brick'));}
 // Portal arrival remains clear and visually legible.
 add(box('arrival mat',[4,.04,3],[0,.04,0],'rug')); add(box('return portal plinth',[2.6,.25,1.4],[-4,.25,0],'steel',{collider:true}));add(torus('return portal ring',[2.8,.18,2.8],[-4,2.05,0],'amber'));
 for(const x of [-4.8,-4,-3.2])add(box('portal glyph',[.42,.08,.06],[x,3.75,-.08],'white'));
 // Lounge: raised feet, deep cushions, arms and back identify the sectional.
 add(box('lounge rug',[8,.05,6],[-9,.05,4],'rug'));
 for(const x of [-10.8,-9.6,-8.4,-7.2])add(box('sofa seat cushion',[1.05,.36,1.45],[x,.72,6.4],'leather',{collider:true}));
 add(box('sofa back',[5,1.25,.38],[-9,1.32,7.05],'leather',{collider:true}));
 for(const x of [-11.45,-6.55])add(box('sofa arm',[.35,.85,1.7],[x,.92,6.4],'leather',{collider:true}));
 for(const x of [-11,-7])for(const z of [5.85,6.85])add(box('sofa foot',[.12,.34,.12],[x,.2,z],'steel'));
 add(box('coffee table top',[3,.16,1.6],[-9,.82,3],'wood',{collider:true}));for(const x of [-10.25,-7.75])for(const z of [2.4,3.6])add(box('coffee table leg',[.12,.72,.12],[x,.42,z],'steel'));
 add(cyl('plant pot',[.8,.7,.8],[-13,.35,7],'cream'));add(sphere('plant crown',[1.5,2,1.5],[-13,1.7,7],'green'));
 // Kitchen uses a conventional 0.9m worktop, cabinet fronts, sink and stools.
 add(box('kitchen island carcass',[6,.78,1.35],[5,.44,5],'wood',{collider:true}));add(box('kitchen worktop',[6.2,.12,1.55],[5,.89,5],'steel',{collider:true}));
 for(const x of [2.75,4.25,5.75,7.25]){add(box('island cabinet front',[1.32,.62,.05],[x,.48,4.3],'white'));add(box('cabinet pull',[.45,.05,.07],[x,.55,4.25],'steel'));}
 add(box('sink basin',[1.25,.06,.65],[5,.96,5],'black'));add(cyl('faucet',[.08,.7,.08],[5,.98,5.45],'steel'));
 for(const x of [2,4,6,8]){add(box('wall kitchen cabinet',[1.4,1.75,.55],[x,.9,8],'white',{collider:true}));add(box('cabinet front',[1.25,1.55,.05],[x,.9,7.7],'cream'));}
 add(box('fridge',[1.3,2.4,.9],[10,1.2,7.5],'steel',{collider:true}));add(box('fridge handle',[.08,.75,.08],[9.55,1.35,7],'black'));
 for(const x of [3,5,7,9]){add(box('stool seat',[.62,.12,.62],[x,.76,3.6],'black'));for(const dx of [-.22,.22])for(const dz of [-.22,.22])add(box('stool leg',[.07,.7,.07],[x+dx,.37,3.6+dz],'steel'));}
 // Dining table and recognisable backed chairs.
 add(box('dining tabletop',[5,.18,2],[7,.95,-5],'wood',{collider:true}));for(const x of [5,9])for(const z of [-5.7,-4.3])add(box('dining table leg',[.14,.86,.14],[x,.47,z],'steel'));
 for(const x of [5,7,9])for(const z of [-6.5,-3.5]){add(box('chair seat',[.8,.14,.8],[x,.55,z],'leather',{collider:true}));add(box('chair back',[.8,1,.14],[x,1.05,z+(z< -5?.35:-.35)],'leather'));for(const dx of [-.3,.3])for(const dz of [-.3,.3])add(box('chair leg',[.08,.5,.08],[x+dx,.27,z+dz],'steel'));}
 // Fourteen sub-0.35m risers rise east of the mezzanine edge, avoiding head collision.
 for(let i=0;i<14;i++){const y=.14+i*.25,z=1.45+i*.65;add(box('stair tread',[4,.28,.82],[3,y,z],'concrete',{collider:true,walkable:true}));}
 // The top landing bridges west to the mezzanine without placing the flight beneath it.
 add(box('stair landing',[5,.22,1.7],[1.5,3.42,10.9],'concrete',{collider:true,walkable:true}));
 for(const side of [.92,5.08]){for(let i=0;i<8;i++)add(box('stair railing safety guard',[.12,1.02,1.15],[side,.82+i*.44,1.4+i*1.12],'steel',{collider:true}));add(box('sloped stair handrail',[.1,.1,10.2],[side,2.45,5.65],'steel',{rotation:[-.366,0,0]}));}
 // Vertical guard boxes follow the flight in short sections; no rotated slope AABB can block headroom.
 add(box('landing north guard',[5,1.1,.12],[1.5,4.08,11.81],'steel',{collider:true}));
 add(box('landing east guard',[.12,1.1,1.7],[4.06,4.08,10.9],'steel',{collider:true}));
 add(box('mezzanine floor',[14,.22,8],[-7,3.5,10],'wood',{collider:true,walkable:true}));
 // Split the east edge around the full landing mouth (z 10.0..11.8) for the verified x=3 to x=-3 route.
 for(const [z,depth] of [[8,4],[12.9,2.2]])add(box('mezzanine safety guard',[.12,1.1,depth],[-.15,4.08,z],'steel',{collider:true}));
 // Slim vertical boxes protect every other exposed loft edge; the short landing-front guard ends at x=1 so the x=1..4 stair mouth stays clear.
 for(const z of [5.94,14.06])add(box('mezzanine perimeter guard',[14,1.1,.12],[-7,4.08,z],'steel',{collider:true}));
 add(box('mezzanine west guard',[.12,1.1,8],[-14.06,4.08,10],'steel',{collider:true}));
 add(box('landing front guard',[2,1.1,.12],[0,4.08,9.99],'steel',{collider:true}));
 for(const z of [6.2,8.7,12.1,13.7])add(box('mezzanine rail post',[.1,1.1,.1],[-.15,4.08,z],'steel'));add(box('mezzanine handrail south',[.1,.1,4],[-.15,4.62,8],'steel'));add(box('mezzanine handrail north',[.1,.1,2.2],[-.15,4.62,12.9],'steel'));
 add(box('bed base',[4,.45,2],[-10,3.85,12],'wood',{collider:true}));add(box('bed mattress',[3.9,.42,1.9],[-10,4.28,12],'cream'));add(box('bed headboard',[4,1.25,.2],[-10,4.45,12.95],'leather'));for(const x of [-11,-9])add(box('bed pillow',[.8,.16,.55],[x,4.55,12.55],'white'));
 add(box('condo rug',[6,.04,4],[-7,3.64,12],'rug'));add(box('condo desk top',[3,.14,.8],[-4,4.3,12],'wood'));for(const x of [-5.3,-2.7])add(box('condo desk leg',[.1,.72,.1],[x,3.92,12],'steel'));
 // Retro zone: desks with legs, CRT shells/bezels/feet, screens and individual keycaps.
 add(box('retro carpet',[9,.04,7],[9,.04,13],'rug'));
 for(let i=0;i<3;i++){const x=7+i*2.4;add(box('retro desktop',[2,.14,1.15],[x,.82,12],'wood',{collider:true}));for(const dx of [-.82,.82])add(box('retro desk leg',[.12,.76,.12],[x+dx,.4,12],'steel'));add(box('CRT shell',[1.35,1.05,.9],[x,1.55,12.15],'cream'));add(box('CRT bezel',[1.08,.76,.08],[x,1.58,11.66],'black'));add(box('CRT screen',[.82,.55,.04],[x,1.6,11.6],'amber'));for(const dx of [-.42,.42])add(box('CRT foot',[.22,.12,.3],[x+dx,1,12.15],'black'));add(box('keyboard base',[1.08,.08,.42],[x,.95,11.25],'white'));for(let row=0;row<3;row++)for(let key=0;key<8;key++)add(box('keyboard key',[.09,.035,.07],[x-.4+key*.115,1.015,11.12+row*.1],'black'));add(box('computer tower',[.45,.8,.55],[x+.72,.45,12.7],'black'));add(box('mouse',[.18,.08,.25],[x+.68,.95,11.28],'black'));}
 for(let i=0;i<3;i++){add(box('retro shelf upright',[.12,3,.45],[13,1.5,10+i*3],'wood'));for(const y of [.25,1.2,2.2,2.95])add(box('retro shelf board',[1.4,.1,.5],[13,y,11.5+i*2.7],'wood'));}
 // Layered geometric tags read as restrained graffiti rather than blank panels.
 for(const z of [9.5,13,16]){add(box('graffiti slash',[.04,.22,2.4],[15.78,3.2,z],'graffiti',{rotation:[.55,0,0]}));add(box('graffiti counter slash',[.04,.18,1.8],[15.76,3.65,z+.2],'blue',{rotation:[-.7,0,0]}));add(torus('graffiti loop',[1.1,.1,1.1],[15.72,3.7,z],'graffiti',[0,Math.PI/2,0]));}
 // Warm pendant fixtures and small pools of emissive practical light.
 for(const x of [-10,-5,0,5,10]){add(box('pendant cord',[.04,1.4,.04],[x,10.9,3],'black'));add(cyl('pendant shade',[.65,.32,.65],[x,10.15,3],'amber'));add(sphere('pendant bulb',[.28,.28,.28],[x,9.98,3],'white'));}
 add(box('warehouse workbench top',[5,.16,1],[8,.95,16],'steel',{collider:true}));for(const x of [5.7,10.3])add(box('workbench leg',[.16,.88,.16],[x,.47,16],'steel'));add(box('tool cabinet',[1.2,2,.7],[12,1,16],'steel',{collider:true}));for(const y of [.4,.8,1.2,1.6])add(box('tool drawer',[1.05,.27,.05],[12,y,15.62],'blue'));
 return {materials,objects,zones:{arrival:[0,1,0],lounge:[-9,1,4],kitchen:[5,1,5],dining:[7,1,-5],retro:[9,1,13],mezzanine:[-7,4,10]}};
}
