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
  continuousAuthoringPulse:'scripts/sovereign-continuous-authoring-pulse.mjs',
  founderConsole:'ops/sovereign/uberbond-founder-console',
  founderConsoleServer:'scripts/sovereign-founder-console-server.mjs',
  authoringTimer:'ops/sovereign/uberbond-authoring.timer',
  founderIntentWakePath:'ops/sovereign/uberbond-founder-intent-wake.path',
  workerPath:'ops/sovereign/uberbond-local-worker.path',
  workerService:'ops/sovereign/uberbond-local-worker.service',
  verifierPath:'ops/sovereign/uberbond-autonomy-verify.path',
  verifierService:'ops/sovereign/uberbond-autonomy-verify.service',
  promoterPath:'ops/sovereign/uberbond-local-promote.path',
  postPromotionPath:'ops/sovereign/uberbond-authoring-after-promotion.path',
  offlineModelInstaller:'ops/sovereign/install-offline-llama-runtime.sh',
  offlineSignerInstaller:'ops/sovereign/install-offline-signer-node.sh',
  releaseCourierInstaller:'ops/sovereign/install-release-courier.sh',
  evidenceImporter:'ops/sovereign/import-sovereign-evidence.sh'
});
const UNIT_NAMES=Object.freeze({
  authoringTimer:'uberbond-authoring.timer',founderIntentWakePath:'uberbond-founder-intent-wake.path',workerPath:'uberbond-local-worker.path',verifierPath:'uberbond-autonomy-verify.path',
  promoterPath:'uberbond-local-promote.path',postPromotionPath:'uberbond-authoring-after-promotion.path',founderConsole:'uberbond-founder-console.service',
  localModelRuntime:'uberbond-offline-llama-runtime.service',localModelProxy:'uberbond-local-model-proxy.service'
});
const INSTALLED_AUTHORCTL='/opt/uberbond/control/uberbond-authorctl';
function run(command,args=[],cwd){const out=spawnSync(command,args,{cwd,encoding:'utf8',timeout:30_000,windowsHide:true});return{ok:out.status===0,stdout:String(out.stdout||'').trim(),stderr:String(out.stderr||'').trim(),status:out.status};}
async function regular(file){try{const s=await fs.lstat(file);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}}
async function readText(file,max=1_000_000){try{if(!await regular(file))return null;const s=await fs.stat(file);if(s.size>max)return null;return await fs.readFile(file,'utf8');}catch{return null;}}
async function readJson(file){try{const raw=await readText(file,4_000_000);if(raw==null)return null;const v=JSON.parse(raw);return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
async function readEnv(file){const out={};try{const raw=await readText(file,1_000_000);if(raw==null)return out;for(const line of raw.split(/\r?\n/)){const m=/^([A-Z0-9_]+)=(.*)$/.exec(line.trim());if(!m)continue;let v=m[2].trim();if((v.startsWith("'")&&v.endsWith("'"))||(v.startsWith('"')&&v.endsWith('"')))v=v.slice(1,-1);out[m[1]]=v;}return out;}catch{return out;}}
function active(unit){return run('systemctl',['is-active','--quiet',unit]).ok;}
async function observeContinuousMinuteAuthoring(){
  const timer=run('systemctl',['cat',UNIT_NAMES.authoringTimer]);
  if(!timer.ok)return false;
  const timerText=timer.stdout;
  const authorctl=await readText(INSTALLED_AUTHORCTL,1_000_000);
  if(authorctl==null)return false;
  const minuteTimer=timerText.includes('OnUnitInactiveSec=60s')
    && timerText.includes('AccuracySec=1s')
    && timerText.includes('RandomizedDelaySec=0')
    && !/(?:OnUnitActiveSec\s*=\s*15min|15min|1h|hour)/i.test(timerText);
  const sandwichAwareControl=authorctl.includes('scripts/sovereign-continuous-authoring-pulse.mjs')
    && !authorctl.includes('"$NODE" scripts/sovereign-autonomy-pulse.mjs');
  return minuteTimer&&sandwichAwareControl;
}
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
  const continuousMinuteAuthoringObserved=services.authoringTimer?await observeContinuousMinuteAuthoring():false;
  const controlDir=path.resolve(authoringEnv.UBERBOND_CONTROL_DIR||env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');
  const evidenceRoot=path.resolve(authoringEnv.UBERBOND_SOVEREIGN_EVIDENCE_ROOT||env.UBERBOND_SOVEREIGN_EVIDENCE_ROOT||'/var/lib/uberbond-evidence');
  const modelReceipt=await readJson(path.join(controlDir,'local-model-runtime-receipt.json'));
  const signerReceipt=await readJson(path.join(evidenceRoot,'signer-receipt.json'));
  const courierReceipt=await readJson(path.join(evidenceRoot,'courier-receipt.json'));
  const runtimeReceipt=await readJson(path.join(evidenceRoot,'runtime-receipt.json'));
  const founderConsoleReachable=services.founderConsole?await probeFounderConsole({...founderEnv,...modelEnv}):false;
  const out=compileSovereignBootstrapReadiness({
    sourceCommit:head.ok?head.stdout:'',cleanSource:clean.ok&&clean.stdout==='',sourceContracts,authoringConfigPresent,configuredSourceRootMatches,
    installedSourceCommit:installedHead.ok?installedHead.stdout:'',services,continuousMinuteAuthoringObserved,founderConsoleReachable,modelReceipt,signerReceipt,courierReceipt,runtimeReceipt,
    isolatedWorkerEnabled:String(authoringEnv.UBERBOND_ISOLATED_WORKER_ENABLED||'').toLowerCase()==='true',
    founderDialogueEnabled:String(modelEnv.UBERBOND_FOUNDER_DIALOGUE_ENABLED||'').toLowerCase()==='true'
  });
  return{...out,collector:'scripts/sovereign-bootstrap-doctor.mjs',observedAt:new Date().toISOString(),observedPaths:{sourceRoot:root,configuredSourceRoot,controlDir,evidenceRoot,installedAuthorctl:INSTALLED_AUTHORCTL},note:'The authoring host requires an observed installed one-minute Sandwich-aware heartbeat plus immediate founder-intent and post-promotion wakes. Raw founder text stays in the private founder-intents directory and is not copied into public coding tasks. The host never infers signer or courier proof from service liveness. Signed-release and runtime stages require validated receipts admitted through the root-only importer into the root-owned read-only evidence root; receipt observation grants no signer or deployment authority.'};
}
const invoked=Boolean(process.argv[1])&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){collectSovereignBootstrapReadiness().then(out=>{process.stdout.write(`${JSON.stringify(out,null,2)}\n`);if(out?.stages?.selfCompletionLoopReady!==true)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify({ok:false,status:'SOVEREIGN_BOOTSTRAP_DOCTOR_CRASH',reasonCodes:[String(error?.message||error).slice(0,300)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'},null,2)}\n`);process.exitCode=2;});}
