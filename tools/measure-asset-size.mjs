import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const base='717d054eed7c4e69289d0bbcbe778d18f4aeadf0';
const baseline=execFileSync('git',['ls-tree','-r','-l',base,'public','src/world'],{encoding:'utf8'}).trim().split('\n').map(line=>{
  const m=line.match(/^\d+ blob ([a-f0-9]+)\s+(\d+)\t(.+)$/);
  if(!m)throw Error('unrecognized git tree record');return {file:m[3],bytes:Number(m[2]),oid:m[1]};
});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const file=path.posix.join(dir,e.name);return e.isDirectory()?walk(file):[{file,bytes:fs.statSync(file).size}];
});}
const current=[...walk('public'),...walk('src/world')];
const sum=(files,prefix)=>files.filter(f=>f.file.startsWith(prefix)).reduce((n,f)=>n+f.bytes,0);
const categories=['public/','public/models/','public/textures/','public/clouds/','public/audio/','public/ui/','public/models/port/','src/world/'];
const totals=Object.fromEntries(categories.map(k=>[k,{before:sum(baseline,k),now:sum(current,k),added:sum(current,k)-sum(baseline,k)}]));
const activePort=['bracken-gatehouse.glb','mmc-sedan-ai68.glb','delorean-demo.glb','estate-lod1.glb','panel-van-lod1.glb','compact-lod1.glb','ivy-trial/building-ivy.glb','ivy-trial/fence-ivy.glb'];
function glb(file,b=fs.readFileSync(file)){
  if(b.toString('ascii',0,4)!=='glTF')throw Error('not binary glTF');
  const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());
  const imageViews=new Set((j.images??[]).map(i=>i.bufferView).filter(i=>i!==undefined));
  let embeddedImageBytes=0,otherBufferViewBytes=0;
  for(const [i,v] of (j.bufferViews??[]).entries())if(imageViews.has(i))embeddedImageBytes+=v.byteLength;else otherBufferViewBytes+=v.byteLength;
  let triangles=0;for(const m of j.meshes??[])for(const p of m.primitives)if((p.mode??4)===4)triangles+=j.accessors[p.indices??p.attributes.POSITION].count/3;
  return {file,bytes:b.length,embeddedImageBytes,otherBufferViewBytes,jsonPaddingHeadersBytes:b.length-embeddedImageBytes-otherBufferViewBytes,triangles};
}
const port=current.filter(f=>f.file.startsWith('public/models/port/')&&f.file.endsWith('.glb')).map(f=>({...glb(f.file),loadedByCurrentPort:activePort.includes(f.file.slice('public/models/port/'.length))}));
const loadedPort=port.filter(f=>f.loadedByCurrentPort);
const imageRE=/\.(png|jpe?g|webp|avif|ktx2?|hdr|exr|tga|dds)$/i;
const shapeRE=/\.(glb|gltf|obj|fbx|bin)$/i;
const visual=f=>f.file.startsWith('public/models/')||f.file.startsWith('public/textures/')||f.file.startsWith('public/clouds/');
const sizes=files=>({visualAssetDirectoryBytes:files.filter(visual).reduce((n,f)=>n+f.bytes,0),standaloneImageBytes:files.filter(f=>visual(f)&&imageRE.test(f.file)).reduce((n,f)=>n+f.bytes,0),shapeAndContainerBytes:files.filter(f=>visual(f)&&shapeRE.test(f.file)).reduce((n,f)=>n+f.bytes,0)});
function embeddedTotals(files,historical=false){
  const records=files.filter(f=>visual(f)&&f.file.endsWith('.glb')).map(f=>glb(f.file,historical?execFileSync('git',['cat-file','blob',f.oid],{maxBuffer:256*1024*1024}):undefined));
  return {embeddedImageBytes:records.reduce((n,r)=>n+r.embeddedImageBytes,0),geometryAnimationBufferBytes:records.reduce((n,r)=>n+r.otherBufferViewBytes,0)};
}
const report={date:new Date().toISOString(),baselineCommit:base,units:'bytes; MB = 1000000 bytes',scope:'Uncompressed on-disk assets, not HTTP compressed transfer, GPU VRAM or heap. All-world visual directories include fauna/characters/vehicles. Procedural world geometry is generated at runtime.',totals,before:sizes(baseline),now:sizes(current),port,loadedPortTotals:Object.fromEntries(['bytes','embeddedImageBytes','otherBufferViewBytes','triangles'].map(k=>[k,loadedPort.reduce((n,f)=>n+f[k],0)])),largestCurrent:current.filter(visual).sort((a,b)=>b.bytes-a.bytes).slice(0,12)};
report.before.glb=embeddedTotals(baseline,true);report.now.glb=embeddedTotals(current);
fs.mkdirSync('integration-evidence',{recursive:true});fs.writeFileSync('integration-evidence/asset-size-comparison.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
