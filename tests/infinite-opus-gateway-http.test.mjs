import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot=join(dirname(fileURLToPath(import.meta.url)),'..');
const ADMIN_TOKEN='admin-gateway-test-000000000000000000000';
const GATEWAY_TOKEN='gateway-test-000000000000000000000000';
let child,dataDir,base;

async function ready(url){
 for(let i=0;i<100;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(500)});if(r.status)return true;}catch{} await new Promise(r=>setTimeout(r,100));}
 return false;
}

test.before(async()=>{
 dataDir=await mkdtemp(join(tmpdir(),'uberbond-ubermind-gateway-'));
 const port=8900+Math.floor(Math.random()*80);base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['server.mjs'],{cwd:repoRoot,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(port),PROCESS_ROLE:'web',STORE_BACKEND:'json',DATA_DIR:dataDir,APP_BASE_URL:base,ADMIN_TOKEN,INFINITE_OPUS_GATEWAY_TOKEN:GATEWAY_TOKEN,NODE_ENV:'test'}});
 assert.equal(await ready(base+'/api/health'),true);
});
test.after(async()=>{child?.kill('SIGTERM');await new Promise(r=>setTimeout(r,200));child?.kill('SIGKILL');if(dataDir)await rm(dataDir,{recursive:true,force:true});});

test('gateway is independently token scoped and refuses anonymous/wrong callers',async()=>{
 for(const authorization of [null,'Bearer wrong']){
  const r=await fetch(base+'/api/ubermind/v1/status',{headers:authorization?{authorization}:{}});
  assert.equal(r.status,401);
 }
 const r=await fetch(base+'/api/ubermind/v1/status',{headers:{authorization:'Bearer '+GATEWAY_TOKEN}});
 assert.equal(r.status,200);const b=await r.json();assert.equal(b.status,'UBERMIND_GATEWAY_SOURCE_READY');assert.equal(b.runtime.paidConnected,false);
});

test('TypingMind origin gets narrow CORS while foreign origin is refused',async()=>{
 const ok=await fetch(base+'/api/ubermind/v1/status',{headers:{authorization:'Bearer '+GATEWAY_TOKEN,origin:'https://www.typingmind.com'}});
 assert.equal(ok.status,200);assert.equal(ok.headers.get('access-control-allow-origin'),'https://www.typingmind.com');
 const bad=await fetch(base+'/api/ubermind/v1/status',{headers:{authorization:'Bearer '+GATEWAY_TOKEN,origin:'https://evil.example'}});
 assert.equal(bad.status,403);assert.equal(bad.headers.get('access-control-allow-origin'),null);
});

test('gateway E4 plan is zero-inference and rejects external effects',async()=>{
 const task={schemaVersion:'uberbond.ubermind.cockpit-task.v1',taskId:'gateway-e4',taskClass:'RECURRING_POLICY',qualityClass:'Q_CERTIFIED_BOUNDED',sideEffectClass:'NONE',stakes:'LOW',equivalenceClass:'E4',proofVerified:true,dependenciesCurrent:true,compositionVerified:true};
 const r=await fetch(base+'/api/ubermind/v1/plan',{method:'POST',headers:{authorization:'Bearer '+GATEWAY_TOKEN,'content-type':'application/json',origin:'https://www.typingmind.com'},body:JSON.stringify(task)});
 assert.equal(r.status,200);const b=await r.json();assert.equal(b.lane,'E0_E4_BY_CONSTRUCTION');assert.equal(b.modelCallsPlanned,0);assert.equal(b.qualityRetestRequired,false);
 const bad={...task,taskId:'effect',sideEffectClass:'SEND_EMAIL'};
 const rr=await fetch(base+'/api/ubermind/v1/plan',{method:'POST',headers:{authorization:'Bearer '+GATEWAY_TOKEN,'content-type':'application/json'},body:JSON.stringify(bad)});
 assert.equal(rr.status,409);
});
