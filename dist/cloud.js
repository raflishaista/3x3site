// Supabase uses only the public API key; database credentials never reach this file.
let cloud=null,cloudReady=false,authBusy=false;
let cloudSaving=false;
async function loadCloudAccount(user) {
  currentAccount=null;
  if (!user) { state=structuredClone(initial); return; }
  const {data,error}=await cloud.from('three_by_three_profiles').select('profile').eq('user_id',user.id).maybeSingle();
  if(error) throw Error('Could not load your profile. '+error.message);
  const profile=data?.profile || {...structuredClone(initial),name:user.user_metadata?.username||'Your name',bio:'',collections:[]};
  if(!data) {
    const result=await cloud.from('three_by_three_profiles').insert({user_id:user.id,profile});
    if(result.error)throw result.error;
  }
  currentAccount={id:user.id,username:profile.name};
  state=profile;
}
initializeAccounts=async function() {
  const response=await fetch('/api/config');
  const config=await response.json();
  if(!response.ok)throw Error(config.error||'Supabase configuration unavailable.');
  cloud=supabase.createClient(config.url,config.key,{auth:{flowType:'pkce'}});
  const {data,error}=await cloud.auth.getSession();
  if(error)throw error;
  await loadCloudAccount(data.session?.user);
  cloudReady=true;
  cloud.auth.onAuthStateChange((event,session)=>{
    if(authBusy||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return;
    if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user.id!==currentAccount?.id)) {
      setTimeout(async()=>{try{await loadCloudAccount(session?.user);dirty=false;render()}catch(e){notify(e.message)}},0);
    }
  });
  document.querySelector('#storage-note').textContent='Profiles saved to Supabase';
};
renderAccountNav=function() {
  let nav=document.querySelector('#account-nav');
  if(!nav){nav=document.createElement('div');nav.id='account-nav';nav.className='account-nav';document.querySelector('header').append(nav)}
  nav.innerHTML=currentAccount?`<span>${esc(currentAccount.username)}</span><button type="button" id="cloud-logout">log out</button>`:'<a href="#/login">log in</a><a href="#/register">register</a>';
  const logout=document.querySelector('#cloud-logout');
  if(logout)logout.onclick=async()=>{
    if(dirty&&!confirm('Discard unsaved changes?'))return;
    logout.disabled=true;authBusy=true;
    try{const {error}=await cloud.auth.signOut();if(error)throw error;currentAccount=null;state=structuredClone(initial);dirty=false;location.hash='/login';render()}
    catch(e){notify(e.message);logout.disabled=false}finally{authBusy=false}
  };
};
renderAccountForm=function(register) {
  draft=null;dirty=false;
  app.innerHTML=`<section class="account-form"><h1>${register?'Register':'Log in'}</h1><form id="cloud-account-form">${register?'<label>Display name<input name="username" autocomplete="nickname" required maxlength="60"></label>':''}<label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="8" required></label><button class="primary" type="submit">${register?'Create account':'Log in'}</button><p id="account-error" role="status" aria-live="polite"></p></form><p><a href="#/${register?'login':'register'}">${register?'Already have an account? Log in':'Register a new account'}</a></p><p class="hint">Your profile and grids are public. Only you can edit them. Existing local mock profiles remain stored in this browser.</p></section>`;
  const form=document.querySelector('#cloud-account-form');
  form.onsubmit=async e=>{
    e.preventDefault();const button=form.querySelector('button'),status=document.querySelector('#account-error');button.disabled=true;authBusy=true;status.textContent='';
    try{
      if(!cloud)throw Error('Supabase is not configured. Check .env and restart the server.');
      const email=form.elements.email.value.trim(),password=form.elements.password.value;
      const result=register?await cloud.auth.signUp({email,password,options:{data:{username:form.elements.username.value.trim()},emailRedirectTo:location.origin+'/'}}):await cloud.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      if(!result.data.session){status.textContent='Check your email for a confirmation link, then log in here.';form.elements.password.value='';return;}
      await loadCloudAccount(result.data.session.user);cloudReady=true;location.hash='/';render();
    }catch(error){status.textContent=error.message}finally{authBusy=false;button.disabled=false}
  };
};
async function saveCloudProfile(next) {
  if(cloudSaving)throw Error('A save is already in progress.');
  cloudSaving=true;
  try{return await writeCloudProfile(next)}finally{cloudSaving=false}
}
async function writeCloudProfile(next) {
  const owner=currentAccount?.id;
  if(!owner)throw Error('Sign in to save');
  const profile=structuredClone(next),uploaded=[];
  async function upload(source) {
    if(!source?.startsWith('data:'))return source;
    const blob=await (await fetch(source)).blob();
    const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[blob.type];
    if(!ext)throw Error('Upload PNG, JPEG, WebP, or GIF images.');
    const path=owner+'/'+crypto.randomUUID()+'.'+ext;
    const {error}=await cloud.storage.from('three-by-three').upload(path,blob,{contentType:blob.type});
    if(error)throw error;
    uploaded.push(path);
    return cloud.storage.from('three-by-three').getPublicUrl(path).data.publicUrl;
  }
  try {
    profile.avatar=await upload(profile.avatar);
    for(const collection of profile.collections)for(const slot of collection.slots){if(slot){slot.source=await upload(slot.source);if(slot.preview)slot.preview=await upload(slot.preview)}}
    if(currentAccount?.id!==owner)throw Error('Account changed. Please sign in again before saving.');
    const {error}=await cloud.from('three_by_three_profiles').upsert({user_id:owner,profile,updated_at:new Date().toISOString()});
    if(error)throw error;
    if(currentAccount?.id===owner){state=profile;currentAccount.username=profile.name;}
  }catch(error){if(uploaded.length)await cloud.storage.from('three-by-three').remove(uploaded);throw error}
}

