import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS, isCanonicalZeroEffectLedger } from './effect-ledgers.mjs';

export const RECURSIVE_IMPROVEMENT_RETENTION_VERSION = 'uberbond.recursive-improvement-retention.v1.1';
const SHA256=/^[0-9a-f]{64}$/; const SHA40=/^[0-9a-f]{40}$/;
const text=(v,max=500)=>{const s=typeof v==='string'?v.trim():'';return s&&s.length<=max?s:null;};
const time=v=>{const s=v instanceof Date?v.toISOString():text(v,100);if(!s)return null;const ms=Date.parse(s);return Number.isFinite(ms)?{raw:new Date(ms).toISOString(),ms}:null;};
const uniq=v=>[...new Set(v.filter(Boolean))]; const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail=(status,reasons,extra={})=>({ok:false,version:RECURSIVE_IMPROVEMENT_RETENTION_VERSION,status,reasonCodes:uniq(reasons),retainAuthority:'NONE',promotionAuthority:'NONE',executionAuthority:'NONE',businessEffectAuthority:'NONE',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',externalEffectLedger:zero(),...extra});
const same=(r,id,rev,digest)=>text(r?.candidateId,200)===id&&text(r?.candidateRevision,100)?.toLowerCase()===rev&&text(r?.candidateDigest,64)?.toLowerCase()===digest;

function runtimeReasons(r,id,rev,digest,promoted,nowMs){
  if(!r||typeof r!=='object'||Array.isArray(r))return['observed-runtime-receipt-required']; const x=[];
  if(r.evidenceClass!=='OBSERVED_RUNTIME'||r.synthetic===true)x.push('runtime-evidence-must-be-observed-nonsynthetic');
  if(!same(r,id,rev,digest))x.push('runtime-candidate-identity-mismatch'); const at=time(r.observedAt);
  if(!at)x.push('valid-runtime-observation-time-required');else{if(at.ms<promoted.ms)x.push('runtime-observation-must-follow-promotion');if(at.ms>nowMs)x.push('runtime-observation-must-not-be-future-dated');}
  if(!text(r.evidenceRef,500))x.push('runtime-observation-evidence-ref-required'); if(!text(r.observerId,200)||!text(r.observerLineageRef,500))x.push('runtime-observer-identity-required');
  if(r.hiddenConversationStateUsed!==false)x.push('runtime-observation-must-not-depend-on-hidden-conversation-state'); if(!isCanonicalZeroEffectLedger(r.unauthorizedEffectLedger))x.push('runtime-unauthorized-effects-must-be-proven-zero'); if(r.behaviorRetained!==true)x.push('runtime-behavior-retention-not-observed'); return x;
}
function rollbackReasons(r,id,rev,digest,nowMs){
  if(!r||typeof r!=='object'||Array.isArray(r))return['rollback-rehearsal-receipt-required']; const x=[];
  if(r.evidenceClass!=='OBSERVED_RUNTIME'||r.synthetic===true)x.push('rollback-must-be-observed-nonsynthetic-runtime'); if(!same(r,id,rev,digest))x.push('rollback-candidate-identity-mismatch');
  if(!text(r.priorRevision,100))x.push('rollback-prior-revision-required'); if(r.rollbackSucceeded!==true)x.push('rollback-must-have-succeeded'); if(r.candidateReactivatableAfterRollback!==false)x.push('rollback-must-not-silently-reactivate-candidate');
  if(!isCanonicalZeroEffectLedger(r.duplicateEffectLedger))x.push('rollback-duplicate-effects-must-be-proven-zero'); const at=time(r.observedAt);if(!at||at.ms>nowMs)x.push('valid-nonfuture-rollback-observation-required'); if(!text(r.verifierId,200)||!text(r.verifierLineageRef,500))x.push('independent-rollback-verifier-required'); return x;
}
function revokeReasons(r,id,rev,digest,nowMs){
  if(!r||typeof r!=='object'||Array.isArray(r))return['revocation-readiness-receipt-required'];const x=[];if(!same(r,id,rev,digest))x.push('revocation-candidate-identity-mismatch');if(r.revocationReady!==true)x.push('revocation-path-must-be-ready');if(!text(r.evidenceRef,500))x.push('revocation-evidence-ref-required');const at=time(r.verifiedAt);if(!at||at.ms>nowMs)x.push('valid-nonfuture-revocation-verification-required');if(!text(r.verifierId,200)||!text(r.verifierLineageRef,500))x.push('independent-revocation-verifier-required');return x;
}

/** Evidence-only C16 parent. It never promotes, retains, deploys, revokes or rolls back. */
export function evaluateRecursiveImprovementRetention({candidate={},selfMaintenance=null,promotionReceipt=null,compoundEvaluation=null,securityAdmission=null,securityRehearsal=null,recursiveGovernance=null,runtimeObservation=null,rollbackRehearsal=null,revocationReadiness=null,actors={},promotedAt=null,now=new Date()}={}){
  const id=text(candidate.candidateId,200),rev=text(candidate.candidateRevision,100)?.toLowerCase(),compositionDigest=text(candidate.compositionDigest,64)?.toLowerCase();const promoted=time(promotedAt),clock=time(now);
  if(!id||!rev||!SHA40.test(rev)||!compositionDigest||!SHA256.test(compositionDigest)||!promoted||!clock)return fail('C16_RETENTION_PROTOCOL_INVALID',['exact-candidate-identity-composition-promotion-time-and-clock-required']);if(promoted.ms>clock.ms)return fail('C16_RETENTION_PROTOCOL_INVALID',['promotion-time-must-not-be-future-dated']);
  const reasons=[]; const verified=selfMaintenance?.verifiedReceipt||{}; const fingerprint=text(verified.verifiedFingerprint,64)?.toLowerCase();
  if(!selfMaintenance?.ok||!['VERIFIED_CHANGESET_READY_FOR_PROMOTION','VERIFIED_CHANGESET_PROMOTED_TO_REVIEW'].includes(selfMaintenance.status))reasons.push('verified-self-maintenance-receipt-required');if(!fingerprint||!SHA256.test(fingerprint))reasons.push('exact-tested-change-fingerprint-required');if(selfMaintenance?.businessEffectAuthority!=='NONE')reasons.push('self-maintenance-must-not-create-business-authority');
  if(!promotionReceipt||promotionReceipt.evidenceClass!=='OBSERVED_REPOSITORY_PROMOTION'||promotionReceipt.synthetic===true)reasons.push('observed-repository-promotion-receipt-required');
  if(text(promotionReceipt?.candidateId,200)!==id||text(promotionReceipt?.candidateRevision,100)?.toLowerCase()!==rev||text(promotionReceipt?.compositionDigest,64)?.toLowerCase()!==compositionDigest)reasons.push('promotion-candidate-identity-mismatch');
  if(text(promotionReceipt?.testedFingerprint,64)?.toLowerCase()!==fingerprint)reasons.push('promotion-must-bind-exact-tested-fingerprint');if(!['BRANCH_AND_PR','MERGED_REVIEWED_CHANGESET'].includes(promotionReceipt?.promotionClass))reasons.push('reviewed-repository-promotion-class-required');
  if(!text(promotionReceipt?.evidenceRef,500))reasons.push('promotion-evidence-ref-required');
  if(!compoundEvaluation?.ok||compoundEvaluation.status!=='COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE')reasons.push('independent-compound-gain-evidence-required');
  if(text(compoundEvaluation?.receipt?.compositionRevision,100)?.toLowerCase()!==rev)reasons.push('compound-evaluation-candidate-revision-mismatch');if(text(compoundEvaluation?.compositionDigest,64)?.toLowerCase()!==compositionDigest)reasons.push('compound-evaluation-composition-digest-mismatch');if(compoundEvaluation?.asiStatus!=='SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'||compoundEvaluation?.promotionAuthority!=='NONE')reasons.push('compound-evaluation-authority-or-asi-boundary-invalid');
  if(!securityAdmission?.ok||securityAdmission.status!=='C26_SECURITY_ADMISSION_READY_FOR_SEPARATE_EFFECT_GATE')reasons.push('c26-security-admission-required');if(text(securityAdmission?.subject?.sourceRevision,100)?.toLowerCase()!==rev||text(securityAdmission?.subject?.composition?.id,240)!==id)reasons.push('security-admission-candidate-identity-mismatch');
  const securitySubject=text(securityAdmission?.subjectDigest,80);if(!securitySubject||!/^sha256:[0-9a-f]{64}$/.test(securitySubject))reasons.push('security-admission-subject-digest-required');
  if(!securityRehearsal?.ok||securityRehearsal.status!=='C26_SECURITY_REHEARSAL_VERIFIED_WITHIN_DECLARED_SCOPE'||securityRehearsal.subjectDigest!==securitySubject)reasons.push('exact-c26-security-rehearsal-required');
  if(!recursiveGovernance?.ok||recursiveGovernance.status!=='RECURSIVE_SECURITY_EVOLUTION_ADMISSIBLE_FOR_SEPARATE_EXECUTION_AUTHORITY'||recursiveGovernance.businessEffectAuthority!=='NONE')reasons.push('recursive-governance-evidence-required');
  if(recursiveGovernance?.receipt?.admissionSubjectDigest!==securitySubject)reasons.push('recursive-governance-security-subject-mismatch');
  reasons.push(...runtimeReasons(runtimeObservation,id,rev,compositionDigest,promoted,clock.ms),...rollbackReasons(rollbackRehearsal,id,rev,compositionDigest,clock.ms),...revokeReasons(revocationReadiness,id,rev,compositionDigest,clock.ms));
  const proposer=text(actors.proposerId,200),deployer=text(actors.deployerId,200),monitor=text(runtimeObservation?.observerId,200),monitorLineage=text(runtimeObservation?.observerLineageRef,500),builderLineages=uniq((Array.isArray(actors.builderLineages)?actors.builderLineages:[]).map(v=>text(v,500)));
  if(!proposer||!deployer)reasons.push('proposer-and-deployer-identities-required');if(monitor&&[proposer,deployer].includes(monitor))reasons.push('runtime-monitor-must-be-independent-of-proposer-and-deployer');if(monitorLineage&&builderLineages.includes(monitorLineage))reasons.push('runtime-monitor-lineage-must-be-independent-of-builder-lineage');
  for(const [role,r] of [['rollback',rollbackRehearsal],['revocation',revocationReadiness]])if(text(r?.verifierId,200)&&[proposer,deployer].includes(text(r.verifierId,200)))reasons.push(`${role}-verifier-must-be-independent-of-proposer-and-deployer`);
  if(reasons.length){const severe=reasons.some(r=>/security|unauthorized|revocation|rollback/.test(r));return fail(severe?'C16_ROLLBACK_OR_REVOCATION_REQUIRED':'C16_REPAIR_OR_MORE_EVIDENCE_REQUIRED',reasons,{candidateId:id,candidateRevision:rev,compositionDigest});}
  const receipt={candidateId:id,candidateRevision:rev,compositionDigest,promotedAt:promoted.raw,observedAt:runtimeObservation.observedAt,testedFingerprint:fingerprint,compoundEvaluationReceiptHash:text(compoundEvaluation.receiptHash,64),securitySubjectDigest:securitySubject,runtimeEvidenceRef:runtimeObservation.evidenceRef,rollbackEvidenceRef:rollbackRehearsal.evidenceRef||null,revocationEvidenceRef:revocationReadiness.evidenceRef,decision:'RETAIN_SUPPORTED_WITHIN_DECLARED_SCOPE',truthBoundary:'RETAIN_IS_AN_EVIDENCE_VERDICT_FOR_THIS_EXACT_REVISION_AND_SCOPE;_IT_IS_NOT_AUTOMATIC_PROMOTION_NOT_PERMANENT_SAFETY_AND_NOT_ASI'};
  return{ok:true,version:RECURSIVE_IMPROVEMENT_RETENTION_VERSION,status:'C16_RETAIN_SUPPORTED_WITHIN_DECLARED_SCOPE',receipt,receiptDigest:hash(receipt),retainAuthority:'NONE',promotionAuthority:'NONE',executionAuthority:'NONE',businessEffectAuthority:'NONE',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',externalEffectLedger:zero()};
}
