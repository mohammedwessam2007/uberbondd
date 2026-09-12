import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const MODEL_PROVIDER_RUNTIME_EVIDENCE_VERSION='uberbond.model-provider-runtime-evidence.v1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const RECEIPT_KEYS=Object.freeze(['businessEffectAuthority','externalEffectLedger','observed','ok','reasonCodes','receiptDigest','schemaVersion','sourceCommit','status','truthBoundary']);
const OBSERVED_KEYS=Object.freeze(['configuredModel','costCeilingCents','costCents','identityVerification','inputTokens','observedModel','outcome','outputTokens','provider','resultDigest','runtime','runtimeHost','taskId','totalTokens']);
const ZERO_KEYS=Object.freeze(['credentialChanges','deployments','dnsChanges','messages','providerCalls','purchases','spendCents','productionMutations']);
const TRUTH_BOUNDARY='This receipt proves one exact-source bounded task completed through UberBond open-model execution on a named local/alternate runtime, with exact model identity and zero business-effect authority. It closes only MODEL_PROVIDER when independently observed. It does not prove messaging, payment, deployment-provider independence, owner custody, customer outcomes, or general model quality.';
const digest=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const exactKeys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...expected].sort().join('\0');
const text=(value,max=500)=>{const s=String(value??'').trim();return s&&s.length<=max?s:null;};
const integer=(value,min=0)=>Number.isSafeInteger(Number(value))&&Number(value)>=min?Number(value):null;
const zeroLedger=value=>exactKeys(value,ZERO_KEYS)&&ZERO_KEYS.every(key=>value[key]===0);

export function modelProviderRuntimeReceiptPreimage(receipt={}){return{ok:receipt.ok,schemaVersion:receipt.schemaVersion,status:receipt.status,reasonCodes:receipt.reasonCodes,sourceCommit:receipt.sourceCommit,observed:receipt.observed,businessEffectAuthority:receipt.businessEffectAuthority,externalEffectLedger:receipt.externalEffectLedger,truthBoundary:receipt.truthBoundary};}

export function verifyModelProviderRuntimeEvidenceIntegrity(receipt={}){
  if(!exactKeys(receipt,RECEIPT_KEYS)||receipt.ok!==true||receipt.schemaVersion!==MODEL_PROVIDER_RUNTIME_EVIDENCE_VERSION||receipt.status!=='MODEL_PROVIDER_TASK_COMPLETED')return false;
  if(!Array.isArray(receipt.reasonCodes)||receipt.reasonCodes.length!==0||!SHA40.test(String(receipt.sourceCommit||'').toLowerCase()))return false;
  const o=receipt.observed;if(!exactKeys(o,OBSERVED_KEYS))return false;
  if(o.provider!=='open-model'||!text(o.runtime,100)||!text(o.runtimeHost,160)||!text(o.taskId,240))return false;
  if(!text(o.configuredModel,400)||o.configuredModel!==o.observedModel||o.identityVerification!=='MATCHED'||o.outcome!=='COMPLETED')return false;
  if(!SHA256.test(String(o.resultDigest||'')))return false;
  for(const key of ['inputTokens','outputTokens','totalTokens','costCents','costCeilingCents'])if(integer(o[key])===null)return false;
  if(o.totalTokens<o.inputTokens+o.outputTokens||o.costCents>o.costCeilingCents)return false;
  if(receipt.businessEffectAuthority!=='NONE'||!zeroLedger(receipt.externalEffectLedger)||receipt.truthBoundary!==TRUTH_BOUNDARY||!SHA256.test(String(receipt.receiptDigest||'')))return false;
  return receipt.receiptDigest===digest(modelProviderRuntimeReceiptPreimage(receipt));
}

