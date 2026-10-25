const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
if (fs.existsSync(path.join(__dirname,'.env'))) process.loadEnvFile(path.join(__dirname,'.env'));
const root = path.join(__dirname,'dist');
const port = Number(process.env.PORT) || 3313;
function publicConfig() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  let safe = key.startsWith('sb_publishable_');
  if (key.startsWith('eyJ')) { try { safe = JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role === 'anon'; } catch {} }
  if (!url || !key || !safe) return {error:'Set SUPABASE_URL and a publishable (or legacy anon) key in .env. Secret keys cannot be used in the browser.'};
  return {url,key};
}
const server = http.createServer((req,res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (name === '/api/config') {
    const config=publicConfig();
    res.writeHead(config.error?503:200,{'Content-Type':'application/json'}).end(JSON.stringify(config)); return;
  }
  const file = name === '/vendor/supabase.js' ? path.join(__dirname,'node_modules/@supabase/supabase-js/dist/umd/supabase.js') : path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if (name !== '/vendor/supabase.js' && !file.startsWith(root+path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file,(err,data) => {
    if (err) {res.writeHead(404).end('Not found');return;}
    res.setHeader('Content-Type',({html:'text/html',css:'text/css',js:'application/javascript',png:'image/png'})[file.split('.').pop()]||'application/octet-stream');
    res.end(data);
  });
});
if (require.main === module) server.listen(port,'127.0.0.1',()=>console.log('Local: http://localhost:'+port));
module.exports={server,publicConfig};
