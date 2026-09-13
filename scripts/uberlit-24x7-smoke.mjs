#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diagnoseUberLitRuntime } from '../src/uberlit-runtime-doctor.mjs';
import { readUberLitPointer } from '../src/uberlit-runtime.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const has=flag=>process.argv.includes(`--${flag}`);
const arg=(name,fallback='')=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]??fallback):fallback;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const runtimeRoot=path.resolve(arg('root',process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond'));
const observeSeconds=Math.max(3,Math.min(120,Number(arg('observe-seconds','8'))||8));
const sampleMs=Math.max(500,Math.min(5_000,Number(arg('sample-ms','1000'))||1000));
const restartTest=has('restart-test');
const simulate=has('simulate');
const serviceNames=['uberlit.service','uberlit-tls-edge.service','uberlit-worker.service'];

function sh(...args){return execFileSync(args[0],args.slice(1),{encoding:'utf8'}).trim();}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});fs.renameSync(tmp,file);}
function fail(status,detail={}){process.stdout.write(`${JSON.stringify({ok:false,status,...detail})}\n`);process.exit(1);}

function simulateStateMachine(){
  const SHA='a'.repeat(40), RELEASE=`uberlit_${'b'.repeat(32)}`, now=2_000_000;
  const pointer={sourceCommit:SHA,releaseId:RELEASE};
  const healthy={status:'LIVE_WEALTH_ADVANCING',shouldRestart:false,autopilotEnabled:true,childAlive:true,sourceCommit:SHA,releaseId:RELEASE,heartbeatAt:new Date(now-1_000).toISOString(),wealthReceiptFresh:true,wealthReceiptAgeMs:1_000,externalEffectsDisabled:true,childPid:1234};
  const cases=[
    ['healthy',diagnoseUberLitRuntime({nowMs:now,expectedSourceCommit:SHA,pointer,liveness:healthy,wealthReceiptMtimeMs:now-1_000}),true],
    ['dead-child',diagnoseUberLitRuntime({nowMs:now,expectedSourceCommit:SHA,pointer,liveness:{...healthy,status:'DEAD_CHILD',childAlive:false,shouldRestart:true},wealthReceiptMtimeMs:now-1_000}),false],
    ['stale-heartbeat',diagnoseUberLitRuntime({nowMs:now,expectedSourceCommit:SHA,pointer,liveness:{...healthy,heartbeatAt:new Date(now-60_000).toISOString()},wealthReceiptMtimeMs:now-1_000,maxLivenessAgeMs:30_000}),false],
    ['stale-wealth',diagnoseUberLitRuntime({nowMs:now,expectedSourceCommit:SHA,pointer,liveness:{...healthy,status:'DEGRADED_STALE_WEALTH_RECEIPT',wealthReceiptFresh:false,shouldRestart:true,wealthReceiptAgeMs:400_000},wealthReceiptMtimeMs:now-400_000,maxWealthAgeMs:300_000}),false]
  ];
  for(const [name,result,expected] of cases)if(result.ok!==expected)fail('UBERLIT_24X7_SIMULATION_FAILED',{case:name,result});
  return {ok:true,status:'UBERLIT_24X7_STATE_MACHINE_SMOKE_PASSED',cases:cases.map(([name,result])=>({name,ok:result.ok,status:result.status,reasonCodes:result.reasonCodes})),externalEffectAuthority:'NONE'};
}

function serviceState(){
  const rows=serviceNames.map(name=>({name,enabled:sh('systemctl','is-enabled',name)==='enabled',active:sh('systemctl','is-active',name)==='active'}));
  return {rows,allEnabled:rows.every(r=>r.enabled),allActive:rows.every(r=>r.active)};
}

function sample(expectedSourceCommit){
  const livenessFile=path.join(runtimeRoot,'runtime','worker-liveness.json');
  const wealthFile=path.join(runtimeRoot,'artifacts','universal-wealth-latest.json');
  if(!fs.existsSync(livenessFile))fail('UBERLIT_24X7_LIVENESS_RECEIPT_MISSING',{livenessFile});
  const pointer=readUberLitPointer({rootDir:runtimeRoot});
  const liveness=readJson(livenessFile);
  let wealthMtime=null;try{wealthMtime=fs.statSync(wealthFile).mtimeMs;}catch(error){if(error?.code!=='ENOENT')throw error;}
  const doctor=diagnoseUberLitRuntime({expectedSourceCommit,pointer,liveness,wealthReceiptMtimeMs:wealthMtime});
  return {at:Date.now(),doctor,liveness,wealthMtime};
}

