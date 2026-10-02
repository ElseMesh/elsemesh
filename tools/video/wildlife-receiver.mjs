// Agent Control: bounded loopback-only evidence collector; no arbitrary file paths.
import http from 'node:http';
import fs from 'node:fs';
const dir='artifacts/video/ElseMesh-Wildlife';fs.mkdirSync(dir,{recursive:true});
const allowed=new Set(['monkeys.png','bananas.png','bark.png','review.webm','benchmark.json']);
http.createServer(async(req,res)=>{
	res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5189');
	res.setHeader('Access-Control-Allow-Headers','Content-Type');
	if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
	if(req.method!=='POST'||!allowed.has(req.url.slice(1))){res.writeHead(400).end();return;}
	const chunks=[];let size=0;
	for await(const c of req){size+=c.length;if(size>80e6){res.writeHead(413).end();return;}chunks.push(c);}
	fs.writeFileSync(dir+req.url,Buffer.concat(chunks));res.end('saved');
}).listen(5193,'127.0.0.1',()=>console.log('Wildlife evidence collector: '+dir));
