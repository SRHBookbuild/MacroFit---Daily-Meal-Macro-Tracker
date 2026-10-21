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
  // Normalise JSONB key ordering and ignore empty placeholder days created during rendering.
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]));
    }
    return value;
  }
  function fingerprint(journal) {
    if (!valid(journal)) return null;
    const cleaned = structuredClone(journal);
    for (const key of Object.keys(cleaned.days)) {
      const day = cleaned.days[key];
      if (day && Object.values(day).every(x => Array.isArray(x) && x.length === 0)) delete cleaned.days[key];
    }
    return JSON.stringify(canonical(cleaned));
  }
  const baselineKey = () => 'macrofit_cloud_baseline_' + user.id;
  const baseline = () => localStorage.getItem(baselineKey());
  const recordBaseline = journal => {const fp=fingerprint(journal);if(fp)localStorage.setItem(baselineKey(),fp);};
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
        const localFP=fingerprint(payload), remoteFP=r?fingerprint(r.journal):null;
        if(r && localFP===remoteFP) {
          lastCloud=r.updated_at;recordBaseline(payload);status('Already synced');return;
        }
        if(r && r.updated_at!==lastCloud) {
          if(localFP===baseline()) {await download(r);return;}
          ready=false; status('Both devices changed · choose a copy');
          el('cloud-choice').classList.remove('hidden'); return;
        }
      }
      const {error}=await client.from('macrofit_journals').upsert({user_id:user.id,journal:payload,updated_at:stamp()},{onConflict:'user_id'});
      if(error) throw error;
      const r=await remote();lastCloud=r.updated_at;recordBaseline(payload);status('Synced · '+new Date().toLocaleTimeString());
    } catch(e){status('Sync failed · local changes retained');console.error('Cloud sync',e);}
    finally {uploading=false;}
  }
  async function download(r){
    if(!r || !valid(r.journal)) throw new Error('Invalid cloud backup');
    const backup=local();
    if(backup) localStorage.setItem('macrofit_pre_cloud_backup_'+Date.now(),JSON.stringify(backup));
    localStorage.setItem(KEY,JSON.stringify(r.journal));
    lastCloud=r.updated_at;
    recordBaseline(r.journal);
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
      const localFP=fingerprint(localData), remoteFP=fingerprint(r.journal);
      if(localFP===remoteFP) {
        recordBaseline(localData);ready=true;hideChoice();status('Synced');return;
      }
      const prior=baseline();
      if(prior && prior===localFP) {await download(r);return;}
      if(prior && prior===remoteFP) {
        ready=true;hideChoice();await upload();return;
      }
      ready=false;
      status('Desktop and cloud differ · choose a copy (back up first)');
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
