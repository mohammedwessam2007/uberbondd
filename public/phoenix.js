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
  render();status('Recorded in this tab. Export before leaving or reloading. Nothing was uploaded.');
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
render();
