import crypto from 'node:crypto';

export const CROWN_ADMISSION_SCHEMA='uberbond.crown-admission-receipt.v1';
const hash=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const id=x=>typeof x==='string'&&x.length>0&&x.length<=512;
const digest=x=>typeof x==='string'&&/^sha256:[0-9a-f]{64}$/.test(x);
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const int=x=>Number.isSafeInteger(x)&&x>=0;

export function issueCrownAdmissionReceipt(input={}){
  const required=['providerCallId','exactModelId','providerIdentity','routeIdentity','taskClassRole','promptProgramHash','semanticInputHash','qualityContractHash','outputHash','timestamp','expiresAt','budgetAuthorizationRef','costReceiptRef','modelCallabilityReceiptRef','revalidationPolicy'];
  const reasons=[];
  for(const k of required) if(!id(input[k])) reasons.push(`missing-${k}`);
  for(const k of ['promptProgramHash','semanticInputHash','qualityContractHash','outputHash']) if(input[k]&&!digest(input[k])) reasons.push(`invalid-${k}`);
  if(!iso(input.timestamp)||!iso(input.expiresAt)||Date.parse(input.expiresAt)<=Date.parse(input.timestamp)) reasons.push('valid-expiry-required');
  if(!Array.isArray(input.sourceDependencyHashes)||!input.sourceDependencyHashes.every(digest)) reasons.push('source-dependency-hashes-required');
  if(!Array.isArray(input.evidenceReferences)||!input.evidenceReferences.every(id)) reasons.push('evidence-references-required');
  if(!int(input.actualCostMicrousd)) reasons.push('observed-cost-microusd-required');
  if(input.sideEffectAuthority!=='NONE') reasons.push('crown-semantic-call-must-not-self-grant-side-effect-authority');
  if(input.providerBillObserved!==true) reasons.push('provider-bill-observation-required');
  if(input.modelIdentityVerified!==true) reasons.push('model-identity-verification-required');
  if(input.modelCallabilityVerified!==true) reasons.push('model-callability-verification-required');
  if(input.tournamentEvidenceVerified!==true) reasons.push('task-class-tournament-verification-required');
  if(input.roleTournamentEvidenceRef==null) reasons.push('task-class-crown-tournament-evidence-required');
  if(input.modelRevision!=null&&!id(input.modelRevision)) reasons.push('model-revision-invalid');
  if(input.authorizationStatus!=='AUTHORIZED_FOR_THIS_CALL') reasons.push('exact-call-authorization-status-required');
  if(reasons.length) return {ok:false,status:'CROWN_ADMISSION_REFUSED',reasons,semanticAuthority:'NONE'};
  const body={schemaVersion:CROWN_ADMISSION_SCHEMA,...input,sideEffectAuthority:'NONE'};
  return {ok:true,status:'CROWN_ADMISSION_RECEIPT_ISSUED',receipt:{...body,receiptHash:hash(body)},semanticAuthority:'CURRENT_TASK_CLASS_CROWN'};
}

export function verifyCrownAdmissionReceipt(receipt,{now=Date.now(),expected={}}={}){
  const reasons=[];
  if(receipt?.schemaVersion!==CROWN_ADMISSION_SCHEMA) reasons.push('schema-mismatch');
  if(!digest(receipt?.receiptHash)) reasons.push('receipt-hash-required');
  const {receiptHash,...body}=receipt??{};
  if(receiptHash!==hash(body)) reasons.push('receipt-hash-mismatch');
  if(!iso(receipt?.expiresAt)||Date.parse(receipt.expiresAt)<=now) reasons.push('crown-admission-expired');
  for(const [k,v] of Object.entries(expected)) if(v!=null&&receipt?.[k]!==v) reasons.push(`expected-${k}-mismatch`);
  if(receipt?.sideEffectAuthority!=='NONE') reasons.push('side-effect-authority-forbidden');
  return {ok:reasons.length===0,status:reasons.length?'CROWN_ADMISSION_INVALID':'CROWN_ADMISSION_VALID',reasons};
}
