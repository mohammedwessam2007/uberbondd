import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const fail=(status,detail={})=>{console.error(JSON.stringify({ok:false,status,...detail,secretsReturned:false},null,2));process.exit(2);};
const auth=arg('--authorization'),out=arg('--canary-output');
if(!process.argv.includes('--execute'))fail('EXECUTE_FLAG_REQUIRED');
if(!auth||!out)fail('PRIVATE_AUTHORIZATION_AND_CANARY_OUTPUT_REQUIRED');
if(!process.env.OPENROUTER_API_KEY)fail('OPENROUTER_API_KEY_REQUIRED_IN_PRIVATE_ENV');
if(!process.env.OPENROUTER_MANAGEMENT_KEY)fail('OPENROUTER_MANAGEMENT_KEY_REQUIRED_IN_PRIVATE_ENV');
if(!process.env.OPENROUTER_MEMBER_ID)fail('OPENROUTER_MEMBER_ID_REQUIRED_IN_PRIVATE_ENV');
const run=(label,args)=>{
 const r=spawnSync(process.execPath,args,{cwd:process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 if(r.status!==0)fail(label+'_FAILED',{exitCode:r.status,stdout:r.stdout?.slice(-8000),stderr:r.stderr?.slice(-8000)});
 return r.stdout;
};
const pre=run('PREOWNER_DOCTOR',['scripts/infinite-opus-preowner-doctor.mjs']);
const budget=run('BUDGET_RECONCILIATION',['scripts/infinite-opus-openrouter-budget-reconcile.mjs']);
run('TINY_CANARY',['scripts/infinite-opus-openrouter-canary.mjs','--execute','--authorization',path.resolve(auth),'--output',path.resolve(out)]);
let canary;try{canary=JSON.parse(fs.readFileSync(path.resolve(out),'utf8'));}catch(e){fail('CANARY_RECEIPT_UNREADABLE',{reason:e.message});}
if(canary?.ok!==true)fail('CANARY_NOT_PROVEN',{canaryStatus:canary?.status??'UNKNOWN'});
const receipt={
 schemaVersion:'uberbond.infinite-opus.owner-gate-launcher.v1',
 observedAt:new Date().toISOString(),
 ok:true,
 status:'LIVE_TRANSPORT_AND_BILLING_CANARY_PROVEN__SEALED_TOURNAMENT_NEXT',
 preownerStatus:JSON.parse(pre).status,
 budgetStatus:JSON.parse(budget).status,
 canary:{status:canary.status,provider:canary.provider??'openrouter',externalEffects:canary.externalEffects??[],semanticPromotion:false},
 secretsReturned:false,
 automaticCrownPromotion:false,
 automaticSpendBeyondCanary:false,
 next:[
  'RUN_SEALED_TASK_CLASS_TOURNAMENT',
  'ISSUE_CROWN_ADMISSION_ONLY_FROM_VERIFIED_WINNER',
  'RUN_PROVIDER_SCREENING_FIRST_REAL_WORKLOAD',
  'MINT_E0_E4_EXECUTION_RECEIPTS',
  'COMPUTE_PROVABLE_REFERENCE_COMPRESSION'
 ],
 truthBoundary:'This launcher proves the private economic perimeter and bounded live transport/billing canary only. It does not crown a model or claim any compression multiplier.'
};
console.log(JSON.stringify(receipt,null,2));
