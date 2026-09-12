#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from '../src/store.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { seedInitiativeCycle, observeInitiativeDispatch } from '../src/north-star-initiative-dispatch.mjs';
import { runSovereignInitiativeRuntime } from './sovereign-initiative-selection-runtime.mjs';

export const SOVEREIGN_INITIATIVE_HOST_VERSION = 'uberbond.sovereign-initiative-host.v1.1';
const MAX_BYTES = 8_000_000;
const execFileAsync = promisify(execFile);
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes, status='SOVEREIGN_INITIATIVE_HOST_REFUSED', extra={}) { return { ok:false, hostVersion:SOVEREIGN_INITIATIVE_HOST_VERSION, status, reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))], businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra }; }
async function readJson(file) { try { const stat=await fs.lstat(file); if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)return null; const value=JSON.parse(await fs.readFile(file,'utf8')); return value&&typeof value==='object'&&!Array.isArray(value)?value:null; } catch { return null; } }
async function atomicJson(file,value,mode=0o600) { await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700}); if(await fs.lstat(file).then(s=>s.isSymbolicLink()||!s.isFile()).catch(()=>false)) throw new Error('unsafe-existing-initiative-host-file'); const tmp=`${file}.tmp.${process.pid}`; await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`,{mode}); await fs.chmod(tmp,mode); await fs.rename(tmp,file); }
function sourceRoot(env) { return path.resolve(env.UBERBOND_SOURCE_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')); }

export async function pumpInitiativeAgentMesh({ env, root, storeDir, occurrenceKey }) {
  if (String(env.AGENT_MESH_ENABLED||'').toLowerCase() !== 'true') return { ok:true, status:'AGENT_MESH_PUMP_DISABLED', exitCode:null, truthBoundary:'The mission is durably queued, but provider/relay execution remains disabled until the existing Agent Mesh authority/configuration enables it.' };
  const childEnv = { ...process.env, ...env, STORE_BACKEND:'json', DATA_DIR:storeDir, AGENT_MESH_ENABLED:'true', AGENT_MESH_OCCURRENCE_KEY:`${occurrenceKey}/pulse/${Date.now()}`, AGENT_MESH_MISSION:'' };
  const result = await execFileAsync(process.execPath,['scripts/agent-mesh-tick.mjs'],{cwd:root,env:childEnv,timeout:10*60_000,maxBuffer:8_000_000})
    .then(({stdout,stderr})=>({exitCode:0,stdout:String(stdout||''),stderr:String(stderr||'')}))
    .catch(error=>({exitCode:typeof error?.code==='number'?error.code:1,stdout:String(error?.stdout||''),stderr:String(error?.stderr||error?.message||'')}));
  if (![0,3].includes(result.exitCode)) return fail([`agent-mesh-tick-exit:${result.exitCode}`],'SOVEREIGN_INITIATIVE_MESH_PUMP_BLOCKED',{stderr:result.stderr.slice(0,1200)});
  return { ok:true, status:result.exitCode===0?'AGENT_MESH_PUMP_COMPLETED':'AGENT_MESH_PUMP_DEGRADED', exitCode:result.exitCode, stdout:result.stdout.slice(0,4000), stderr:result.stderr.slice(0,1200) };
}

export async function runSovereignInitiativeHost({ env=process.env, now=new Date(), store:providedStore=null, runtimeRunner=runSovereignInitiativeRuntime, meshPumpRunner=pumpInitiativeAgentMesh }={}) {
  const root=sourceRoot(env);
  const controlDir=path.resolve(env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');
  const initiativeDir=path.join(controlDir,'initiative');
  const storeDir=path.resolve(env.UBERBOND_INITIATIVE_DATA_DIR||path.join(controlDir,'agent-mesh-store'));
  const activeCyclePath=path.join(initiativeDir,'active-cycle.json');
  const dispatchPath=path.join(initiativeDir,'dispatch-receipt.json');
  const missionResultPath=path.resolve(env.UBERBOND_INITIATIVE_MISSION_RECEIPT_PATH||path.join(initiativeDir,'mission-result.json'));
  await fs.mkdir(storeDir,{recursive:true,mode:0o700});
  const ownsStore=!providedStore;
  const store=providedStore||new Store(storeDir);
  if (ownsStore) await store.init();
  try {
    const priorCycle=await readJson(activeCyclePath);
    const priorDispatch=await readJson(dispatchPath);
    if (priorCycle?.ok===true && priorCycle?.status==='NORTH_STAR_INITIATIVE_CYCLE_READY' && priorDispatch?.ok===true) {
      const observed=await observeInitiativeDispatch({store,dispatch:priorDispatch,date:now});
      if (!observed.ok) return fail(['prior-initiative-run-observation-required',...(observed.reasonCodes||[])],'SOVEREIGN_INITIATIVE_HOST_RECONCILIATION_BLOCKED',{runId:priorDispatch.runId||null});
      if (observed.status==='NORTH_STAR_INITIATIVE_RUN_PENDING') {
        const pump=await meshPumpRunner({env,root,storeDir,occurrenceKey:priorDispatch.occurrenceKey});
        return { ok:true, hostVersion:SOVEREIGN_INITIATIVE_HOST_VERSION, status:'NORTH_STAR_INITIATIVE_HOST_ACTIVE', initiativeAdmitted:true, sourceCommit:priorDispatch.sourceCommit, portfolioId:priorDispatch.portfolioId, selectedCandidateId:priorDispatch.selectedCandidateId, dispatch:priorDispatch, observation:observed, meshPump:pump, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), truthBoundary:'A previously selected North-Star mission remains durable and active. The host does not select a duplicate mission while the existing occurrence is unfinished.' };
      }
      if (observed.status==='NORTH_STAR_INITIATIVE_RUN_COMPLETED') await atomicJson(missionResultPath,observed.missionReceipt);
    } else if (priorCycle?.ok===true && priorCycle?.status==='NORTH_STAR_INITIATIVE_CYCLE_READY') {
      const repaired=await seedInitiativeCycle({store,cycle:priorCycle,date:now});
      if (!repaired.ok) return fail(['existing-cycle-durable-dispatch-required',...(repaired.reasonCodes||[])],'SOVEREIGN_INITIATIVE_HOST_DISPATCH_BLOCKED');
      await atomicJson(dispatchPath,repaired);
      const pump=await meshPumpRunner({env,root,storeDir,occurrenceKey:repaired.occurrenceKey});
      return { ok:true, hostVersion:SOVEREIGN_INITIATIVE_HOST_VERSION, status:'NORTH_STAR_INITIATIVE_HOST_REPAIRED_DISPATCH', initiativeAdmitted:true, dispatch:repaired, meshPump:pump, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
    }

    const runtime=await runtimeRunner({env:{...env,UBERBOND_INITIATIVE_MISSION_RECEIPT_PATH:missionResultPath},now});
    if (!runtime?.ok || runtime.initiativeAdmitted!==true) return runtime;
    const cycle=await readJson(activeCyclePath);
    if (!cycle?.ok || cycle.status!=='NORTH_STAR_INITIATIVE_CYCLE_READY') return fail(['active-cycle-required-after-selection'],'SOVEREIGN_INITIATIVE_HOST_DISPATCH_BLOCKED');
    const dispatch=await seedInitiativeCycle({store,cycle,date:now});
    if (!dispatch.ok) return fail(['new-cycle-durable-dispatch-required',...(dispatch.reasonCodes||[])],'SOVEREIGN_INITIATIVE_HOST_DISPATCH_BLOCKED');
    await atomicJson(dispatchPath,dispatch);
    const pump=await meshPumpRunner({env,root,storeDir,occurrenceKey:dispatch.occurrenceKey});
    return { ...runtime, hostVersion:SOVEREIGN_INITIATIVE_HOST_VERSION, status:runtime.executionReceipt?'NORTH_STAR_INITIATIVE_ADVANCED_AND_DISPATCHED':'NORTH_STAR_INITIATIVE_SELECTED_AND_DISPATCHED', dispatch, meshPump:pump, paths:{...(runtime.paths||{}),dispatchPath,storeDir}, truthBoundary:'The resident host binds verified context to a bounded Goal Contract, durably seeds the selected occurrence into the existing Agent Mesh ledger, reconciles completed evidence on later wakes, and refuses to select a duplicate while that occurrence remains active. Provider calls and consequence authority remain governed by the existing Agent Mesh gates.' };
  } finally {
    if (ownsStore && typeof store.close==='function') await store.close().catch(()=>{});
  }
}

if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) runSovereignInitiativeHost().then(result=>{process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result?.ok)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${String(error?.message||error).slice(0,300)}`]),null,2)}\n`);process.exitCode=2;});
