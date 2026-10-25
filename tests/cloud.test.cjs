const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){const calls=[];const context=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,initializeAccounts(){},renderAccountNav(){},renderAccountForm(){},initial:{name:'Your name',collections:[],avatar:'assets/avatar.png'},currentAccount:{id:'alice'},state:null,fetch:async()=>({blob:async()=>({type:'image/gif'})})});vm.runInContext(fs.readFileSync('dist/cloud.js','utf8'),context);return {context,calls,run:s=>vm.runInContext(s,context)}}
test('cloud save uploads GIFs and stores URLs, crops and metadata under current user',async()=>{
 const {run}=setup();run(`var written;cloud={storage:{from:()=>({upload:async(path,blob)=>({}),getPublicUrl:path=>({data:{publicUrl:'https://images.test/'+path}}),remove:async()=>({})})},from:()=>({upsert:async row=>{written=row;return {}}})};`);
 await run(`saveCloudProfile({name:'Alice',avatar:'assets/avatar.png',collections:[{title:'Films',slots:[{source:'data:image/gif;base64,AAA',zoom:2,x:.2,info:'Info',link:'https://example.com'}]}]})`);
 assert.equal(run('written.user_id'),'alice');assert.match(run('written.profile.collections[0].slots[0].source'),/^https:\/\/images.test\/alice\/.*\.gif$/);assert.equal(run('written.profile.collections[0].slots[0].zoom'),2);assert.equal(run('written.profile.collections[0].slots[0].info'),'Info');
});
test('failed database save cleans up newly uploaded images and preserves saved state',async()=>{
 const {run}=setup();run(`var removed=[];state={name:'Saved'};cloud={storage:{from:()=>({upload:async()=>({}),getPublicUrl:path=>({data:{publicUrl:path}}),remove:async paths=>{removed=paths;return {}}})},from:()=>({upsert:async()=>({error:Error('Denied')})})};`);
 await assert.rejects(run(`saveCloudProfile({name:'Draft',avatar:'data:image/gif;base64,AAA',collections:[]})`),/Denied/);assert.equal(run('removed.length'),1);assert.equal(run('state.name'),'Saved');
});
test('signed-out cloud saves cannot upload or write',async()=>{const {run}=setup();run('currentAccount=null');await assert.rejects(run('saveCloudProfile({})'),/Sign in to save/)});

test('switching cloud users loads only the selected user profile',async()=>{
 const {run}=setup();run(`var selected;cloud={from:()=>({select:()=>({eq:(field,id)=>{selected=id;return {maybeSingle:async()=>({data:{profile:{name:id,collections:[]}}})}}})})};`);
 await run(`loadCloudAccount({id:'bob'})`);assert.equal(run('selected'),'bob');assert.equal(run('state.name'),'bob');assert.equal(run('currentAccount.id'),'bob');
 await run('loadCloudAccount(null)');assert.equal(run('currentAccount'),null);assert.equal(run('state.name'),'Your name');
});
test('failure to load another account does not keep the previous account editable',async()=>{
 const {run}=setup();run(`cloud={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({error:{message:'Offline'}})})})})};`);
 await assert.rejects(run(`loadCloudAccount({id:'bob'})`),/Offline/);assert.equal(run('currentAccount'),null);
});
