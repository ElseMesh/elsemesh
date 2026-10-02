import http from 'node:http';
import fs from 'node:fs';
fs.mkdirSync('artifacts/video',{recursive:true});
const routes={'/loz':'Loz-rental-avatar.png','/surf':'Third-island-breakers.png','/video':'Third-island-avatar-review.webm','/stock-video':'Stock-player-walk-run.webm','/stock-image':'Stock-player-in-game.png','/avatar-image':'Avatar-female-preview.png','/avatar-chooser':'Avatar-chooser.png'};
http.createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5189');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 if(req.method!=='POST'||!routes[req.url]){res.writeHead(404).end();return;}
 const file=fs.createWriteStream('artifacts/video/'+routes[req.url]);let size=0;
 req.on('data',c=>{size+=c.length;if(size>200*1024*1024)req.destroy();});req.pipe(file);
 file.on('finish',()=>res.writeHead(200).end('saved'));file.on('error',()=>res.writeHead(500).end());
}).listen(5192,'127.0.0.1');
