import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const issues=[];
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!['.git','node_modules','dist'].includes(e.name)?walk(path.join(d,e.name)):e.isFile()?[path.join(d,e.name)]:[]);}
for(const file of walk(root)){
 const rel=path.relative(root,file).replaceAll('\\','/');
 if(rel==='tools/check-publication.mjs')continue;
 if(/(?:^|\/)(?:audit-evidence|integration-evidence)\//.test(rel)||/\.(?:pem|key|pcap|pcapng)$/.test(rel)||/(?:^|\/)\.env$/.test(rel))issues.push(`${rel}: private file class`);
 if(/public\/models\/(?:godzilla\/|port\/delorean)/i.test(rel))issues.push(`${rel}: excluded asset`);
 if(/\.(?:js|mjs|py|md|html|json|txt|yml|yaml|service|example|svg)$/.test(rel)){
  const t=fs.readFileSync(file,'utf8');
  if(/burning[\s_-]*horizons|\bBH_|\bbh[.\-_:]/i.test(t))issues.push(`${rel}: old project naming`);
  if(/\bhpubuntu\b|\bcottageserver\b|\b[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net\b|C:[\\/]Users[\\/]Loz\b|\b192\.168\.\d+\.\d+\b/i.test(t))issues.push(`${rel}: private environment reference`);
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bsk-proj-[A-Za-z0-9_-]{30,}/.test(t))issues.push(`${rel}: possible credential`);
 }
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/models/port/licensing/vehicle-manifest.json'),'utf8'));
for(const record of manifest){const file=path.join(root,'public/models/port',record.file);if(!fs.existsSync(file)||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==record.sha256)issues.push(`${record.file}: asset hash mismatch`);}
for(const entry of ['index.html','network-demo.html','play-online.html']){const text=fs.readFileSync(path.join(root,entry),'utf8');if(!/<title>ElseMesh/.test(text))issues.push(`${entry}: incorrect game title`);}
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log(`Publication checks passed: identifiers, file exclusions, bounded privacy scan, titles and ${manifest.length} vehicle hashes.`);
