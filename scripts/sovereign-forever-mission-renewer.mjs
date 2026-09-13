#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const SOVEREIGN_FOREVER_MISSION_VERSION='uberbond.sovereign-forever-mission.v1';
export const SOVEREIGN_FOREVER_INTENT=`Operate continuously for the next 168 hours as UberBond's sovereign resident autonomy. Maximize real cleared contribution profit while advancing the founder's canonical Personal Civilization goals from current local canon. Founder involvement target: 0 minutes. Zero-spend unless a separate existing consequence gate already carries explicit authority. Keep the one-second Universal Wealth control heartbeat and the resident authoring continuum alive. Discover lawful opportunities, rank them by probability of cleared contribution profit and founder burden, prepare/build/fulfill within existing permissions, reconcile provider-origin payments and accepted delivery, learn and reallocate toward observed winners, repair internally solvable blockers, route around provider failures, preserve privacy, and continue every admissible dependency-satisfied lane until the deadline. Never treat simulation, forecast, pipeline, sent outreach, or internal claims as money; only provider-origin cleared payment plus accepted delivery may promote a money-loop claim. Never infer authority from this mission to contact customers, publish, spend, trade, borrow, contract, open accounts, change DNS or credentials, or deploy production; use existing gates only. Keep UberLit, Ubercel, and UberCloud as the sovereign primary substrate and external providers only as replaceable suppliers. Self-monitor liveness, recover from failure, write receipts, preserve exact blockers, and do not silently stop. When this lease becomes terminal and reconciled, renew the same bounded mission for the next 168 hours unless the founder has explicitly paused or cancelled sovereign autonomy.`;

const MAX_BYTES=1_000_000;
const text=v=>String(v??'').trim();
const digest=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

async function readJson(file){
  try{
    const stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)return null;
    const value=JSON.parse(await fs.readFile(file,'utf8'));
    return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  }catch{return null;}
}

async function atomicJson(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=`${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});
  await fs.chmod(tmp,0o600);
  await fs.rename(tmp,file);
}

async function latestIntent(intentDir){
  try{
    const names=(await fs.readdir(intentDir)).filter(name=>/^intent-[a-f0-9]{24}\.json$/.test(name));
    const rows=[];
    for(const name of names){const value=await readJson(path.join(intentDir,name));if(value?.intent)rows.push(value);}
    rows.sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));
    return rows.at(-1)||null;
  }catch{return null;}
}

export async function renewSovereignForeverMission({
  controlDir=process.env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control',
  now=new Date(),
  randomBytes=n=>crypto.randomBytes(n)
}={}){
  const observedAt=now instanceof Date?now:new Date(now);
  if(!Number.isFinite(observedAt.getTime()))return{ok:false,status:'SOVEREIGN_FOREVER_MISSION_REFUSED',reasonCodes:['valid-now-required']};
  const root=path.resolve(controlDir);
  const intentDir=path.join(root,'founder-intents');
  const missionDir=path.join(root,'founder-missions');
  const activePath=path.join(missionDir,'active.json');
  const markerPath=path.join(missionDir,'forever-lease.json');
  const [active,marker,latest]=await Promise.all([readJson(activePath),readJson(markerPath),latestIntent(intentDir)]);
  if(active?.ok===true&&['ACTIVE','RECONCILIATION_REQUIRED'].includes(active.state)){
    return{ok:true,status:'SOVEREIGN_FOREVER_MISSION_LEASE_ACTIVE',seeded:false,missionId:active.missionId||null,deadlineAt:active.deadlineAt||null,externalEffectAuthority:'NONE'};
  }
  const terminalMissionId=active?.state==='TERMINAL'?text(active.missionId):null;
  if(marker?.pendingIntentId&&latest?.id===marker.pendingIntentId&&(!terminalMissionId||marker.lastTerminalMissionId===terminalMissionId)){
    return{ok:true,status:'SOVEREIGN_FOREVER_MISSION_RENEWAL_PENDING',seeded:false,pendingIntentId:marker.pendingIntentId,externalEffectAuthority:'NONE'};
  }
  const nonce=Buffer.from(randomBytes(16)).toString('hex');
  const id=`intent-${digest(`${observedAt.toISOString()}\0${SOVEREIGN_FOREVER_INTENT}\0${nonce}`).slice(0,24)}`;
  const receipt={
    schemaVersion:'uberbond.founder-intent.v1',
    id,
    createdAt:observedAt.toISOString(),
    state:'QUEUED',
    intent:SOVEREIGN_FOREVER_INTENT,
    consequenceClass:'FOUNDER_CONTEXT_ONLY',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'This boot-native founder intent is context and priority only. Every consequence still requires the normal capability, policy, verification, and effect gates.'
  };
  await atomicJson(path.join(intentDir,`${id}.json`),receipt);
  await atomicJson(markerPath,{
    schemaVersion:SOVEREIGN_FOREVER_MISSION_VERSION,
    missionDigest:digest(SOVEREIGN_FOREVER_INTENT),
    pendingIntentId:id,
    lastTerminalMissionId:terminalMissionId,
    seededAt:observedAt.toISOString(),
    externalEffectAuthority:'NONE'
  });
  return{ok:true,status:'SOVEREIGN_FOREVER_MISSION_SEEDED',seeded:true,intentId:id,missionDigest:digest(SOVEREIGN_FOREVER_INTENT),externalEffectAuthority:'NONE'};
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname;
if(invoked){
  renewSovereignForeverMission().then(result=>{
    process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
    if(result.ok===false)process.exitCode=2;
  }).catch(error=>{
    process.stdout.write(`${JSON.stringify({ok:false,status:'SOVEREIGN_FOREVER_MISSION_RENEWER_CRASH',reasonCodes:[String(error?.message||error).slice(0,300)]},null,2)}\n`);
    process.exitCode=2;
  });
}
