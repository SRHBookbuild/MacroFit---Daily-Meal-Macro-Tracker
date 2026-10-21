/* MacroFit optional Supabase sync. Local journal is always available. */
(() => {
  'use strict';
  const CONFIG = { url: 'https://srkmqaprzqgvwsnzofhi.supabase.co', anonKey: 'sb_publishable_-27XgckckbIlYF5gCEcnJA_XKw1kvNA' }; // Fill from your Supabase Project Settings > API
  const KEY = 'macrofit_journal_v2';
  let client, user, ready = false, uploading = false, timer, lastCloud = '';
  const el = id => document.getElementById(id);
  const status = text => { if(el('cloud-sync-status')) el('cloud-sync-status').textContent=text; };
  const valid = x => x && typeof x==='object' && x.days && typeof x.days==='object' && Array.isArray(x.customFoods);
  const local = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const stamp = () => new Date().toISOString();
  const hideChoice = () => el('cloud-choice').classList.add('hidden');
  function setButtons(signedIn){
    el('cloud-email').classList.toggle('hidden',signedIn);
    el('cloud-signin').classList.toggle('hidden',signedIn);
    el('cloud-refresh').classList.toggle('hidden',!signedIn);
    el('cloud-signout').classList.toggle('hidden',!signedIn);
  }
  async function remote() {
    const {data,error}=await client.from('macrofit_journals').select('journal,updated_at').eq('user_id',user.id).maybeSingle();
    if(error) throw error;
    return data;
  }
  async function upload(force=false) {
    if(!ready || uploading || !user) return;
    const payload=local();
    if(!valid(payload)) return;
    uploading=true;
    status('Uploading changes…');
    try {
      if(!force) {
        const r=await remote();
        if(r && r.updated_at!==lastCloud) {
          ready=false; status('Cloud changed on another device · choose a copy');
          el('cloud-choice').classList.remove('hidden'); return;
        }
      }
      const {error}=await client.from('macrofit_journals').upsert({user_id:user.id,journal:payload,updated_at:stamp()},{onConflict:'user_id'});
      if(error) throw error;
      const r=await remote();lastCloud=r.updated_at;status('Synced · '+new Date().toLocaleTimeString());
    } catch(e){status('Sync failed · local changes retained');console.error('Cloud sync',e);}
    finally {uploading=false;}
  }
  async function download(r){
    if(!r || !valid(r.journal)) throw new Error('Invalid cloud backup');
    const backup=local();
    if(backup) localStorage.setItem('macrofit_pre_cloud_backup_'+Date.now(),JSON.stringify(backup));
    localStorage.setItem(KEY,JSON.stringify(r.journal));
    lastCloud=r.updated_at;
    ready=true;
    location.reload();
  }
  async function connect() {
    if(!user) {ready=false;setButtons(false);status('Signed out · data stays local');return;}
    setButtons(true);
    status('Signed in · checking cloud journal');
    try {
      const r=await remote();
      if(!r) {ready=true;lastCloud='';status('No cloud journal · ready to upload'); await upload(true); return;}
      lastCloud=r.updated_at;
      const localData=local();
      // Do not overwrite either copy without explicit selection.
      if(JSON.stringify(r.journal)===JSON.stringify(localData)) {ready=true;status('Synced');return;}
      ready=false;
      status('Choose a starting copy to prevent data loss');
      el('cloud-choice').classList.remove('hidden');
    } catch(e){status('Cloud unavailable · data stays local');console.error(e);}
  }
  async function init(){
    if(!window.supabase || !CONFIG.url || !CONFIG.anonKey) {
      status('Not configured · local data stays on this device');
      el('cloud-signin').disabled=true;
      el('cloud-signin').title='Add Supabase project URL and publishable key to cloud-sync.js';
      return;
    }
    client=window.supabase.createClient(CONFIG.url,CONFIG.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    el('cloud-signin').onclick=async()=>{
      const email=el('cloud-email').value.trim();
      if(!email) return status('Enter your email address');
      const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
      status(error?'Sign-in failed: '+error.message:'Check your email for a sign-in link');
    };
    el('cloud-signout').onclick=async()=>{ready=false;await client.auth.signOut();user=null;hideChoice();await connect();};
    el('cloud-refresh').onclick=async()=>{ready=false;await connect();};
    el('cloud-use-remote').onclick=async()=>{try{await download(await remote());}catch(e){status('Download failed · local data preserved');}};
    el('cloud-use-local').onclick=async()=>{
      if(!confirm('Replace the cloud journal with this device’s journal? Save JSON backups from both devices first.'))return;
      ready=true;hideChoice();await upload(true);
    };
    const {data}=await client.auth.getUser();
    user=data.user;await connect();
    client.auth.onAuthStateChange((_event,session)=>{
      if((session?.user?.id||null)!==(user?.id||null)){
        user=session?.user||null;ready=false;setTimeout(()=>connect(),0);
      }
    });
    window.addEventListener('online',()=>{if(ready) upload();});
    window.addEventListener('storage',e=>{if(e.key===KEY&&ready) localChanged();});
  }
  function localChanged(){if(!ready)return;clearTimeout(timer);timer=setTimeout(()=>upload(),1000);}
  window.MacroFitCloud={init,localChanged};
})();
