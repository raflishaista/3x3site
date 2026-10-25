// Isolated UI fixture: no network accounts and no writes to the user's profiles.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../dist');
const fixture = `
let cloud = null;
initializeAccounts = async function() {
  const artwork = n => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#333"/><text x="100" y="115" text-anchor="middle" fill="white" font-size="70">'+n+'</text></svg>');
  currentAccount = {id:'fixture',username:'tester'};
  state = {name:'Test profile',username:'tester',bio:'Local UI verification',avatar:'',columns:2,collections:[{id:'test-grid',title:'Test grid',slots:Array.from({length:9},(_,i)=>({source:artwork(i+1),info:'Original '+(i+1),alt:'Image '+(i+1)}))}]};
  ownProfile = structuredClone(state);
  persist = async next => {state=structuredClone(next);ownProfile=structuredClone(next);};
};
`;
http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(fixture);}
  const isPage=!path.extname(name);
  const file=path.resolve(root,'.'+(isPage?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404).end();return;}
    if(isPage) data=data.toString().replace('<script src="/vendor/supabase.js"></script>','').replace('<script src="/cloud.js"></script>','<script src="/fixture.js"></script>');
    res.setHeader('Content-Type',isPage?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);
  });
}).listen(3314,'127.0.0.1',()=>console.log('Isolated UI fixture: http://localhost:3314/tester/collection/test-grid'));
