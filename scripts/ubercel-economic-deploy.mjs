#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runUbercelOperator } from './ubercel-deploy.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=2000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERCEL_ECONOMIC_DEPLOYMENT_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
const run=(file,args)=>spawnSync(file,args,{encoding:'utf8',maxBuffer:16*1024*1024});
const service=(unit)=>run('systemctl',['is-active',unit]);
const showResult=(unit)=>run('systemctl',['show','-p','Result','--value',unit]);

function observeEconomicRuntime({requireEconomicEnv=false}={}){
  const author=run('id',['-u','uberbond-author']);
  const pathState=service('uberbond-founder-outcome-mission.path');
  const timerState=service('uberbond-founder-outcome-mission.timer');
  const serviceResult=showResult('uberbond-founder-outcome-mission.service');
  const doctorPath='/var/lib/uberbond-control/bootstrap-doctor.json';
  let doctor=null;
  try{doctor=JSON.parse(fs.readFileSync(doctorPath,'utf8'));}catch{}
  const economicEnvPresent=fs.existsSync('/etc/uberbond/economic.env');
  const reasons=[];
  if(author.status!==0)reasons.push('uberbond-author-identity-not-observed');
  if(String(pathState.stdout||'').trim()!=='active')reasons.push('economic-path-not-active');
  if(String(timerState.stdout||'').trim()!=='active')reasons.push('economic-timer-not-active');
  if(String(serviceResult.stdout||'').trim()!=='success')reasons.push('economic-service-not-successful');
  if(doctor?.ok!==true||doctor?.stages?.selfCompletionLoopReady!==true)reasons.push('founder-node-doctor-not-ready');
  if(requireEconomicEnv&&!economicEnvPresent)reasons.push('economic-runtime-env-required');
  return {
    ok:reasons.length===0,
    reasonCodes:reasons,
    founderAuthorObserved:author.status===0,
    pathState:String(pathState.stdout||'').trim()||null,
    timerState:String(timerState.stdout||'').trim()||null,
    serviceResult:String(serviceResult.stdout||'').trim()||null,
    founderDoctorReady:doctor?.ok===true&&doctor?.stages?.selfCompletionLoopReady===true,
    economicEnvPresent,
    evidenceRefs:[doctor?.ok===true?`file:${doctorPath}`:null,'systemd:uberbond-founder-outcome-mission.path','systemd:uberbond-founder-outcome-mission.timer','systemd:uberbond-founder-outcome-mission.service'].filter(Boolean)
  };
}

export async function runUbercelEconomicDeployment({
  planPath=arg('--plan'),authorizationPath=arg('--authorization'),sourceCheckout=arg('--source'),controlDir=arg('--control-dir')||'/var/lib/uberbond-control',
  execute=process.argv.includes('--execute'),llamaServer=arg('--llama-server'),modelFile=arg('--model'),modelId=arg('--model-id'),privateHost=arg('--private-host'),
  requireEconomicEnv=process.argv.includes('--require-economic-env')
}={}){
  const source=text(sourceCheckout);
  const base=await runUbercelOperator({planPath,authorizationPath,sourceCheckout:source,controlDir,execute});
  if(!base?.ok)return fail(['base-ubercel-deployment-failed'],{base});
  if(!execute)return {ok:true,status:'UBERCEL_ECONOMIC_DEPLOYMENT_READY_EXECUTION_NOT_REQUESTED',base,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),truthBoundary:'The Ubercel plan is readable and exact source is clean. No deployment or economic bootstrap was executed.'};

  let observed=observeEconomicRuntime({requireEconomicEnv});
  let bootstrapReceipt=null;
  if(!observed.ok){
    const llama=text(llamaServer),model=text(modelFile),modelIdentity=text(modelId,400);
    if(!source||!llama||!model||!modelIdentity)return fail(['economic-founder-bootstrap-artifacts-required'],{base,economicRuntime:observed});
    const bootstrap=path.resolve(source,'ops/sovereign/bootstrap-economic-founder-node.sh');
    const args=[source,path.resolve(llama),path.resolve(model),modelIdentity];
    if(privateHost)args.push(String(privateHost));
    const result=run(bootstrap,args);
    const lines=String(result.stdout||'').trim().split(/\r?\n/).filter(Boolean).reverse();
    for(const line of lines){try{bootstrapReceipt=JSON.parse(line);break;}catch{}}
    if(result.status!==0||bootstrapReceipt?.ok!==true)return fail(['economic-founder-bootstrap-failed'],{base,bootstrapStatus:result.status,bootstrapStdout:String(result.stdout||'').slice(-4000),bootstrapStderr:String(result.stderr||'').slice(-4000)});
    observed=observeEconomicRuntime({requireEconomicEnv});
  }
  if(!observed.ok)return fail(['economic-runtime-acceptance-failed',...observed.reasonCodes],{base,bootstrapReceipt,economicRuntime:observed});

  return {
    ok:true,status:'UBERCEL_ECONOMIC_DEPLOYMENT_OBSERVED',
    baseDeployment:base,
    bootstrapReceipt,
    economicRuntime:observed,
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',
    externalEffectLedger:{...zero(),deployments:Number(base?.externalEffectLedger?.deployments||1),productionMutations:Number(base?.externalEffectLedger?.productionMutations||1)},
    truthBoundary:'Ubercel/UberLit deployment plus founder-node readiness and the resident economic heartbeat were observed on this cell. This does not prove buyer demand, outbound delivery, provider-cleared payment, accepted fulfillment, positive contribution profit, or 24-hour endurance.'
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runUbercelEconomicDeployment().then(result=>{process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result?.ok)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${String(error?.message||error).slice(0,300)}`]),null,2)}\n`);process.exitCode=2;});
