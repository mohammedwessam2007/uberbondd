#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { executeUbercelDeployment } from '../src/ubercel-deployment-actuator.mjs';
import { createUberLitLinuxAdapterExecutor } from '../src/ubercel-uberlit-linux-adapter.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const text=(v,m=2000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail=(reasonCodes,extra={})=>({ok:false,status:'UBERCEL_OPERATOR_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero(),...extra});
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
async function readJson(file){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8_000_000)throw new Error('bounded-regular-json-file-required');return JSON.parse(await fs.readFile(file,'utf8'));}
async function cleanSource(root,expected){const git=(await import('node:child_process')).execFileSync;const head=git('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim().toLowerCase();const dirty=git('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim();return head===expected&&!dirty;}
async function claimOnce({controlDir,authorizationId,planDigest,sourceCommit}){const claimDir=path.join(controlDir,'ubercel-authorization-claims');await fs.mkdir(claimDir,{recursive:true,mode:0o700});const id=crypto.createHash('sha256').update(String(authorizationId)).digest('hex');const file=path.join(claimDir,`${id}.json`);try{const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(`${JSON.stringify({authorizationId,planDigest,sourceCommit,claimedAt:new Date().toISOString()})}\n`);}finally{await handle.close();}return{ok:true,claimRef:`file:${file}`};}catch(error){if(error?.code==='EEXIST')return{ok:false};throw error;}}

export async function runUbercelOperator({planPath=arg('--plan'),authorizationPath=arg('--authorization'),sourceCheckout=arg('--source'),controlDir=arg('--control-dir')||'/var/lib/uberbond-control',execute=process.argv.includes('--execute'),now=new Date()}={}){
  const planFile=text(planPath),authFile=text(authorizationPath),source=text(sourceCheckout),control=text(controlDir);
  if(!planFile||!authFile||!source||!control)return fail(['plan-authorization-source-and-control-dir-required']);
  const deploymentPlan=await readJson(path.resolve(planFile));
  const authorization=await readJson(path.resolve(authFile));
  const expected=String(deploymentPlan?.plan?.release?.sourceCommit||'').toLowerCase();
  if(!await cleanSource(path.resolve(source),expected))return fail(['exact-clean-source-checkout-required']);
  if(!execute)return{ok:true,status:'UBERCEL_OPERATOR_READY_EXECUTION_NOT_REQUESTED',sourceCommit:expected,planDigest:deploymentPlan?.planDigest||null,authorizationId:authorization?.authorizationId||null,businessEffectAuthority:'NONE',deploymentAuthority:'NONE',externalEffectLedger:zero(),truthBoundary:'Plan and authorization files are readable and exact source is clean. No deployment was requested or performed.'};
  const primaries=(deploymentPlan?.plan?.adapterBindings||[]).filter(row=>row?.role==='primary');
  if(!primaries.length)return fail(['primary-adapter-binding-required']);
  const adapterExecutors={};
  for(const binding of primaries){
    if(String(binding.adapterType||'').toUpperCase()!=='OWNED_LINUX')return fail(['owned-linux-primary-required-for-this-entrypoint'],{adapterId:binding.adapterId});
    adapterExecutors[binding.adapterId]=createUberLitLinuxAdapterExecutor({adapterId:binding.adapterId,provider:binding.provider,sourceCheckout:path.resolve(source)});
  }
  return executeUbercelDeployment({deploymentPlan,authorization,claimAuthorization:claim=>claimOnce({controlDir:path.resolve(control),...claim}),adapterExecutors,now});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runUbercelOperator().then(result=>{process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result?.ok)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${String(error?.message||error).slice(0,300)}`]),null,2)}\n`);process.exitCode=2;});
