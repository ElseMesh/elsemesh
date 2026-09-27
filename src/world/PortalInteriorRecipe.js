const box=(name,size,position,material,options={})=>({name,shape:'box',size,position,rotation:options.rotation||[0,0,0],material,collider:options.collider,walkable:options.walkable});
const cyl=(name,size,position,material,options={})=>({name,shape:'cylinder',size,position,rotation:options.rotation||[0,0,0],material,collider:options.collider,walkable:options.walkable});
const sphere=(name,size,position,material)=>({name,shape:'sphere',size,position,rotation:[0,0,0],material});
const torus=(name,size,position,material,rotation=[Math.PI/2,0,0])=>({name,shape:'torus',size,position,rotation,material});

export function buildRecipe(){
 const materials={
  brick:{color:0x70453b,roughness:.94,metalness:0,pattern:'brick',brickSize:[.25,.08],mortar:.012},
  brickDark:{color:0x49322e,roughness:.97,metalness:0,pattern:'brick',brickSize:[.25,.08],mortar:.012},
  concrete:{color:0x5f6260,roughness:.9,metalness:.02,pattern:'mottled'},
  concreteDark:{color:0x424644,roughness:.96,metalness:.02,pattern:'mottled'},
  steel:{color:0x20282a,roughness:.48,metalness:.78,pattern:'scratched'},
  rust:{color:0x643d2c,roughness:.82,metalness:.35,pattern:'scratched'},
  glass:{color:0xcbd3d0,roughness:.16,metalness:.02,opacity:.22,transparent:true,depthWrite:false},
  wood:{color:0x765238,roughness:.68,metalness:0,pattern:'wood'},
  fabric:{color:0xd8ccb7,roughness:.95,metalness:0,pattern:'fabric'},
  charcoal:{color:0x303332,roughness:.88,metalness:0,pattern:'fabric'},
  rug:{color:0x675a50,roughness:1,metalness:0,pattern:'fabric'},
  rugLight:{color:0xa89a86,roughness:1,metalness:0,pattern:'fabric'},
  ceramic:{color:0xd9d1bf,roughness:.58,metalness:0},
  black:{color:0x111719,roughness:.38,metalness:.55},
  amber:{color:0xe8a759,roughness:.35,metalness:.1,emissive:0x6a2d08},
  screen:{color:0xd6a85d,roughness:.3,metalness:.05,emissive:0x3c2108},
  leaf:{color:0x345b3b,roughness:.9,metalness:0},
  graffiti:{color:0x765c4f,roughness:.88,metalness:0},
  cream:{color:0xd9ceb8,roughness:.72,metalness:0}
 };
 const objects=[]; const add=o=>objects.push(o);
 // Shell: continuous material surfaces carry metre-scaled procedural brick/concrete detail.
 add(box('worn concrete floor',[32,.3,30],[0,-.15,3],'concrete',{collider:true,walkable:true}));
 add(box('west brick wall',[.38,12,30],[-16,6,3],'brick',{collider:true}));
 add(box('east brick wall',[.38,12,30],[16,6,3],'brick',{collider:true}));
 for(const z of [-12,18]){
  add(box('brick wall lower',[32,4,.38],[0,2,z],'brick',{collider:true}));
  add(box('brick wall upper',[32,3.35,.38],[0,10.33,z],'brickDark',{collider:true}));
  for(const x of [-15,-10,-5,0,5,10,15])add(box('brick window pier',[1.25,4.65,.4],[x,6.32,z],'brick',{collider:true}));
  for(const x of [-12.5,-7.5,-2.5,2.5,7.5,12.5]){
   const face=z+(z<0?.22:-.22);
   add(box('neutral factory glazing',[3.7,4.42,.06],[x,6.3,face],'glass'));
   for(const dx of [-1.82,-.91,0,.91,1.82])add(box('fine vertical mullion',[.055,4.52,.13],[x+dx,6.3,face],'steel'));
   for(const y of [4.15,4.9,5.65,6.4,7.15,7.9,8.52])add(box('fine horizontal mullion',[3.72,.055,.13],[x,y,face],'steel'));
  }
 }
 add(box('weathered roof',[32,.32,30],[0,12,3],'steel',{collider:true}));
 // Blackened columns, roof chords, and crossed diagonal trusses.
 for(const x of [-15,-10,-5,0,5,10,15])for(const z of [-11.65,17.65])add(box('riveted steel column',[.24,11.7,.28],[x,6,z],'steel'));
 for(const x of [-12,-6,0,6,12]){
  add(box('roof cross beam',[.3,.3,29],[x,10.65,3],'steel'));
  for(const z of [-5,5,15]){
   add(box('diagonal roof brace',[.18,.18,7],[x,10.75,z],'rust',{rotation:[0,0,.58]}));
   add(box('diagonal roof brace',[.18,.18,7],[x,10.75,z],'steel',{rotation:[0,0,-.58]}));
  }
 }
 for(const z of [-8,2,12])add(box('high longitudinal I beam',[31,.38,.3],[0,9.2,z],'steel'));
 // Arrival and restrained return marker; no cyan bloom.
 add(box('arrival runner',[4,.035,3],[0,.04,0],'rugLight'));
 add(box('return portal plinth',[2.6,.25,1.4],[-4,.25,0],'steel',{collider:true}));
 add(torus('return portal ring',[2.8,.16,2.8],[-4,2.05,0],'amber'));
 for(const x of [-4.7,-4,-3.3])add(box('return sign glyph',[.38,.07,.05],[x,3.7,-.08],'cream'));
 // Layered lounge, kept west of both verified routes.
 add(box('large lounge rug',[8,.04,6],[-9,.03,3.8],'rug'));
 add(box('small layered rug',[5,.045,3.5],[-8.5,.06,3.5],'rugLight',{rotation:[0,.08,0]}));
 for(const x of [-10.8,-9.6,-8.4,-7.2])add(box('cream sectional cushion',[1.08,.34,1.45],[x,.67,6.35],'fabric',{collider:true}));
 add(box('cream sectional back',[5,1.18,.34],[-9,1.26,7.02],'fabric',{collider:true}));
 for(const x of [-11.48,-6.52])add(box('sectional arm',[.36,.82,1.72],[x,.89,6.35],'fabric',{collider:true}));
 add(box('low wood table',[3,.15,1.55],[-9,.72,3],'wood',{collider:true}));
 for(const x of [-10.25,-7.75])for(const z of [2.4,3.6])add(box('coffee table leg',[.1,.65,.1],[x,.36,z],'steel'));
 add(box('side table top',[1.1,.1,1.1],[-12.4,.65,4.6],'wood'));add(cyl('side table stem',[.1,.6,.1],[-12.4,.32,4.6],'steel'));
 // Plants use stems and individual leaves rather than spherical crowns.
 for(const [x,z,h] of [[-13,7,2.2],[-14,1.5,1.7],[13.5,-7,2],[11,16,1.8]]){
  add(cyl('ceramic plant pot',[.72,.65,.72],[x,.33,z],'ceramic'));add(cyl('plant stem',[.12,h,.12],[x,.75+h/2,z],'leaf'));
  for(let i=0;i<7;i++){const a=i*2.4;add(box('plant leaf',[.18,.05,.75],[x+Math.sin(a)*.38,1.15+i*h/9,z+Math.cos(a)*.38],'leaf',{rotation:[0,a,.55-(i%2)*1.1]}));}
 }
 // Kitchen/bar with clear x=12 circulation lane.
 add(box('kitchen island',[6,.78,1.35],[5,.44,5],'wood',{collider:true}));add(box('stone worktop',[6.2,.12,1.55],[5,.89,5],'concreteDark',{collider:true}));
 for(const x of [2.75,4.25,5.75,7.25]){add(box('cabinet front',[1.3,.62,.05],[x,.48,4.3],'cream'));add(box('cabinet pull',[.42,.04,.07],[x,.55,4.25],'steel'));}
 add(box('sink',[1.25,.06,.65],[5,.96,5],'black'));add(cyl('faucet',[.08,.7,.08],[5,.98,5.45],'steel'));
 for(const x of [2,4,6,8]){add(box('wall cabinet',[1.4,1.65,.55],[x,1.05,8],'wood',{collider:true}));add(box('cabinet inset',[1.22,1.45,.05],[x,1.05,7.7],'cream'));}
 add(box('fridge',[1.3,2.35,.9],[10,1.18,7.5],'steel',{collider:true}));
 for(const x of [3,5,7,9]){add(box('bar stool seat',[.62,.12,.62],[x,.76,3.6],'charcoal'));for(const dx of [-.22,.22])for(const dz of [-.22,.22])add(box('stool leg',[.07,.7,.07],[x+dx,.37,3.6+dz],'steel'));}
 // Dining remains below and forward of the loft.
 add(box('dining tabletop',[5,.16,2],[7,.94,-5],'wood',{collider:true}));for(const x of [5,9])for(const z of [-5.7,-4.3])add(box('table leg',[.13,.86,.13],[x,.47,z],'steel'));
 for(const x of [5,7,9])for(const z of [-6.5,-3.5]){add(box('dining chair seat',[.78,.13,.78],[x,.54,z],'charcoal',{collider:true}));add(box('dining chair back',[.78,.95,.12],[x,1.02,z+(z<-5?.34:-.34)],'charcoal'));for(const dx of [-.28,.28])for(const dz of [-.28,.28])add(box('chair leg',[.07,.5,.07],[x+dx,.26,z+dz],'steel'));}
 // Proven staircase, landing, mezzanine footprint, and collision boundaries are unchanged.
 for(let i=0;i<14;i++)add(box('stair tread',[4,.28,.82],[3,.14+i*.25,1.45+i*.65],'concreteDark',{collider:true,walkable:true}));
 add(box('stair landing',[5,.22,1.7],[1.5,3.42,10.9],'concreteDark',{collider:true,walkable:true}));
 for(const side of [.92,5.08]){for(let i=0;i<8;i++)add(box('stair glass safety guard',[.08,1.02,1.15],[side,.82+i*.44,1.4+i*1.12],'glass',{collider:true}));add(box('sloped stair handrail',[.1,.1,10.2],[side,2.45,5.65],'steel',{rotation:[-.366,0,0]}));}
 add(box('landing north glass guard',[5,1.1,.08],[1.5,4.08,11.81],'glass',{collider:true}));add(box('landing north top rail',[5,.1,.12],[1.5,4.62,11.81],'steel'));
 add(box('landing east glass guard',[.08,1.1,1.7],[4.06,4.08,10.9],'glass',{collider:true}));add(box('landing east top rail',[.12,.1,1.7],[4.06,4.62,10.9],'steel'));
 add(box('mezzanine floor',[14,.22,8],[-7,3.5,10],'wood',{collider:true,walkable:true}));
 for(const [z,d] of [[8,4],[12.9,2.2]]){add(box('mezzanine glass guard',[.08,1.1,d],[-.15,4.08,z],'glass',{collider:true}));add(box('mezzanine top rail',[.12,.1,d],[-.15,4.62,z],'steel'));}
 for(const z of [5.94,14.06]){add(box('mezzanine perimeter glass',[14,1.1,.08],[-7,4.08,z],'glass',{collider:true}));add(box('mezzanine perimeter rail',[14,.1,.12],[-7,4.62,z],'steel'));}
 add(box('mezzanine west glass',[.08,1.1,8],[-14.06,4.08,10],'glass',{collider:true}));add(box('mezzanine west rail',[.12,.1,8],[-14.06,4.62,10],'steel'));
 add(box('landing front glass',[2,1.1,.08],[0,4.08,9.99],'glass',{collider:true}));add(box('landing front rail',[2,.1,.12],[0,4.62,9.99],'steel'));
 // Glass-fronted upper computer room x[-13,-2], with east doorway open at z=10.9.
 add(box('computer room rear brick',[11,3.55,.25],[-7.5,5.4,13.45],'brickDark'));
 add(box('computer room west brick',[.25,3.55,6.1],[-13,5.4,10.4],'brickDark'));
 for(const [z,d] of [[8.15,1.7],[12.25,2.3]])add(box('computer room east glass',[.08,3.45,d],[-2,5.38,z],'glass'));
 for(const z of [7.3,9,11.1,13.4])add(box('computer room east mullion',[.1,3.55,.1],[-2,5.4,z],'steel'));
 add(box('computer room front glass',[11,3.45,.08],[-7.5,5.38,7.3],'glass'));
 for(const x of [-13,-11,-9,-7,-5,-3,-2])add(box('computer room front mullion',[.1,3.55,.1],[x,5.4,7.3],'steel'));
 add(box('computer room header',[11,.14,.14],[-7.5,7.14,7.3],'steel'));
 // Warm visible CRT shelves and workstations on the mezzanine.
 for(const x of [-11.5,-8.5,-5.5]){
  add(box('upper computer desk',[2.2,.14,.9],[x,4.25,9],'wood',{collider:true}));for(const dx of [-.9,.9])add(box('upper desk leg',[.1,.7,.1],[x+dx,3.88,9],'steel'));
  add(box('upper CRT shell',[1.3,1,.78],[x,4.95,9.15],'cream'));add(box('upper CRT bezel',[1.04,.72,.06],[x,4.98,8.73],'black'));add(box('upper CRT screen',[.78,.5,.035],[x,5,8.69],'screen'));add(box('upper keyboard',[1.05,.07,.38],[x,4.38,8.38],'cream'));
  add(box('office chair seat',[.7,.13,.7],[x,4.1,7.85],'charcoal'));add(box('office chair back',[.7,.85,.12],[x,4.55,8.16],'charcoal'));
 }
 for(const y of [4.05,5.05,6.05])add(box('CRT display shelf',[9.2,.11,.55],[-7.5,y,12.7],'wood'));
 for(const x of [-11,-9.2,-7.4,-5.6,-3.8])for(const y of [4.55,5.55,6.55]){add(box('shelf CRT shell',[1.25,.78,.5],[x,y,12.45],'cream'));add(box('shelf CRT dark screen',[.82,.48,.035],[x,y,12.17],'black'));}
 // Sparse, faded industrial paint; no neon loops.
 for(const [z,r] of [[-4,.42],[2,-.34],[14,.28]]){add(box('faded graffiti stroke',[.035,.16,2.2],[15.79,3,z],'graffiti',{rotation:[r,0,0]}));add(box('faded graffiti mark',[.035,.12,1.3],[15.78,3.55,z+.3],'rust',{rotation:[-r,0,0]}));}
 // Pendants, task fixtures, hanging vines, and richer shelf-scale objects.
 for(const x of [-9,-3,3,9]){add(box('pendant cord',[.035,1.2,.035],[x,10.95,2],'black'));add(cyl('pendant shade',[.62,.3,.62],[x,10.25,2],'black'));add(sphere('warm pendant bulb',[.22,.22,.22],[x,10.05,2],'amber'));}
 for(const x of [-12,-8,-4])for(let i=0;i<5;i++){add(cyl('trailing vine stem',[.045,.7,.045],[x+i*.08,4.7-i*.45,5.8],'leaf'));add(box('trailing vine leaf',[.28,.04,.48],[x+.18,4.65-i*.45,5.82],'leaf',{rotation:[0,i*.8,.5]}));}
 add(box('display shelf',[5,.12,.55],[11,2.2,16.5],'wood'));add(box('display shelf',[5,.12,.55],[11,1.25,16.5],'wood'));
 for(let i=0;i<8;i++){add(box('shelf book',[.28,.55,.32],[8.8+i*.55,1.58,16.3],i%3===0?'rust':'cream'));add(cyl('small vessel',[.22,.42,.22],[9+i*.62,2.47,16.3],i%2?'ceramic':'steel'));}
 const lights=[
  {name:'lounge pool',position:[-9,3,4],color:0xffc27a,intensity:5,range:8},
  {name:'kitchen pendants',position:[5,3.2,5],color:0xffb565,intensity:6,range:7},
  {name:'dining pool',position:[7,3,-5],color:0xffc07a,intensity:5,range:7},
  {name:'stair safety',position:[3,4.5,7],color:0xf0b06a,intensity:4,range:6},
  {name:'computer room west',position:[-10,6.1,10],color:0xffa95c,intensity:5,range:6},
  {name:'computer room east',position:[-4.5,6.1,10],color:0xffbc73,intensity:5,range:6},
  {name:'workbench pool',position:[10,3,15],color:0xffb66d,intensity:4,range:6},
  {name:'arrival practical',position:[-2,3.5,0],color:0xe9c394,intensity:3,range:5}
 ];
 return {materials,objects,zones:{arrival:[0,1,0],lounge:[-9,1,4],kitchen:[5,1,5],dining:[7,1,-5],retro:[-7.5,4,10],mezzanine:[-7,4,10]},lights};
}
