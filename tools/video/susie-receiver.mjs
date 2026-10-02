import http from 'node:http';
import fs from 'node:fs';
const dir='artifacts/video/Susie-journey';fs.mkdirSync(dir,{recursive:true});
let index=0;
http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5189');res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 if(req.method!=='POST'){res.writeHead(405).end();return;}
 const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>30e6){res.writeHead(413).end();return;}chunks.push(c);}const bytes=Buffer.concat(chunks);
 if(req.url==='/start'){index=0;fs.writeFileSync(dir+'/journey.webm','');}
 else if(req.url===`/chunk/${index}`){fs.appendFileSync(dir+'/journey.webm',bytes);index++;}
 else if(/^\/setup[1-4]$/.test(req.url))fs.writeFileSync(dir+req.url+'.png',bytes);
 else if(req.url==='/report')fs.writeFileSync(dir+'/report.json',bytes);
 else if(req.url==='/proof')fs.writeFileSync(dir+'/godzilla-dry.png',bytes);
 else {res.writeHead(400).end('Unexpected chunk or route');return;}
 res.end('saved');
}).listen(5193,'127.0.0.1',()=>console.log('Susie capture receiver on 5193'));
