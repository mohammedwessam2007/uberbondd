import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export const REMAINING_CUT_EVIDENCE_VERSION='uberbond.remaining-cut-evidence.v1';
export const REMAINING_CUT_IDS=Object.freeze(['MESSAGING_PROVIDER','PAYMENT_PROVIDER','DEPLOYMENT_PROVIDER','CREDENTIAL_CUSTODY','SOVEREIGN_IDENTITY']);
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const RECEIPT_KEYS=Object.freeze(['businessEffectAuthority','cutId','evidenceRefs','observed','ok','reasonCodes','receiptDigest','schemaVersion','sourceCommit','status','truthBoundary']);
const TRUTH_BOUNDARY='This secret-free receipt records exact-source external evidence for one named sovereign cut only. Admission creates no authority, cannot close any other cut, and cannot substitute repository claims for provider, owner, identity, custody, deployment, messaging, payment, customer, revenue, life-outcome, or ASI reality.';
const digest=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const text=(v,n=500)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
const secretLike=s=>/(?:^|[?&\s])(token|secret|password|api[_-]?key|authorization)=/i.test(String(s||''));
const ref=v=>{const s=text(v,500);return s&&!secretLike(s)&&/^(?:[a-z][a-z0-9+.-]*:|sha256:)/i.test(s)?s:null;};
const refs=value=>Array.isArray(value)&&value.length<=64&&value.every(v=>ref(v))?[...new Set(value.map(String))]:null;
const positiveInt=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;

