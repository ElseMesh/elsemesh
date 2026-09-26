import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const out='D:/Downloads';fs.mkdirSync(out,{recursive:true});
const target=path.join(out,'Burning-Horizons-third-island-helicopter.webm');
http.createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5189');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 if(req.method!=='POST'||!['/video','/image','/report'].includes(req.url)){res.writeHead(404).end();return;}
 const file=fs.createWriteStream(req.url==='/video'?target:path.join(out,req.url==='/image'?'Burning-Horizons-helicopter.png':'Burning-Horizons-helicopter-capture.json'));
 let size=0;req.on('data',c=>{size+=c.length;if(size>300*1024*1024)req.destroy();});req.pipe(file);
 file.on('finish',()=>res.writeHead(200).end('saved'));file.on('error',()=>res.writeHead(500).end());
}).listen(5191,'127.0.0.1',()=>console.log('Helicopter video receiver: D:/Downloads'));
