const SCHEMA='uberbond.phoenix-local-draft.v1';
const CORPUS='23bb3c1813e3b5997d8ec76c801db2d5c59baf780573fb496da867d90d7017f0';
const MAX=120;
const ids={kind:document.getElementById('kind'),summary:document.getElementById('summary'),
source:document.getElementById('source'),main:document.getElementById('main'),
count:document.getElementById('count'),entries:document.getElementById('entries'),
status:document.getElementById('status'),digest:document.getElementById('digest')};
let entries=[];
let lastExport=null;
const dangerous=/(sk-proj|sk-live|ghp_|github_pat_|xoxb-|Bearer\s+\S{12,}|password\s*[:=]\s*\S+|api[_-]?key\s*[:=]\s*\S+|-----BEGIN PRIVATE KEY)/i;
function status(message){ids.status.textContent=message;}
function render(){
 ids.entries.replaceChildren();
 for(const e of entries){
  const li=document.createElement('li');
  li.textContent=e.kind+': '+e.summary+' | source: '+e.source;
  ids.entries.append(li);
 }
 ids.count.textContent=String(entries.length);
 ids.digest.textContent=lastExport?'Last exported digest: '+lastExport.digest:'No export yet.';
}
function validateEntry(e){
 if(!e || typeof e!=='object' || !['DECISION','IMPLEMENTATION','GOAL','TEST','EXTERNAL_EVIDENCE','BLOCKER','FAILED_ATTEMPT','CONTRADICTION','DONOR','UNKNOWN','NEXT_ACTION'].includes(e.kind))throw Error('Invalid event type.');
 if(typeof e.summary!=='string'||!e.summary.trim()||e.summary.length>1500||dangerous.test(e.summary))throw Error('Missing, unsafe, or overlong note.');
 if(typeof e.source!=='string'||!e.source.trim()||e.source.length>600||dangerous.test(e.source))throw Error('Missing or unsafe source reference. Use CHAT_ONLY when source is not saved.');
 if(typeof e.id!=='string'||!/^checkpoint-\d{1,4}$/.test(e.id))throw Error('Invalid event identity.');
 return e;
}
function makeBody(){const main=ids.main.value.trim().toLowerCase();
 if(main&&!/^[0-9a-f]{40}$/.test(main))throw Error('Main SHA must contain 40 hex characters, or remain empty.');
 return {schemaVersion:SCHEMA,sourceType:'MANUAL_LOCAL_DRAFT_NOT_FULL_CHAT_EXPORT',
 exportedAt:new Date().toISOString(),mainSha:main||null,
 moonshotCorpusSha:CORPUS,
 entries:entries.map(e=>({...e})),
 truthBoundary:'MANUALLY_ENTERED_MATERIAL_ONLY; SOURCE_NOT_REVALIDATED; ZERO_EXTERNAL_EFFECT_AUTHORITY'};
}
async function digestOf(body){
 const bytes=new TextEncoder().encode(JSON.stringify(body));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
document.getElementById('add').addEventListener('click',()=>{
 try{
  if(entries.length>=MAX)throw Error('120 entries reached. Export now, then start a linked checkpoint.');
  const e=validateEntry({id:'checkpoint-'+(entries.length+1),kind:ids.kind.value,summary:ids.summary.value.trim(),source:ids.source.value.trim(),recordedAt:new Date().toISOString()});
  entries.push(e);lastExport=null;ids.summary.value='';ids.source.value='';
  render();status('Recorded in this tab. Save to UberBond or export before leaving.');
  if(document.getElementById('auto-app-save').checked) void saveToUberBond();
 }catch(error){status(error.message);}
});
document.getElementById('clear').addEventListener('click',()=>{
 if(!confirm('Clear unsaved in-tab checkpoints? Already downloaded files are not affected.'))return;
 entries=[];lastExport=null;render();status('Draft cleared. No server data was changed.');
});
document.getElementById('export').addEventListener('click',async()=>{
 try{
  if(!entries.length)throw Error('Record at least one checkpoint.');
  const body=makeBody();const file={body,digest:await digestOf(body)};
  const blob=new Blob([JSON.stringify(file,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='uberbond-phoenix-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10_000);
  lastExport=file;render();status('Export requested. Check the iPad Files/Downloads area before closing this tab.');
 }catch(error){status(error.message);}
});
document.getElementById('copy').addEventListener('click',async()=>{
 try{
  if(!entries.length)throw Error('Add a checkpoint before copying.');
  const known=lastExport?'The capsule file digest is '+lastExport.digest+'.':'No exported capsule has been verified yet.';
  const msg='Recover UberBond without restarting. Refresh exact GitHub main mohammedwessam2007/uberbondd, AI_START_HERE.md, AGENTS.md, and the canonical 890-idea corpus. I am carrying a PHOENIX local checkpoint draft with '+entries.length+' material entries. '+known+' I will attach the JSON file. Verify its integrity and account for every checkpoint ID. Identify any facts not backed by source evidence and reconcile changed main/PR/runtime. Do not claim full original chat recovery or replay uncertain external effects. Continue from the newest verified frontier.';
  await navigator.clipboard.writeText(msg);
  status('Rescue message copied. Attach the exported file in a fresh ChatGPT Project chat.');
 }catch(error){status(error.message);}
});
document.getElementById('import').addEventListener('change',async event=>{
 try{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>360_000)throw Error('File too large for the bounded draft loader.');
  const data=JSON.parse(await file.text());
  if(!data?.body || typeof data.digest!=='string')throw Error('Invalid draft envelope.');
  if(data.body.schemaVersion!==SCHEMA || data.body.moonshotCorpusSha!==CORPUS)throw Error('Wrong schema or founder-890 corpus identity.');
  if(await digestOf(data.body)!==data.digest)throw Error('File has changed since export. Integrity check failed.');
  if(!Array.isArray(data.body.entries)||data.body.entries.length>MAX)throw Error('Invalid entry count.');
  data.body.entries.forEach((e,i)=>{validateEntry(e);if(e.id!=='checkpoint-'+(i+1))throw Error('Missing, duplicated or shifted checkpoint ID.');});
  const sha=data.body.mainSha;
  if(sha!==null&&(typeof sha!=='string'||!/^[0-9a-f]{40}$/.test(sha)))throw Error('Invalid main SHA.');
  entries=data.body.entries.map(e=>({...e}));ids.main.value=sha||'';
  lastExport=data;render();status('Integrity matched. Source truth and original-chat completeness remain unverified.');
 }catch(error){status(error.message);}finally{event.target.value='';}
});

const vaultStatus=document.getElementById('vault-status');
function vaultMessage(v){vaultStatus.textContent=v;}
async function vaultApi(path,options={}){
 const response=await fetch(path,{
  ...options,credentials:'same-origin',cache:'no-store',
  headers:{...(options.headers||{}),'x-uberbond-owner-csrf':'1'}
 });
 const json=await response.json().catch(()=>({status:'INVALID_RESPONSE'}));
 if(!response.ok)throw Error(json.status||json.reason||('HTTP_'+response.status));
 return json;
}
async function saveToUberBond(){
 try{
  if(!entries.length)throw Error('Record a checkpoint first.');
  const body=makeBody(),capsule={body,digest:await digestOf(body)};
  const result=await vaultApi('/api/phoenix/capsules',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(capsule)
  });
  lastExport=capsule;render();
  vaultMessage(result.status+' · '+result.entryCount+' checkpoint(s) · '+result.digest.slice(0,12)+'…');
  return true;
 }catch(error){
  vaultMessage('App-backed save NOT confirmed: '+error.message+'. Use Export PHOENIX file as fallback.');
  return false;
 }
}
async function loadVaultList(){
 const host=document.getElementById('vault-list');host.replaceChildren();
 try{
  const result=await vaultApi('/api/phoenix/capsules');
  vaultMessage('UberBond returned '+result.capsules.length+' latest saved version(s). App-owned storage only; no ChatGPT transcript sync.');
  for(const item of result.capsules){
   const li=document.createElement('li');
   const button=document.createElement('button');
   button.type='button';button.textContent='Restore '+item.entryCount+' entries · '+item.createdAt.slice(0,16);
   button.addEventListener('click',()=>{void restoreFromVault(item.id);});
   li.append(button);host.append(li);
  }
  if(!result.capsules.length)host.textContent='No saved capsules found.';
 }catch(error){vaultMessage('Could not read protected vault: '+error.message+'. Log in to the UberBond Command Center first.');}
}
async function restoreFromVault(id){
 try{
  const result=await vaultApi('/api/phoenix/capsules/'+encodeURIComponent(id));
  const data=result.capsule;
  if(!data?.body||data.body.moonshotCorpusSha!==CORPUS || data.body.schemaVersion!==SCHEMA)throw Error('Wrong capsule schema/ancestry');
  if(await digestOf(data.body)!==data.digest)throw Error('Stored capsule integrity mismatch');
  if(!Array.isArray(data.body.entries)||data.body.entries.length>MAX)throw Error('Invalid restored event count');
  data.body.entries.forEach((e,i)=>{validateEntry(e);if(e.id!=='checkpoint-'+(i+1))throw Error('Missing checkpoint ordinal');});
  if(data.body.mainSha!==null&&!/^[0-9a-f]{40}$/.test(data.body.mainSha))throw Error('Bad main SHA');
  entries=data.body.entries.map(e=>({...e}));
  ids.main.value=data.body.mainSha||'';lastExport=data;render();
  vaultMessage('Restored '+entries.length+' exact saved entries from UberBond. Source evidence still needs fresh verification.');
  window.scrollTo({top:0,behavior:'smooth'});
 }catch(error){vaultMessage('Restore NOT verified: '+error.message);}
}
async function runPhoenixVaultSelfTest(){
 const button=document.getElementById('vault-self-test');
 button.disabled=true;
 try{
  const stamp='2026-10-08T00:00:00.000Z';
  const body={
    schemaVersion:SCHEMA,sourceType:'MANUAL_LOCAL_DRAFT_NOT_FULL_CHAT_EXPORT',
    exportedAt:stamp,mainSha:null,moonshotCorpusSha:CORPUS,
    entries:[{id:'checkpoint-1',kind:'TEST',summary:'PHOENIX synthetic owner-session vault canary; no customer data.',source:'APP_SELF_TEST_ONLY',recordedAt:stamp}],
    truthBoundary:'MANUALLY_ENTERED_MATERIAL_ONLY; SOURCE_NOT_REVALIDATED; ZERO_EXTERNAL_EFFECT_AUTHORITY'
  };
  const capsule={body,digest:await digestOf(body)};
  const saved=await vaultApi('/api/phoenix/capsules',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(capsule)
  });
  if(!saved.ok || saved.digest!==capsule.digest || !/^phx_[0-9a-f]{64}$/.test(saved.id))throw Error('Save receipt mismatch');
  const retrieved=await vaultApi('/api/phoenix/capsules/'+encodeURIComponent(saved.id));
  if(!retrieved.ok || retrieved.capsule?.digest!==capsule.digest
     || await digestOf(retrieved.capsule.body)!==capsule.digest
     || retrieved.capsule.body.entries[0].summary!==body.entries[0].summary)throw Error('Restore receipt mismatch');
  vaultMessage('PHOENIX_APP_ROUNDTRIP_VERIFIED · owner-authenticated save and restore of one harmless synthetic checkpoint. No client data was used.');
 }catch(error){
  vaultMessage('PHOENIX_APP_ROUNDTRIP_NOT_VERIFIED · '+error.message+'. Log in to the UberBond Command Center and retry; do not assume saved.');
 }finally{button.disabled=false;}
}
document.getElementById('vault-self-test').addEventListener('click',()=>{void runPhoenixVaultSelfTest();});
document.getElementById('save-app').addEventListener('click',()=>{void saveToUberBond();});
document.getElementById('refresh-app').addEventListener('click',()=>{void loadVaultList();});

render();
