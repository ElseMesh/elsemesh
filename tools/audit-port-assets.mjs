import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const files=['ivy-trial/building-ivy.glb','ivy-trial/fence-ivy.glb','mmc-sedan-trial.glb','estate-lod1.glb','panel-van-lod1.glb','compact-lod1.glb'];
const result=files.map(name=>{
  const file=path.join('public/models/port',name),data=fs.readFileSync(file);
  if(data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)throw Error(`Invalid GLB: ${file}`);
  const json=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)).trim());
  const primitives=json.meshes.flatMap(m=>m.primitives);
  let triangles=0;
  for(const p of primitives){if((p.mode??4)!==4)throw Error('Unsupported topology');triangles+=(json.accessors[p.indices??p.attributes.POSITION].count)/3;}
  return {file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),triangles,meshes:json.meshes.length,primitives:primitives.length,materials:json.materials?.length??0,images:json.images?.length??0,drawCalls:'Not measured; primitive count is not frame draw telemetry'};
});
console.log(JSON.stringify(result,null,2));
