#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFounderEconomicMissionPulse } from './founder-economic-mission-pulse.mjs';
import { compileSovereignRevenueRuntime, SOVEREIGN_REVENUE_ORGANS } from '../src/sovereign-revenue-runtime.mjs';

const CONTROL_DIR=path.resolve(process.env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');
const MISSION_DIR=path.join(CONTROL_DIR,'founder-missions');
const ACTIVE_PATH=path.join(MISSION_DIR,'active.json');
const AUTHORITY_PATH=path.join(MISSION_DIR,'authority.json');
const RECEIPT_PATH=path.join(MISSION_DIR,'sovereign-revenue-runtime-latest.json');
const EVIDENCE_PATH=path.join(CONTROL_DIR,'sovereign-runtime','organ-evidence.json');
const MAX_BYTES=2_000_000;

async function readJson(file){
  try{const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>MAX_BYTES)return null;const v=JSON.parse(await fs.readFile(file,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}
}
async function atomicJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});await fs.rename(tmp,file);}

function normalizedOrganEvidence(raw){
  const input=raw?.organs&&typeof raw.organs==='object'?raw.organs:{};
  return Object.fromEntries(SOVEREIGN_REVENUE_ORGANS.map(id=>[id,input[id]||{}]));
}

export async function runSovereignRevenueRuntimePulse({now=new Date()}={}){
  const [mission,authority,evidence]=await Promise.all([readJson(ACTIVE_PATH),readJson(AUTHORITY_PATH),readJson(EVIDENCE_PATH)]);
  const economicPulse=await runFounderEconomicMissionPulse({now});
  const organEvidence=normalizedOrganEvidence(evidence);
  const receipt=compileSovereignRevenueRuntime({
    organEvidence,
    founderMissionActive:mission?.ok===true&&mission?.state==='ACTIVE',
    durableQueueReady:economicPulse?.jobsQueued?.length>0||economicPulse?.status==='NO_ACTIVE_FOUNDER_OUTCOME_MISSION'?Boolean(evidence?.durableQueueReady):false,
    paymentReconciliationReady:evidence?.paymentReconciliationReady===true,
    outboundAuthority:authority,
    fulfillmentReady:evidence?.fulfillmentReady===true,
    acceptedDeliveryTruthReady:evidence?.acceptedDeliveryTruthReady===true
  });
  const out={...receipt,observedAt:now.toISOString(),economicPulse:{status:economicPulse?.status||null,jobsQueued:Array.isArray(economicPulse?.jobsQueued)?economicPulse.jobsQueued.map(x=>({type:x.type,consequenceClass:x.consequenceClass})):[],jobFailures:economicPulse?.jobFailures||[]}};
  await atomicJson(RECEIPT_PATH,out);
  return out;
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname;
if(invoked){runSovereignRevenueRuntimePulse().then(r=>{process.stdout.write(`${JSON.stringify(r,null,2)}\n`);if(!r.ready)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify({ready:false,status:'SOVEREIGN_REVENUE_RUNTIME_PULSE_CRASH',reasonCodes:[String(error?.message||error).slice(0,300)]},null,2)}\n`);process.exitCode=2;});}
