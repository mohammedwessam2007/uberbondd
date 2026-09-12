#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { mountSovereignContext } from './sovereign-context-mount.mjs';
import { compileContextProjection } from '../src/context-projection.mjs';
import { compileNorthStarInitiativeCycle, compileInitiativeExecutionReceipt } from '../src/north-star-initiative-runtime.mjs';

export const SOVEREIGN_INITIATIVE_RUNTIME_VERSION='uberbond.sovereign-initiative-runtime.v1';
const execFileAsync=promisify(execFile);
const MAX_BYTES=4_000_000;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='SOVEREIGN_INITIATIVE_RUNTIME_REFUSED',extra={}){return{ok:false,runtimeVersion:SOVEREIGN_INITIATIVE_RUNTIME_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
async function readJson(file){try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)return null;const value=JSON.parse(await fs.readFile(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}
async function atomicJson(file,value,mode=0o600){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});if(await fs.lstat(file).then(s=>s.isSymbolicLink()||!s.isFile()).catch(()=>false))throw new Error('unsafe-existing-runtime-state-file');const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`,{mode});await fs.chmod(tmp,mode);await fs.rename(tmp,file);}
async function exactHead(root){try{const{stdout}=await execFileAsync('git',['rev-parse','HEAD'],{cwd:root,timeout:10_000,maxBuffer:100_000});const head=String(stdout||'').trim().toLowerCase();return/^[a-f0-9]{40}$/.test(head)?head:null;}catch{return null;}}
async function latestFounderIntent(controlDir){const dir=path.join(controlDir,'founder-intents');try{const names=(await fs.readdir(dir)).filter(name=>/^intent-[a-f0-9]{24}\.json$/.test(name));const rows=[];for(const name of names){const value=await readJson(path.join(dir,name));if(value?.intent)rows.push(value);}rows.sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));return rows.at(-1)||null;}catch{return null;}}
function safeRoot(env){return path.resolve(env.UBERBOND_SOURCE_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));}

export async function runSovereignInitiativeRuntime({env=process.env,now=new Date()}={}){
  const root=safeRoot(env);const controlDir=path.resolve(env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');
  const initiativeDir=path.join(controlDir,'initiative');const contextDir=path.resolve(env.UBERBOND_CONTEXT_DIR||path.join(controlDir,'context'));
  const journalPath=path.resolve(env.UBERBOND_CONTEXT_JOURNAL_PATH||path.join(contextDir,'events.jsonl'));
  const layeredStorePath=env.UBERBOND_CONTEXT_LAYERED_STORE_PATH?path.resolve(env.UBERBOND_CONTEXT_LAYERED_STORE_PATH):null;
  const capsuleCachePath=path.resolve(env.UBERBOND_BRAINSTATE_PATH||path.join(contextDir,'brainstate.json'));
  const mountCachePath=path.resolve(env.UBERBOND_CONTEXT_MOUNT_PATH||path.join(contextDir,'mount.json'));
  const portfolioPath=path.join(initiativeDir,'portfolio.json');const activeCyclePath=path.join(initiativeDir,'active-cycle.json');
  const selectionReceiptPath=path.join(initiativeDir,'selection-receipt.json');const executionReceiptPath=path.join(initiativeDir,'execution-receipt.json');
  const missionReceiptPath=env.UBERBOND_INITIATIVE_MISSION_RECEIPT_PATH?path.resolve(env.UBERBOND_INITIATIVE_MISSION_RECEIPT_PATH):path.join(initiativeDir,'mission-result.json');
  const head=await exactHead(root);if(!head)return fail(['exact-source-commit-required']);
  const mounted=mountSovereignContext({rootDir:root,journalPath,layeredStorePath,capsuleCachePath,mountCachePath,mission:'derive and advance the highest-value bounded North-Star mission from current reality',maxHistoricalEvents:24,generatedAt:now});
  if(!mounted.ok)return fail(['verified-context-mount-required',...(mounted.reasonCodes||[])],'SOVEREIGN_INITIATIVE_CONTEXT_REFUSED');
  const projected=compileContextProjection({mountResult:mounted,audience:'isolated-worker',maxHistory:8});
  if(!projected.ok)return fail(['verified-context-projection-required',...(projected.reasonCodes||[])],'SOVEREIGN_INITIATIVE_CONTEXT_REFUSED');
  const founderIntent=await latestFounderIntent(controlDir);const founderMission=await readJson(path.join(controlDir,'founder-missions','active.json'));
  const priorPortfolio=await readJson(portfolioPath);const priorCycle=await readJson(activeCyclePath);const missionResult=await readJson(missionReceiptPath);
  let completedCandidateIds=priorPortfolio?.completedCandidateIds||[];let executionReceipt=null;
  if(priorCycle?.ok===true&&priorCycle?.status==='NORTH_STAR_INITIATIVE_CYCLE_READY'&&missionResult?.status==='PASS'){
    const admitted=compileInitiativeExecutionReceipt({cycle:priorCycle,missionReceipt:missionResult,observedAt:now});
    if(!admitted.ok)return fail(['mission-receipt-admission-refused',...(admitted.reasonCodes||[])],'SOVEREIGN_INITIATIVE_RECEIPT_REFUSED');
    executionReceipt=admitted.receipt;completedCandidateIds=admitted.receipt.completedCandidateIds;await atomicJson(executionReceiptPath,executionReceipt);
  }
  const cycle=compileNorthStarInitiativeCycle({baseRevision:head,contextProjection:projected.projection,founderIntent:founderIntent?.intent||null,founderMission,priorPortfolio,completedCandidateIds,observedAt:now});
  if(!cycle.ok)return cycle;
  await atomicJson(portfolioPath,cycle.portfolio);await atomicJson(activeCyclePath,cycle);await atomicJson(selectionReceiptPath,cycle.selectionReceipt);
  if(missionResult)await fs.rm(missionReceiptPath,{force:true}).catch(()=>{});
  return{ok:true,runtimeVersion:SOVEREIGN_INITIATIVE_RUNTIME_VERSION,status:executionReceipt?'NORTH_STAR_INITIATIVE_ADVANCED_WITHOUT_NEW_PROMPT':'NORTH_STAR_INITIATIVE_SELECTED',sourceCommit:head,brainstateId:projected.projection.brainstateId,contextProjectionId:projected.projection.projectionId,portfolioId:cycle.portfolio.portfolioId,realityDigest:cycle.portfolio.realityDigest,selectedCandidateId:cycle.portfolio.selectedCandidateId,goalContractId:cycle.goalContract.id,task:cycle.task,selectionReceipt:cycle.selectionReceipt,executionReceipt,paths:{portfolioPath,activeCyclePath,selectionReceiptPath,executionReceiptPath,missionReceiptPath},businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'This runtime selects and advances zero-authority/local-preparation North-Star missions from verified current context. It does not manufacture founder preference, private-life access or consequence authority.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runSovereignInitiativeRuntime().then(result=>{process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${String(error?.message||error).slice(0,300)}`]),null,2)}\n`);process.exitCode=2;});