export function compileModelProviderRuntimeEvidence(input={}){
  const reasons=[];const sourceCommit=String(input.sourceCommit||'').trim().toLowerCase();
  const provider=text(input.provider,80),runtime=text(input.runtime,100),runtimeHost=text(input.runtimeHost,160),taskId=text(input.taskId,240),configuredModel=text(input.configuredModel,400),observedModel=text(input.observedModel,400),identityVerification=text(input.identityVerification,80),outcome=text(input.outcome,80);
  const resultDigest=String(input.resultDigest||'').trim().toLowerCase();
  const inputTokens=integer(input.inputTokens),outputTokens=integer(input.outputTokens),totalTokens=integer(input.totalTokens),costCents=integer(input.costCents),costCeilingCents=integer(input.costCeilingCents);
  const ledger=input.externalEffectLedger&&typeof input.externalEffectLedger==='object'?Object.fromEntries(ZERO_KEYS.map(key=>[key,Number(input.externalEffectLedger[key])])):null;
  if(!SHA40.test(sourceCommit))reasons.push('exact-source-commit-required');
  if(provider!=='open-model')reasons.push('open-model-provider-required');
  if(!runtime||!runtimeHost||!taskId)reasons.push('named-runtime-host-task-required');
  if(!configuredModel||configuredModel!==observedModel||identityVerification!=='MATCHED')reasons.push('exact-observed-model-identity-required');
  if(outcome!=='COMPLETED')reasons.push('completed-model-task-required');
  if(!SHA256.test(resultDigest))reasons.push('model-result-digest-required');
  if([inputTokens,outputTokens,totalTokens,costCents,costCeilingCents].some(value=>value===null)||totalTokens<inputTokens+outputTokens)reasons.push('valid-metered-usage-required');
  if(costCents!==null&&costCeilingCents!==null&&costCents>costCeilingCents)reasons.push('model-cost-must-fit-reserved-ceiling');
  if(input.businessEffectAuthority!=='NONE')reasons.push('zero-business-effect-authority-required');
  if(!zeroLedger(ledger))reasons.push('zero-external-effect-ledger-required');
  const ok=reasons.length===0;
  const receipt={ok,schemaVersion:MODEL_PROVIDER_RUNTIME_EVIDENCE_VERSION,status:ok?'MODEL_PROVIDER_TASK_COMPLETED':'MODEL_PROVIDER_TASK_REFUSED',reasonCodes:reasons,sourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,observed:{configuredModel,costCeilingCents,costCents,identityVerification,inputTokens,observedModel,outcome,outputTokens,provider,resultDigest:SHA256.test(resultDigest)?resultDigest:null,runtime,runtimeHost,taskId,totalTokens},businessEffectAuthority:'NONE',externalEffectLedger:ledger||Object.fromEntries(ZERO_KEYS.map(key=>[key,0])),truthBoundary:TRUTH_BOUNDARY};
  if(ok)receipt.receiptDigest=digest(modelProviderRuntimeReceiptPreimage(receipt));return receipt;
}

export function validateModelProviderRuntimeEvidence({receipt,expectedSourceCommit,evidenceRef}={}){
  const expected=String(expectedSourceCommit||'').trim().toLowerCase(),ref=String(evidenceRef||'').trim();const reasons=[];
  if(!SHA40.test(expected))reasons.push('exact-expected-source-commit-required');
  if(!ref)reasons.push('provider-evidence-reference-required');
  if(!verifyModelProviderRuntimeEvidenceIntegrity(receipt))reasons.push('canonical-model-provider-runtime-receipt-required');
  if(String(receipt?.sourceCommit||'').toLowerCase()!==expected)reasons.push('model-provider-source-mismatch');
  const accepted=reasons.length===0;
  return{ok:true,status:accepted?'EXACT_SOURCE_MODEL_PROVIDER_EVIDENCE_ACCEPTED':'MODEL_PROVIDER_EVIDENCE_REJECTED',accepted,reasonCodes:reasons,sourceCommit:receipt?.sourceCommit||null,receiptDigest:receipt?.receiptDigest||null,evidenceRef:accepted?ref:null,businessEffectAuthority:'NONE'};
}

export function loadModelProviderRuntimeEvidence({path,expectedSourceCommit}={}){const file=String(path||'').trim();if(!file)return validateModelProviderRuntimeEvidence({receipt:null,expectedSourceCommit,evidenceRef:''});let receipt=null;try{receipt=JSON.parse(readFileSync(file,'utf8'));}catch{return{...validateModelProviderRuntimeEvidence({receipt:null,expectedSourceCommit,evidenceRef:`file:${file}`}),reasonCodes:['provider-evidence-file-unreadable-or-invalid-json']};}return validateModelProviderRuntimeEvidence({receipt,expectedSourceCommit,evidenceRef:`file:${file}#${receipt?.receiptDigest||'missing-digest'}`});}
