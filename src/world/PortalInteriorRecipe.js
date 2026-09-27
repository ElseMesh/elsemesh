const box=(name,size,position,material,options={})=>({name,shape:'box',size,position,rotation:options.rotation||[0,0,0],material,collider:options.collider,walkable:options.walkable});
const cyl=(name,size,position,material,options={})=>({name,shape:'cylinder',size,position,rotation:options.rotation||[0,0,0],material,collider:options.collider,walkable:options.walkable});
const sphere=(name,size,position,material,options={})=>({name,shape:'sphere',size,position,rotation:options.rotation||[0,0,0],material,collider:options.collider,walkable:options.walkable});
const torus=(name,size,position,material,rotation=[Math.PI/2,0,0])=>({name,shape:'torus',size,position,rotation,material});

export function buildRecipe(){
 const materials={
  brick:{color:0x70453b,roughness:.94,metalness:0,pattern:'brick',brickSize:[.25,.08],mortar:.006},
  brickDark:{color:0x49322e,roughness:.97,metalness:0,pattern:'brick',brickSize:[.25,.08],mortar:.006},
  concrete:{color:0x5f6260,roughness:.9,metalness:.02,pattern:'mottled'},
  concreteDark:{color:0x424644,roughness:.96,metalness:.02,pattern:'mottled'},
  steel:{color:0x20282a,roughness:.48,metalness:.78,pattern:'scratched'},
  rust:{color:0x643d2c,roughness:.82,metalness:.35,pattern:'scratched'},
  glass:{color:0xcbd3d0,roughness:.08,metalness:.02,opacity:.08,transparent:true,depthWrite:false},
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
  cream:{color:0xd9ceb8,roughness:.72,metalness:0},
  c64Plastic:{color:0xc6a46f,roughness:.76,metalness:0},
  c64Key:{color:0x4a382b,roughness:.7,metalness:0},
  sunPlastic:{color:0xd8d3c8,roughness:.68,metalness:0},
  sunPurple:{color:0x66507f,roughness:.64,metalness:0},
  neonCyan:{color:0x35d8de,roughness:.28,metalness:.08,emissive:0x12636a},
  neonMagenta:{color:0xe45aa8,roughness:.3,metalness:.06,emissive:0x6c1748},
  neonAmber:{color:0xf0ad45,roughness:.32,metalness:.08,emissive:0x75410b}
 };
 const objects=[]; const add=o=>objects.push(o);
 // Shell: continuous material surfaces carry metre-scaled procedural brick/concrete detail.
 add(box('worn concrete floor',[32,.3,30],[0,-.15,3],'concrete',{collider:true,walkable:true}));
 // The reference-defining west wall is mostly tall glazing: solid sill/header and
 // narrow brick piers retain the safe perimeter while cool daylight reads through.
 add(box('west brick sill',[.38,1.2,30],[-16,.6,3],'brick',{collider:true}));
 add(box('west brick header',[.38,2.55,30],[-16,10.725,3],'brickDark',{collider:true}));
 for(const z of [-11.5,-6.5,-1.5,3.5,8.5,13.5,17.5])add(box('west window brick pier',[.4,8.25,1],[-16,5.325,z],'brick',{collider:true}));
 for(const z of [-9,-4,1,6,11,15.5]){
  add(box('west clear factory glazing',[.06,8.05,3.9],[-15.78,5.32,z],'glass',{collider:true}));
  for(const dz of [-1.9,-.95,0,.95,1.9])add(box('west fine vertical mullion',[.13,8.12,.055],[-15.72,5.32,z+dz],'steel'));
  for(const y of [1.35,2.7,4.05,5.4,6.75,8.1,9.35])add(box('west fine horizontal mullion',[.13,.055,3.92],[-15.72,y,z],'steel'));
 }
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
 // Upholstered L-sectional: rigid base carries soft ellipsoid pads, backs, and loose pillows.
 add(box('sectional timber base',[5.5,.22,1.7],[-8.85,.4,6.3],'wood',{collider:true}));
 for(const x of [-10.8,-9.6,-8.4,-7.2]){
  add(sphere('rounded sectional seat',[1.12,.38,1.42],[x,.69,6.25],'fabric',{rotation:[0,.02,0]}));
  add(sphere('rounded sectional back',[1.08,.92,.34],[x,1.2,6.91],'fabric',{rotation:[-.12,0,0]}));
 }
 add(box('sectional return base',[1.7,.22,2.5],[-11.05,.4,4.4],'wood',{collider:true}));
 for(const z of [5.25,4.25,3.3])add(sphere('sectional return seat',[1.4,.38,.88],[-11.05,.69,z],'fabric'));
 for(const [x,z,r] of [[-10.35,6.72,-.18],[-8.95,6.7,.12],[-7.55,6.73,-.1],[-11.05,4.75,.18]])add(sphere('loose lounge pillow',[.72,.7,.22],[x,1.2,z],'rugLight',{rotation:[0,r,r]}));
 for(const x of [-11.45,-6.45])add(box('sectional arm',[.3,.68,1.72],[x,.82,6.3],'fabric'));
 for(const x of [-10.8,-8.1,-6.65])for(const z of [5.65,6.8])add(cyl('short sofa leg',[.07,.32,.07],[x,.2,z],'steel'));
 // Two nesting tables and small lived-in props.
 add(box('large nesting table',[2.6,.12,1.35],[-8.85,.67,3.25],'wood'));
 add(box('small nesting table',[1.55,.1,1.05],[-7.15,.48,2.65],'concreteDark'));
 for(const [x,z,h] of [[-9.95,2.72,.62],[-7.75,2.72,.62],[-8.05,3.78,.62],[-6.55,2.25,.43],[-7.75,3.05,.43]])add(cyl('coffee table leg',[.06,h,.06],[x,h/2,z],'steel'));
 add(box('coffee table book',[.62,.06,.42],[-9.3,.78,3.2],'rust',{rotation:[0,.18,0]}));add(cyl('coffee mug',[.16,.2,.16],[-8.35,.82,3.15],'cream'));add(box('coffee tray',[.7,.035,.45],[-7.15,.56,2.65],'wood'));
 add(box('side table top',[1.1,.1,1.1],[-12.4,.65,4.6],'wood'));add(cyl('side table stem',[.1,.6,.1],[-12.4,.32,4.6],'steel'));
 // Branched plants with many thin ellipsoid leaves form irregular silhouettes.
 for(const [x,z,h] of [[-13,7,2.2],[-14,1.5,1.7],[13.5,-7,2],[11,16,1.8]]){
  add(cyl('ceramic plant pot',[.72,.65,.72],[x,.33,z],'ceramic'));
  for(let b=0;b<3;b++){const ba=b*2.1+.35;add(cyl('plant branch',[.055,h*(.72+b*.1),.055],[x+Math.sin(ba)*.16,.65+h*.4,z+Math.cos(ba)*.16],'leaf'));
   for(let i=0;i<6;i++){const a=ba+i*1.75;const y=.9+i*h/7+b*.08;add(sphere('tapered plant leaf',[.48,.09,.19],[x+Math.sin(a)*(.28+i*.035),y,z+Math.cos(a)*(.28+i*.035)],'leaf',{rotation:[0,a,(i%2?.38:-.38)]}));}
  }
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
 // Three recognisable, realistically scaled period workstations. Screen artwork is
 // described separately so runtime canvas and Blender can render the same text.
 const screens=[
  {id:'c64',object:'C64 screen',width:1024,height:768,background:0x3155a4,border:0x78a4d8,foreground:0x9dc7eb,lines:['COMMODORE 64 BASIC V2','38911 BASIC BYTES FREE','READY.'],cursor:{column:0,row:3,color:0x9dc7eb,blink:true}},
  {id:'bbc',object:'BBC screen',width:1024,height:768,background:0x050505,border:0x111111,foreground:0xf2f2e8,lines:['BBC Computer 32K','BASIC','>'],cursor:{column:1,row:2,color:0xffffff,blink:true}},
  {id:'sun',object:'Sun screen',width:1536,height:1152,background:0xa7aaa5,border:0x343b3d,foreground:0x171d1e,windows:true}
 ];
 for(const [x,id] of [[-11.5,'c64'],[-8.5,'bbc'],[-5.5,'sun']]){
  // Full-depth tops finish at 4.36 m and support every computer, keyboard and nameplate.
  add(box(id+' workstation desk',[2.2,.14,1.9],[x,4.29,8.62],'wood',{collider:true}));
  for(const dx of [-.9,.9])for(const dz of [-.72,.72])add(box(id+' desk leg',[.1,.61,.1],[x+dx,3.915,8.62+dz],'steel'));
  const sun=id==='sun', bbc=id==='bbc', caseMaterial=sun?'sunPlastic':bbc?'cream':'c64Plastic';
  const keyMaterial=sun?'sunPlastic':bbc?'black':'c64Key';
  // Layered case pieces give the CRT a deep molded housing and recessed face.
  add(box(id+' CRT pedestal',[.38,.12,.38],[x,4.43,9.03],caseMaterial));
  add(box(id+' CRT rear case',[sun?.72:.64,sun?.59:.57,.58],[x,4.80,9.12],caseMaterial));
  add(box(id+' CRT face surround',[sun?.7:.62,sun?.53:.5,.09],[x,4.81,8.80],caseMaterial));
  add(box(id+' CRT recessed bezel',[sun?.59:.53,sun?.43:.41,.045],[x,4.83,8.745],'black'));
  add(box((id==='c64'?'C64':id==='bbc'?'BBC':'Sun')+' screen',[sun?.51:.45,sun?.35:.33,.018],[x,4.84,8.714],'screen'));
  for(let v=-2;v<=2;v++)add(box(id+' monitor vent slit',[.055,.003,.25],[x+v*.105,5.0955,9.12],'black'));
  add(cyl(id+' monitor knob',[.045,.025,.045],[x+.25,4.62,8.69],'black',{rotation:[Math.PI/2,0,0]}));
  add(box(id+' monitor power button',[.065,.04,.025],[x+.17,4.61,8.69],'black'));
  add(box(id+' monitor status LED',[.025,.025,.018],[x+.26,4.61,8.675],sun?'leaf':'amber'));
  // Distinct breadbin, wedge, and pizza-box bodies sit behind full keyboards.
  add(box(id+' computer base',[sun?.76:.68,.11,sun?.5:.44],[x,4.43,8.42],caseMaterial));
  add(box(id+' keyboard tray',[sun?.78:.7,.065,.36],[x,4.43,8.16],caseMaterial,{rotation:[-.045,0,0]}));
  const rows=[
   {count:sun?14:13,z:8.27,offset:0},
   {count:14,z:8.21,offset:.015},
   {count:13,z:8.15,offset:.032},
   {count:12,z:8.09,offset:.052}
  ];
  for(let r=0;r<rows.length;r++){const row=rows[r],pitch=.048,start=-(row.count-1)*pitch/2+row.offset;for(let k=0;k<row.count;k++){
   let w=.041;if(r===3&&(k===0||k===row.count-1))w=.075;
   add(box(id+' key r'+r+' k'+k,[w,.024,.043],[x+start+k*pitch,4.485,row.z],bbc&&r===0?'rust':keyMaterial));
  }}
  add(box(id+' space key',[.27,.024,.043],[x,4.485,8.03],keyMaterial));
  add(box(id+' left shift key',[.115,.024,.043],[x-.285,4.485,8.03],keyMaterial));
  add(box(id+' return key',[.1,.024,.095],[x+.3,4.485,8.115],keyMaterial));
  for(let f=0;f<(sun?10:8);f++)add(box(id+' function key '+f,[.04,.025,.035],[x-.25+f*.056,4.49,8.32],bbc?'rust':keyMaterial));
  // One transparent immutable atlas labels the complete key field without per-key materials.
  add(box(id+' keyboard legends',[sun?.74:.66,.006,.34],[x,4.501,8.17],'black'));
  if(sun){add(box('Sun purple accent',[.76,.025,.035],[x,4.47,8.335],'sunPurple'));add(sphere('Sun mouse',[.13,.06,.18],[x+.56,4.46,8.13],'sunPlastic'));}
  add(box((id==='c64'?'COMMODORE 64':id==='bbc'?'BBC MODEL B':'SUN SPARCSTATION')+' nameplate',[.62,.1,.025],[x,4.34,7.69],'cream'));
  for(let v=-2;v<=2;v++)add(box(id+' base vent slit',[.055,.003,.16],[x+v*.09,4.4865,8.55],'black'));
  // Low backs remain outside the tabletop volume on the front side of each desk.
  const chairX=x+.60;
  add(box('office chair seat',[.62,.12,.62],[chairX,4.08,7.85],'charcoal'));
  add(box('office chair low back',[.62,.32,.1],[chairX,4.27,7.49],'charcoal'));
  for(const dx of [-.22,.22])for(const dz of [-.22,.22])add(box('office chair leg',[.055,.42,.055],[chairX+dx,3.82,7.85+dz],'steel'));
 }
 // One original rear-wall sculpture replaces the cancelled banks of shelf computers.
 add(box('neon artwork backing',[7.8,2.55,.08],[-7.5,5.65,13.27],'black'));
 add(box('neon artwork cyan diagonal',[.16,1.65,.055],[-9.55,5.75,13.20],'neonCyan',{rotation:[0,0,-.72]}));
 add(box('neon artwork magenta diagonal',[.16,1.9,.055],[-7.45,5.7,13.19],'neonMagenta',{rotation:[0,0,.62]}));
 add(box('neon artwork amber horizon',[3.4,.14,.055],[-6.05,5.05,13.18],'neonAmber'));
 add(torus('neon artwork cyan orbit',[1.35,.11,1.35],[-5.05,5.95,13.15],'neonCyan',[0,0,0]));
 add(sphere('neon artwork amber focus',[.34,.34,.08],[-8.45,6.15,13.14],'neonAmber'));
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
 return {materials,objects,screens,zones:{arrival:[0,1,0],lounge:[-9,1,4],kitchen:[5,1,5],dining:[7,1,-5],retro:[-7.5,4,10],mezzanine:[-7,4,10]},lights};
}
