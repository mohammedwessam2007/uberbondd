#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileSovereignBootstrapReadiness, REQUIRED_SOURCE_CONTRACTS } from '../src/sovereign-bootstrap-readiness.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT=path.resolve(HERE,'..');
const SOURCE_PATHS=Object.freeze({
  authorctl:'ops/sovereign/uberbond-authorctl',
  autonomyPulse:'scripts/sovereign-autonomy-pulse.mjs',
  continuumPulse:'scripts/sovereign-continuum-pulse.mjs',
  founderConsole:'ops/sovereign/uberbond-founder-console',
  founderConsoleServer:'scripts/sovereign-founder-console-server.mjs',
  authoringTimer:'ops/sovereign/uberbond-authoring.timer',
  workerPath:'ops/sovereign/uberbond-local-worker.path',
  workerService:'ops/sovereign/uberbond-local-worker.service',
  verifierPath:'ops/sovereign/uberbond-autonomy-verify.path',
  verifierService:'ops/sovereign/uberbond-autonomy-verify.service',
  promoterPath:'ops/sovereign/uberbond-local-promote.path',
  postPromotionPath:'ops/sovereign/uberbond-authoring-after-promotion.path',
  offlineModelInstaller:'ops/sovereign/install-offline-llama-runtime.sh',
  offlineSignerInstaller:'ops/sovereign/install-offline-signer-node.sh',
  releaseCourierInstaller:'ops/sovereign/install-release-courier.sh'
});
const UNIT_NAMES=Object.freeze({
  authoringTimer:'uberbond-authoring.timer',workerPath:'uberbond-local-worker.path',verifierPath:'uberbond-autonomy-verify.path',
  promoterPath:'uberbond-local-promote.path',postPromotionPath:'uberbond-authoring-after-promotion.path',founderConsole:'uberbond-founder-console.service',
  localModelRuntime:'uberbond-offline-llama-runtime.service',localModelProxy:'uberbond-local-model-proxy.service'
});
function run(command,args=[],cwd){const out=spawnSync(command,args,{cwd,encoding:'utf8',timeout:30_000,windowsHide:true});return{ok:out.status===0,stdout:String(out.stdout||'').trim(),stderr:String(out.stderr||'').trim(),status:out.status};}
async function regular(file){try{const s=await fs.lstat(file);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}}
async function readJson(file){try{if(!await regular(file))return null;const s=await fs.stat(file);if(s.size>4_000_000)return null;const v=JSON.parse(await fs.readFile(file,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
async function readEnv(file){const out={};try{if(!await regular(file))return out;for(const line of (await fs.readFile(file,'utf8')).split(/\r?\n/)){const m=/^([A-Z0-9_]+)=(.*)$/.exec(line.trim());if(!m)continue;let v=m[2].trim();if((v.startsWith("'")&&v.endsWith("'"))||(v.startsWith('"')&&v.endsWith('"')))v=v.slice(1,-1);out[m[1]]=v;}return out;}catch{return out;}}
function active(unit){return run('systemctl',['is-active','--quiet',unit]).ok;}
async function probeFounderConsole(config){const host=String(config.UBERBOND_FOUNDER_CONSOLE_HOST||'127.0.0.1').trim();const port=Number(config.UBERBOND_FOUNDER_CONSOLE_PORT||8787);if(!Number.isSafeInteger(port)||port<1||port>65535)return false;const token=String(config.UBERBOND_FOUNDER_CONSOLE_TOKEN||'');try{const response=await fetch(`http://${host}:${port}/api/status`,{headers:token?{authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(2500)});if(!response.ok)return false;const body=await response.json();return body?.ok===true;}catch{return false;}}
export async function collectSovereignBootstrapReadiness({env=process.env,repoRoot=env.UBERBOND_SOURCE_ROOT||DEFAULT_ROOT}={}){
  const root=await fs.realpath(repoRoot).catch(()=>path.resolve(repoRoot));
  const head=run('git',['rev-parse','HEAD'],root);const clean=run('git',['status','--porcelain'],root);
  const sourceContracts={};for(const id of REQUIRED_SOURCE_CONTRACTS)sourceContracts[id]=await regular(path.join(root,SOURCE_PATHS[id]||''));
  const authoringEnv=await readEnv('/etc/uberbond/authoring.env');const founderEnv=await readEnv('/etc/uberbond/founder-console.env');const modelEnv=await readEnv('/etc/uberbond/model.env');
  const authoringConfigPresent=await regular('/etc/uberbond/authoring.env');
  const configuredSourceRoot=authoringConfigPresent&&authoringEnv.UBERBOND_SOURCE_ROOT?await fs.realpath(authoringEnv.UBERBOND_SOURCE_ROOT).catch(()=>null):null;
  const configuredSourceRootMatches=Boolean(configuredSourceRoot&&configuredSourceRoot===root);
  const installedHead=configuredSourceRootMatches?run('git',['rev-parse','HEAD'],configuredSourceRoot):{ok:false,stdout:''};
  const services={};for(const [id,unit] of Object.entries(UNIT_NAMES))services[id]=active(unit);
  const controlDir=path.resolve(authoringEnv.UBERBOND_CONTROL_DIR||env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');
  const modelReceipt=await readJson(path.join(controlDir,'local-model-runtime-receipt.json'));
  const runtimeReceipt=await readJson(path.join(controlDir,'runtime-receipt.json'));
  const founderConsoleReachable=services.founderConsole?await probeFounderConsole({...founderEnv,...modelEnv}):false;
  const out=compileSovereignBootstrapReadiness({
    sourceCommit:head.ok?head.stdout:'',cleanSource:clean.ok&&clean.stdout==='',sourceContracts,authoringConfigPresent,configuredSourceRootMatches,
    installedSourceCommit:installedHead.ok?installedHead.stdout:'',services,founderConsoleReachable,modelReceipt,runtimeReceipt,
    isolatedWorkerEnabled:String(authoringEnv.UBERBOND_ISOLATED_WORKER_ENABLED||'').toLowerCase()==='true',
    founderDialogueEnabled:String(modelEnv.UBERBOND_FOUNDER_DIALOGUE_ENABLED||'').toLowerCase()==='true',
    separateSignerObserved:false,releaseCourierObserved:active('uberbond-release-courier.path')
  });
  return{...out,collector:'scripts/sovereign-bootstrap-doctor.mjs',observedAt:new Date().toISOString(),observedPaths:{sourceRoot:root,configuredSourceRoot,controlDir},note:'A separate offline signer is intentionally not inferred from this authoring host. Signed-release and runtime proof require their own receipts.'};
}
const invoked=Boolean(process.argv[1])&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){collectSovereignBootstrapReadiness().then(out=>{process.stdout.write(`${JSON.stringify(out,null,2)}\n`);if(out?.stages?.selfCompletionLoopReady!==true)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify({ok:false,status:'SOVEREIGN_BOOTSTRAP_DOCTOR_CRASH',reasonCodes:[String(error?.message||error).slice(0,300)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'},null,2)}\n`);process.exitCode=2;});}
