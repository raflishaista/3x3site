const {test}=require('node:test');
const assert=require('node:assert/strict');
const {publicConfig,server}=require('../server.cjs');
test('public configuration never exposes a secret key or database URL',()=>{
 const saved=process.env.SUPABASE_PUBLISHABLE_KEY;
 try{process.env.SUPABASE_PUBLISHABLE_KEY='sb_secret_not-public';assert.ok(publicConfig().error);process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_example';assert.deepEqual(Object.keys(publicConfig()).sort(),['key','url']);assert.ok(!JSON.stringify(publicConfig()).includes('postgresql://'));}finally{process.env.SUPABASE_PUBLISHABLE_KEY=saved;}
});
test('environment files are inaccessible over HTTP',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const root='http://127.0.0.1:'+server.address().port;for(const p of ['/.env','/%2e%2e%2f.env','/server.cjs']){const response=await fetch(root+p);assert.ok([403,404].includes(response.status));}const response=await fetch(root+'/vendor/supabase.js');assert.equal(response.status,200);}finally{await new Promise(resolve=>server.close(resolve));}
});
