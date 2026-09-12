#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { compileNativeWorkerModelPrompt, compileNativeWorkerProposal } from '../src/sovereign-native-local-worker.mjs';
import { SANDWICH_DESCENDANT_CANON_PATH } from '../src/sandwich-descendant-admission.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { compileUberBondCognitiveGraph } from '../src/uberbond-cognitive-graph.mjs';
import { compileConnectomeAutopoiesis } from '../src/connectome-autopoiesis.mjs';
import { verifyContextProjection } from '../src/context-projection.mjs';

const MAX_JSON=8_000_000;
const MAX_CONTEXT_FILE=80_000;
const SOCKET=path.resolve(process.env.UBERBOND_MODEL_PROXY_SOCKET || '/run/uberbond-model/proxy.sock');
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,max=1000)=>String(v??'').trim().slice(0,max);
function fail(reasonCodes,status='SOVEREIGN_NATIVE_LOCAL_WORKER_FAILED',extra={}){return{ok:false,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function run(exe,args,{cwd,timeoutMs=30_000}={}){return new Promise(resolve=>execFile(exe,args,{cwd,timeout:timeoutMs,maxBuffer:2_000_000,windowsHide:true},(error,stdout,stderr)=>resolve({exitCode:typeof error?.code==='number'?error.code:(error?1:0),stdout:String(stdout||''),stderr:String(stderr||'')})));}
async function readJson(file,max=MAX_JSON){try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)return null;const v=JSON.parse(await fs.readFile(file,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
async function atomicJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o640});await fs.rename(tmp,file);}
function safeChild(root,rel){const base=path.resolve(root),target=path.resolve(base,rel);return target!==base&&target.startsWith(`${base}${path.sep}`)?target:null;}
function taskBase(task){
  const direct=text(task?.baseRevision,80).toLowerCase();if(/^[a-f0-9]{40}$/.test(direct))return direct;
  for(const c of Array.isArray(task?.constraints)?task.constraints:[]){const m=/^exact-base-revision:([a-f0-9]{40})$/i.exec(String(c));if(m)return m[1].toLowerCase();}
  const parent=/^main:([a-f0-9]{40})$/i.exec(String(task?.parentTask||''));return parent?parent[1].toLowerCase():null;
}
function taskTarget(task){for(const c of Array.isArray(task?.constraints)?task.constraints:[]){const m=/^finite-completion-target:(.+)$/i.exec(String(c));if(m&&m[1]!=='terminal-truth-regeneration')return m[1].slice(0,500);}return null;}
function sandwichGenesis(task){return task?.taskClass==='SANDWICH_DESCENDANT_GENESIS'&&Array.isArray(task?.constraints)&&task.constraints.includes('sandwich-autocatalytic-descendant-genesis');}
function conceptName(value){return typeof value==='string'?value.trim():(value&&typeof value==='object'?String(value.name||'').trim():'');}
async function sourceFile(root,rel){const file=safeChild(root,rel);if(!file)return{exists:false};try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_CONTEXT_FILE)return{exists:false};return{exists:true,content:await fs.readFile(file,'utf8')};}catch{return{exists:false};}}
async function buildContext(root,task){
  const rows=[];const target=taskTarget(task);
  const coverage=await readJson(path.join(root,'artifacts/sovereign/implementation-coverage-matrix.json'));
  const semantic=await readJson(path.join(root,'artifacts/sovereign/semantic-requirement-tribunal.json'));
  if(target&&coverage){const row=(coverage.rows||[]).find(r=>r?.canonicalId===target);if(row){rows.push({path:'context:coverage-row',content:JSON.stringify(row,null,2)});const paths=[row.targetModule,...(row.currentEvidence?.sourceModules||[]),...(row.currentEvidence?.testModules||[]),...(row.sourceArtifacts||[])].filter(Boolean).slice(0,8);for(const p of paths){const s=await sourceFile(root,p);if(s.exists)rows.push({path:p,content:s.content});}}
  }
  if(semantic?.diagnostics)rows.push({path:'context:semantic-diagnostics',content:JSON.stringify(semantic.diagnostics,null,2)});
  if(sandwichGenesis(task)){
    if(task.localTruthSnapshot)rows.push({path:'context:exact-local-truth',content:JSON.stringify(task.localTruthSnapshot,null,2)});
    const connectome=compileConnectomeAutopoiesis({graph:compileUberBondCognitiveGraph(),evidenceRefs:[`main:${taskBase(task)}`]});
    if(connectome?.ok)rows.push({path:'context:connectome-autopoiesis',content:JSON.stringify(connectome,null,2)});
    const north=await readJson(path.join(root,SANDWICH_DESCENDANT_CANON_PATH));
    if(north){
      const named={
        canonicalDefinition:north.canonicalDefinition||null,
        terminalConcepts:(north.terminalConcepts||[]).map(conceptName).filter(Boolean),
        containedPersonalCivilizationSystems:(north.containedPersonalCivilizationSystems||[]).map(conceptName).filter(Boolean),
        supportingEconomicAndTechnicalDonors:(north.supportingEconomicAndTechnicalDonors||[]).map(conceptName).filter(Boolean)
      };
      rows.push({path:'context:canonical-descendant-reference-names',content:JSON.stringify(named,null,2)});
    }
    for(const p of ['NORTH_STAR.md','docs/SANDWICH_METHOD_CANON.md','docs/TEMPORAL_FOUNDRY_CANON.md','src/temporal-foundry.mjs','docs/TIMELINE_TOPOLOGY_ENGINE_CANON.md','src/timeline-topology-engine.mjs','src/connectome-autopoiesis.mjs','src/uberbond-cognitive-graph.mjs','artifacts/perpetual-frontier-genesis.json','artifacts/uberbond-total-brain.json']){const s=await sourceFile(root,p);if(s.exists)rows.push({path:p,content:s.content});}
  } else if(!target){
    for(const p of ['scripts/terminal-realization.mjs','scripts/semantic-requirement-tribunal.mjs','src/semantic-requirement-tribunal.mjs']){const s=await sourceFile(root,p);if(s.exists)rows.push({path:p,content:s.content});}
  }
  return rows.slice(0,12);
}
function callModel(body){return new Promise((resolve,reject)=>{
  const raw=JSON.stringify(body);const req=http.request({socketPath:SOCKET,path:'/v1/chat/completions',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(raw)}},res=>{let total=0;const chunks=[];res.on('data',chunk=>{total+=chunk.length;if(total>1_500_000){req.destroy(new Error('model-response-too-large'));return;}chunks.push(chunk);});res.on('end',()=>resolve({status:res.statusCode||0,raw:Buffer.concat(chunks).toString('utf8')}));});req.setTimeout(180_000,()=>req.destroy(new Error('local-model-timeout')));req.on('error',reject);req.end(raw);
});}
function modelContent(payload){const c=payload?.choices?.[0]?.message?.content;if(typeof c==='string')return c.trim();if(Array.isArray(c))return c.map(x=>typeof x?.text==='string'?x.text:'').join('').trim();return'';}
function parseProposal(body){let raw=String(body||'').trim();const fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw);if(fenced)raw=fenced[1].trim();return JSON.parse(raw);}