function validateMessaging(o){
  if(!exactKeys(o,['paths','providerIndependenceObserved'])||o.providerIndependenceObserved!==true||!Array.isArray(o.paths)||o.paths.length<2||o.paths.length>8)return false;
  const names=new Set();
  for(const p of o.paths){
    if(!exactKeys(p,['activationEvidenceRef','authorized','callable','canaryEvidenceRef','policyEvidenceRef','provider','senderIdentityEvidenceRef'])||p.authorized!==true||p.callable!==true)return false;
    const name=text(p.provider,80)?.toUpperCase();if(!name||names.has(name)||![p.activationEvidenceRef,p.canaryEvidenceRef,p.policyEvidenceRef,p.senderIdentityEvidenceRef].every(ref))return false;names.add(name);
  }
  return names.size>=2;
}
function validatePayment(o){
  if(!exactKeys(o,['authorized','callable','environment','evidenceRef','mode','provider','settlementOrRecoveryObserved']))return false;
  const mode=text(o.mode,40)?.toUpperCase(),provider=text(o.provider,80)?.toUpperCase(),environment=text(o.environment,40)?.toUpperCase();
  if(!['SECOND_RAIL','PAYPAL_RECOVERY'].includes(mode)||environment!=='LIVE'||o.authorized!==true||o.callable!==true||o.settlementOrRecoveryObserved!==true||!provider||!ref(o.evidenceRef))return false;
  if(mode==='SECOND_RAIL'&&provider==='PAYPAL')return false;
  if(mode==='PAYPAL_RECOVERY'&&provider!=='PAYPAL')return false;
  return true;
}
function validateDeployment(o){
  if(!exactKeys(o,['cutoverEvidenceRef','cutoverObserved','exactSourceBootObserved','healthEvidenceRef','independentProvider','primaryProvider','releaseId','rollbackEvidenceRef','rollbackObserved']))return false;
  const primary=text(o.primaryProvider,80)?.toUpperCase(),independent=text(o.independentProvider,80)?.toUpperCase();
  return Boolean(primary&&independent&&primary!==independent&&text(o.releaseId,240)&&o.exactSourceBootObserved===true&&o.cutoverObserved===true&&o.rollbackObserved===true&&[o.healthEvidenceRef,o.cutoverEvidenceRef,o.rollbackEvidenceRef].every(ref));
}
function validateCustody(o){
  if(!exactKeys(o,['factors','ownerEnrollmentObserved','secretMaterialIncluded','threshold'])||o.ownerEnrollmentObserved!==true||o.secretMaterialIncluded!==false||!Array.isArray(o.factors)||o.factors.length<2||o.factors.length>16)return false;
  const threshold=positiveInt(o.threshold);if(!threshold||threshold<2||threshold>o.factors.length)return false;
  const types=new Set(),domains=new Set();
  for(const f of o.factors){if(!exactKeys(f,['custodyDomain','evidenceRef','factorType']))return false;const type=text(f.factorType,80)?.toUpperCase(),domain=text(f.custodyDomain,120)?.toUpperCase();if(!type||!domain||!ref(f.evidenceRef))return false;types.add(type);domains.add(domain);}
  return types.size>=2&&domains.size>=2;
}
function validateIdentity(o){
  if(!exactKeys(o,['authorityEpoch','identityIdDigest','livenessEvidenceRef','ownerConsentObserved','rehearsalEvidenceRef','sameIdentityRecoveryObserved','successorAuthority']))return false;
  return SHA256.test(String(o.identityIdDigest||''))&&positiveInt(o.authorityEpoch)!==null&&o.ownerConsentObserved===true&&o.sameIdentityRecoveryObserved===true&&o.successorAuthority==='NONE'&&Boolean(ref(o.livenessEvidenceRef)&&ref(o.rehearsalEvidenceRef));
}
const VALIDATORS=Object.freeze({MESSAGING_PROVIDER:validateMessaging,PAYMENT_PROVIDER:validatePayment,DEPLOYMENT_PROVIDER:validateDeployment,CREDENTIAL_CUSTODY:validateCustody,SOVEREIGN_IDENTITY:validateIdentity});
function validObserved(cutId,observed){return Boolean(VALIDATORS[cutId]?.(observed));}
export function remainingCutReceiptPreimage(r={}){return{ok:r.ok,schemaVersion:r.schemaVersion,status:r.status,reasonCodes:r.reasonCodes,sourceCommit:r.sourceCommit,cutId:r.cutId,observed:r.observed,evidenceRefs:r.evidenceRefs,businessEffectAuthority:r.businessEffectAuthority,truthBoundary:r.truthBoundary};}
export function verifyRemainingCutEvidenceIntegrity(r={}){
  if(!exactKeys(r,RECEIPT_KEYS)||r.ok!==true||r.schemaVersion!==REMAINING_CUT_EVIDENCE_VERSION||r.status!=='REMAINING_CUT_EXTERNAL_EVIDENCE_OBSERVED'||!Array.isArray(r.reasonCodes)||r.reasonCodes.length!==0)return false;
  if(!SHA40.test(String(r.sourceCommit||'').toLowerCase())||!REMAINING_CUT_IDS.includes(r.cutId)||!validObserved(r.cutId,r.observed)||!refs(r.evidenceRefs)||r.businessEffectAuthority!=='NONE'||r.truthBoundary!==TRUTH_BOUNDARY||!SHA256.test(String(r.receiptDigest||'')))return false;
  return r.receiptDigest===digest(remainingCutReceiptPreimage(r));
}
export function compileRemainingCutEvidence(input={}){
  const sourceCommit=String(input.sourceCommit||'').trim().toLowerCase(),cutId=String(input.cutId||'').trim().toUpperCase(),evidenceRefs=refs(input.evidenceRefs);const reasons=[];
  if(!SHA40.test(sourceCommit))reasons.push('exact-source-commit-required');if(!REMAINING_CUT_IDS.includes(cutId))reasons.push('recognized-remaining-cut-required');if(!validObserved(cutId,input.observed))reasons.push('cut-specific-external-observation-required');if(!evidenceRefs||evidenceRefs.length<1)reasons.push('secret-free-evidence-references-required');
  const ok=reasons.length===0;const receipt={ok,schemaVersion:REMAINING_CUT_EVIDENCE_VERSION,status:ok?'REMAINING_CUT_EXTERNAL_EVIDENCE_OBSERVED':'REMAINING_CUT_EXTERNAL_EVIDENCE_REFUSED',reasonCodes:reasons,sourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,cutId:REMAINING_CUT_IDS.includes(cutId)?cutId:null,observed:input.observed??null,evidenceRefs:evidenceRefs||[],businessEffectAuthority:'NONE',truthBoundary:TRUTH_BOUNDARY};if(ok)receipt.receiptDigest=digest(remainingCutReceiptPreimage(receipt));return receipt;
}
export function validateRemainingCutEvidence({receipt,expectedSourceCommit,expectedCutId,evidenceRef}={}){
  const expected=String(expectedSourceCommit||'').trim().toLowerCase(),cutId=String(expectedCutId||'').trim().toUpperCase(),reasons=[];
  if(!SHA40.test(expected))reasons.push('exact-expected-source-commit-required');if(!REMAINING_CUT_IDS.includes(cutId))reasons.push('recognized-expected-cut-required');if(!ref(evidenceRef))reasons.push('external-evidence-reference-required');if(!verifyRemainingCutEvidenceIntegrity(receipt))reasons.push('canonical-remaining-cut-receipt-required');if(String(receipt?.sourceCommit||'').toLowerCase()!==expected)reasons.push('remaining-cut-source-mismatch');if(receipt?.cutId!==cutId)reasons.push('remaining-cut-id-mismatch');const accepted=reasons.length===0;
  return{ok:true,status:accepted?'EXACT_SOURCE_REMAINING_CUT_EVIDENCE_ACCEPTED':'REMAINING_CUT_EVIDENCE_REJECTED',accepted,cutId,reasonCodes:reasons,sourceCommit:receipt?.sourceCommit||null,receiptDigest:receipt?.receiptDigest||null,evidenceRef:accepted?evidenceRef:null,businessEffectAuthority:'NONE'};
}
export function loadRemainingCutEvidence({path,expectedSourceCommit,expectedCutId}={}){const file=String(path||'').trim();if(!file)return validateRemainingCutEvidence({receipt:null,expectedSourceCommit,expectedCutId,evidenceRef:''});let receipt=null;try{receipt=JSON.parse(readFileSync(file,'utf8'));}catch{return{...validateRemainingCutEvidence({receipt:null,expectedSourceCommit,expectedCutId,evidenceRef:`file:${file}`}),reasonCodes:['remaining-cut-evidence-file-unreadable-or-invalid-json']};}return validateRemainingCutEvidence({receipt,expectedSourceCommit,expectedCutId,evidenceRef:`file:${file}#${receipt?.receiptDigest||'missing-digest'}`});}
