process.loadEnvFile();
(async()=>{try {
 const headers={apikey:process.env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
 const base=process.env.SUPABASE_URL;
 const read=await fetch(base+'/rest/v1/three_by_three_profiles?select=user_id&limit=0',{headers});
 const insert=await fetch(base+'/rest/v1/three_by_three_profiles',{method:'POST',headers,body:JSON.stringify({user_id:'00000000-0000-4000-8000-000000000000',profile:{name:'Unauthorized test'}})});
 const body=await insert.json();
 console.log(JSON.stringify({profileTable:read.status,anonymousWrite:insert.status,denialCode:body.code}));
 if(read.status!==200||body.code!=='42501')process.exitCode=1;
}catch(e){console.error('API verification failed: '+(e.cause?.code||'NETWORK_ERROR'));process.exitCode=1;}})();