async function waitHealthy(expectedSourceCommit,timeoutMs=45_000){
  const deadline=Date.now()+timeoutMs;let last=null;
  while(Date.now()<deadline){
    try{last=sample(expectedSourceCommit);if(last.doctor.ok&&last.liveness.externalEffectsDisabled===true)return last;}catch{}
    await sleep(1_000);
  }
  fail('UBERLIT_24X7_HEALTH_TIMEOUT',{lastDoctor:last?.doctor??null});
}

if(simulate){process.stdout.write(`${JSON.stringify(simulateStateMachine())}\n`);process.exit(0);}
if(process.platform!=='linux')fail('UBERLIT_24X7_LINUX_REQUIRED',{platform:process.platform});
const expectedSourceCommit=sh('git','-C',repoRoot,'rev-parse','HEAD').toLowerCase();
const dirty=sh('git','-C',repoRoot,'status','--porcelain','--untracked-files=no');
if(dirty)fail('UBERLIT_24X7_SOURCE_DIRTY');
const services=serviceState();
if(!services.allEnabled||!services.allActive)fail('UBERLIT_24X7_SERVICES_NOT_READY',{services});
const initial=await waitHealthy(expectedSourceCommit);
const samples=[initial];
const deadline=Date.now()+observeSeconds*1000;
while(Date.now()<deadline){await sleep(sampleMs);samples.push(sample(expectedSourceCommit));}
const healthy=samples.every(s=>s.doctor.ok&&s.liveness.externalEffectsDisabled===true);
const heartbeats=samples.map(s=>Date.parse(String(s.liveness.heartbeatAt||''))).filter(Number.isFinite);
const wealthTimes=samples.map(s=>s.wealthMtime).filter(Number.isFinite);
const heartbeatAdvanced=heartbeats.length>=2&&heartbeats.at(-1)>heartbeats[0];
const wealthAdvanced=wealthTimes.length>=2&&wealthTimes.at(-1)>wealthTimes[0];
if(!healthy||!heartbeatAdvanced||!wealthAdvanced)fail('UBERLIT_24X7_ADVANCEMENT_FAILED',{healthy,heartbeatAdvanced,wealthAdvanced,sampleCount:samples.length,firstDoctor:samples[0]?.doctor,lastDoctor:samples.at(-1)?.doctor});
let restart=null;
if(restartTest){
  if(process.getuid?.()!==0)fail('UBERLIT_24X7_RESTART_TEST_REQUIRES_ROOT');
  const beforePid=Number(samples.at(-1).liveness.supervisorPid||0);
  sh('systemctl','kill','--kill-who=main','--signal=SIGKILL','uberlit-worker.service');
  const recovered=await waitHealthy(expectedSourceCommit,60_000);
  const afterPid=Number(recovered.liveness.supervisorPid||0);
  if(!beforePid||!afterPid||beforePid===afterPid)fail('UBERLIT_24X7_RESTART_NOT_PROVEN',{beforePid,afterPid,recovered:recovered.doctor});
  restart={ok:true,beforePid,afterPid,status:recovered.doctor.status};
}
const receipt={
  schema:'uberbond.uberlit-24x7-smoke.v1',ok:true,status:'UBERLIT_24X7_SMOKE_PASSED',sourceCommit:expectedSourceCommit,observedSeconds:observeSeconds,sampleCount:samples.length,heartbeatAdvanced,wealthReceiptAdvanced:wealthAdvanced,restartTest:restart,services,externalEffectsDisabled:true,externalEffectAuthority:'NONE',truthBoundary:'PASS_PROVES_LOCAL_SOVEREIGN_RUNTIME_LIVENESS_AND_RECOVERY_OVER_THE_OBSERVED_WINDOW_ONLY; A_TRUE_24_HOUR_ENDURANCE_CLAIM_REQUIRES_24_HOURS_OF_CONTINUOUS_OBSERVED_RECEIPTS'
};
atomicJson(path.join(runtimeRoot,'artifacts','uberlit-24x7-smoke-latest.json'),receipt);
process.stdout.write(`${JSON.stringify(receipt)}\n`);