async function main(){
  const taskPath=path.resolve(process.argv[2]||process.env.UBERBOND_TASK_PATH||'');
  const resultPath=path.resolve(process.argv[3]||process.env.UBERBOND_RESULT_PATH||'');
  const root=await fs.realpath(process.env.UBERBOND_SOURCE_ROOT||process.cwd()).catch(()=>null);
  if(!taskPath||!resultPath||!root)return fail(['task-result-and-real-source-required']);
  const task=await readJson(taskPath);if(!task?.taskId||task.consequenceClass!=='LOCAL_PREPARATION')return fail(['valid-local-preparation-task-required']);
  const base=taskBase(task);if(!base)return fail(['exact-task-base-revision-required']);
  const headRead=await run('git',['rev-parse','HEAD'],{cwd:root});const head=text(headRead.stdout,80).toLowerCase();
  const dirty=await run('git',['status','--porcelain'],{cwd:root});
  if(headRead.exitCode!==0||head!==base)return fail(['worker-source-head-must-equal-task-base'], 'SOVEREIGN_NATIVE_LOCAL_WORKER_STALE');
  if(dirty.exitCode!==0||text(dirty.stdout,20_000))return fail(['clean-worker-source-required']);
  const projectionPath=path.resolve(process.env.UBERBOND_WORKER_CONTEXT_PATH||'/var/lib/uberbond-worker/inbox/context-projection.json');
  const projection=await readJson(projectionPath,200_000);
  const projectionVerified=verifyContextProjection(projection,{audience:'isolated-worker',sourceCommit:base});
  if(!projectionVerified.ok)return fail(['verified-worker-context-projection-required',...(projectionVerified.reasonCodes||[])]);
  const context=await buildContext(root,task);
  context.unshift({path:'context:sovereign-context-projection',content:JSON.stringify(projection,null,2)});
  const prompt=compileNativeWorkerModelPrompt({task,baseRevision:base,context});if(!prompt.ok)return prompt;
  const response=await callModel({model:'uberbond-local-sovereign',temperature:0,max_tokens:16000,messages:[{role:'system',content:prompt.system},{role:'user',content:JSON.stringify({task:prompt.task,context:prompt.context})}]});
  if(response.status<200||response.status>=300)return fail([`local-model-proxy-http-${response.status}`]);
  let payload;try{payload=JSON.parse(response.raw);}catch{return fail(['local-model-proxy-json-invalid']);}
  let proposal;try{proposal=parseProposal(modelContent(payload));}catch{return fail(['local-model-proposal-json-invalid']);}
  const sourceSnapshot={};
  if(sandwichGenesis(task)){
    sourceSnapshot[SANDWICH_DESCENDANT_CANON_PATH]=await sourceFile(root,SANDWICH_DESCENDANT_CANON_PATH);
  } else {
    for(const row of Array.isArray(proposal?.changes)?proposal.changes:[]){const rel=text(row?.path,1000).replaceAll('\\','/');if(!rel||rel.startsWith('/')||rel.startsWith('../')||rel.includes('/../'))continue;sourceSnapshot[rel]=await sourceFile(root,rel);}
  }
  const compiled=compileNativeWorkerProposal({task,baseRevision:base,proposal,sourceSnapshot});
  return compiled.ok?{...compiled,modelProxySocket:SOCKET,modelIdentity:payload?.model||null,providerRequestId:payload?.id||null}:compiled;
}

const resultPath=process.argv[3]||process.env.UBERBOND_RESULT_PATH||'';
main().then(async result=>{if(resultPath)await atomicJson(path.resolve(resultPath),result);if(!result?.ok)process.exitCode=2;}).catch(async error=>{const result=fail([`unexpected:${text(error?.message||error,300)}`]);if(resultPath)await atomicJson(path.resolve(resultPath),result).catch(()=>{});process.exitCode=2;});
