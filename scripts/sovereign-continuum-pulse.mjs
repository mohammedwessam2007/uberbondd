#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { runSovereignAutonomyPulse } from './sovereign-autonomy-pulse.mjs';
import { buildGenesisEvidenceLedger } from '../src/genesis-implementation-evidence-v2.mjs';
import { compileSovereignContinuumFrontierDirective, compileSovereignContinuumFrontierTask } from '../src/sovereign-continuum-frontier.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_CONTINUUM_PULSE_VERSION='uberbond.sovereign-continuum-pulse.v1';
const SHA40=/^[a-f0-9]{40}$/i;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,max=1000)=>String(v??'').trim().slice(0,max);
function fail(reasonCodes,status='SOVEREIGN_CONTINUUM_PULSE_REFUSED',extra={}){return{ok:false,policyVersion:SOVEREIGN_CONTINUUM_PULSE_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function run(exe,args,{cwd,env={},timeoutMs=120_000}={}){return new Promise(resolve=>execFile(exe,args,{cwd,env,timeout:timeoutMs,maxBuffer:8_000_000,windowsHide:true},(error,stdout,stderr)=>resolve({exitCode:typeof error?.code==='number'?error.code:(error?1:0),stdout:String(stdout||''),stderr:String(stderr||'')})));}
async function readJson(file){try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>4_000_000)return null;const v=JSON.parse(await fs.readFile(file,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
async function atomicJson(file,value,mode=0o600){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`,{mode});await fs.chmod(tmp,mode);await fs.rename(tmp,file);}
function safeWorkerTaskPath(env){const root=path.resolve(env.UBERBOND_WORKER_INBOX_ROOT||'/var/lib/uberbond-worker/inbox');const target=path.resolve(env.UBERBOND_WORKER_TASK_PATH||path.join(root,'task.json'));return target.startsWith(`${root}${path.sep}`)&&target!==root?target:null;}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function localAttemptId(baseRevision,task={}){const core={baseRevision:text(baseRevision,80).toLowerCase(),taskId:text(task.taskId,300),repairMode:task.repairMode||null,targetRequirementId:task.targetRequirementId||null,evidenceRefs:Array.isArray(task.evidenceRefs)?task.evidenceRefs.map(String):[],requiredOutputs:Array.isArray(task.requiredOutputs)?task.requiredOutputs.map(String):[],acceptanceTests:Array.isArray(task.acceptanceTests)?task.acceptanceTests.map(String):[]};return crypto.createHash('sha256').update(JSON.stringify(stable(core))).digest('hex');}
function waitingReceipt({baseRevision,task,attemptId}){return{schemaVersion:'uberbond.sovereign-local-continuation-receipt.v1',observedBaseRevision:text(baseRevision,80).toLowerCase(),observedTaskId:text(task?.taskId,300),observedAttemptId:attemptId,observedEvidenceRefs:Array.isArray(task?.evidenceRefs)?task.evidenceRefs.map(String):[],continuation:{ok:true,status:'WAIT_FOR_EXISTING_ATTEMPT',decision:'DO_NOT_CREATE_DUPLICATE_TASK',taskId:text(task?.taskId,300),businessEffectAuthority:'NONE'},businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'THIS RECEIPT RESERVES ONE DIGEST-BOUND POST-FINITE CONTINUUM ATTEMPT ON ONE EXACT BASE. CLOCK OR MANUAL REENTRY MAY RESUME IT BUT MAY NOT CREATE A SECOND SAME-BASE DISPATCH.'};}
async function exactGenesisLedger({root,head,env,runProcess}){
  const canonical=await fs.readFile(path.join(root,'docs/PERPETUAL_FRONTIER_GENESIS_CANON.md'),'utf8').catch(()=>null);if(!canonical)return fail(['perpetual-frontier-canon-required'],'SOVEREIGN_CONTINUUM_FRONTIER_EVIDENCE_REFUSED');
  const listed=await runProcess('git',['ls-tree','-r','--name-only',head],{cwd:root,env:{PATH:env.PATH||''},timeoutMs:60_000});
  if(listed.exitCode!==0)return fail(['exact-source-tree-enumeration-required'],'SOVEREIGN_CONTINUUM_FRONTIER_EVIDENCE_REFUSED');
  const availablePaths=listed.stdout.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  const ledger=buildGenesisEvidenceLedger({canonicalMarkdown:canonical,availablePaths,observedRuntimeReceipts:[]});
  return ledger?.ok?ledger:fail(ledger?.reasonCodes||['exact-current-genesis-ledger-required'],'SOVEREIGN_CONTINUUM_FRONTIER_EVIDENCE_REFUSED');
}

export async function runSovereignContinuumPulse({env=process.env,repoRoot=process.cwd(),runProcess=run}={}){
  const finite=await runSovereignAutonomyPulse({env,repoRoot,runProcess});
  if(!finite?.ok||finite.status!=='FINITE_ENGINEERING_ALREADY_CLOSED')return finite;
  const root=await fs.realpath(repoRoot).catch(()=>null);if(!root)return fail(['real-source-repository-required']);
  const head=text(finite.baseRevision,80).toLowerCase();if(!SHA40.test(head))return fail(['finite-closure-exact-base-required']);
  const headRead=await runProcess('git',['rev-parse','HEAD'],{cwd:root,env:{PATH:env.PATH||''},timeoutMs:30_000});
  const dirty=await runProcess('git',['status','--porcelain'],{cwd:root,env:{PATH:env.PATH||''},timeoutMs:30_000});
  if(headRead.exitCode!==0||text(headRead.stdout,80).toLowerCase()!==head||dirty.exitCode!==0||text(dirty.stdout,20_000))return fail(['frontier-source-must-remain-clean-at-finite-closed-base'],'SOVEREIGN_CONTINUUM_FRONTIER_STALE');
  const controlDir=path.resolve(env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');const autonomyDir=path.join(controlDir,'autonomy');const statusPath=path.join(autonomyDir,'status.json');const taskPath=path.join(autonomyDir,'next-task.json');const continuationPath=path.join(autonomyDir,'continuation-receipt.json');const cursorPath=path.join(autonomyDir,'continuum-frontier-cursor.json');
  const ledger=await exactGenesisLedger({root,head,env,runProcess});if(!ledger?.ok)return ledger;
  const cursor=await readJson(cursorPath);
  const directive=compileSovereignContinuumFrontierDirective({baseRevision:head,finiteDirective:finite,genesisLedger:ledger,afterTargetId:cursor?.targetId});if(!directive?.ok)return directive;
  if(!directive.taskRequired){const state={...directive,finiteEngineeringStatus:finite.status,observedAt:new Date().toISOString()};await atomicJson(statusPath,state);return state;}
  const task=compileSovereignContinuumFrontierTask({directive});if(!task?.taskId)return fail(task?.reasonCodes||['continuum-frontier-task-compilation-failed']);
  await atomicJson(taskPath,task);
  const workerEnabled=String(env.UBERBOND_ISOLATED_WORKER_ENABLED||'').toLowerCase()==='true';
  if(!workerEnabled){const state={ok:true,policyVersion:SOVEREIGN_CONTINUUM_PULSE_VERSION,status:'CONTINUUM_FRONTIER_TASK_READY_NO_LOCAL_WORKER',baseRevision:head,taskRequired:true,taskId:task.taskId,targetId:directive.targetId,targetName:directive.targetName,frontierCandidateCount:directive.frontierCandidateCount,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'Finite engineering is closed and one bounded Continuum frontier task is prepared, but no isolated worker is enabled. No model execution or external effect occurred.'};await atomicJson(statusPath,{...state,observedAt:new Date().toISOString()});return state;}
  const workerTaskPath=safeWorkerTaskPath(env);if(!workerTaskPath)return fail(['safe-isolated-worker-task-path-required'],'SOVEREIGN_CONTINUUM_FRONTIER_HANDOFF_REFUSED',{baseRevision:head,taskId:task.taskId});
  const attemptId=localAttemptId(head,task);
  await atomicJson(continuationPath,waitingReceipt({baseRevision:head,task,attemptId}));
  await atomicJson(workerTaskPath,task,0o640);
  await atomicJson(cursorPath,{schemaVersion:'uberbond.sovereign-continuum-frontier-cursor.v1',baseRevision:head,targetId:directive.targetId,targetName:directive.targetName,taskId:task.taskId,attemptId,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'Cursor records only which bounded frontier was dispatched most recently. It grants no authority and is not evidence that the frontier improved.'});
  const state={ok:true,policyVersion:SOVEREIGN_CONTINUUM_PULSE_VERSION,status:'CONTINUUM_FRONTIER_TASK_DISPATCHED_TO_ISOLATED_WORKER',baseRevision:head,finiteEngineeringStatus:finite.status,taskRequired:true,newWorkerDispatch:true,taskId:task.taskId,attemptId,targetId:directive.targetId,targetName:directive.targetName,frontierCandidateCount:directive.frontierCandidateCount,taskPath,workerTaskPath,continuationPath,cursorPath,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'Exact-base finite engineering closure opened one bounded post-finite Continuum frontier attempt. Selection and model execution remain OS-separated; this dispatch is not a verified change, promotion, signature, release, runtime result, customer result, life outcome, or authority expansion.'};
  await atomicJson(statusPath,{...state,observedAt:new Date().toISOString()});return state;
}

const invokedAsCli=Boolean(process.argv[1])&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invokedAsCli)runSovereignContinuumPulse().then(result=>{process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result?.ok)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(error?.message,300)}`]),null,2)}\n`);process.exitCode=2;});
