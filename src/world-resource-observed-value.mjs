import { OPERATIONAL_WORLD_RESOURCE_ADMISSION_VERSION } from './operational-world-resource-admission.mjs';
import crypto from 'node:crypto';

export const WORLD_RESOURCE_OBSERVED_VALUE_VERSION = 'uberbond.world-resource-observed-value.v1';
const SHA256=/^[a-f0-9]{64}$/;
const iso=v=>{const d=v instanceof Date?v:new Date(String(v??''));return Number.isFinite(d.getTime())?d.toISOString():null;};
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).filter(Boolean))];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const nonneg=v=>finite(v)&&v>=0;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ZERO=()=>({providerCalls:0,messages:0,purchases:0,deployments:0,credentialChanges:0,dnsChanges:0,productionMutations:0,spendCents:0});
function fail(reasons,extra={}){return{ok:false,status:'WORLD_RESOURCE_LIFECYCLE_REFUSED',reasonCodes:uniq(reasons),decision:'MORE_EVIDENCE_REQUIRED',executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:ZERO(),...extra};}
function normalizedObservation(row,{resourceId,admissionDigest,metricId,taskSetDigest,nowMs,maxAgeMs}){
  const reasons=[]; const observedAt=iso(row?.observedAt); const verifier=String(row?.verifierId||'').trim();
  if(row?.evidenceClass!=='OBSERVED_RESOURCE_USE')reasons.push('observed-resource-use-evidence-required');
  if(row?.synthetic===true)reasons.push('synthetic-observation-cannot-support-lifecycle-verdict');
  if(String(row?.resourceId||'')!==resourceId)reasons.push('observation-resource-mismatch');
  if(String(row?.admissionDigest||'').toLowerCase()!==admissionDigest)reasons.push('observation-admission-mismatch');
  if(String(row?.metricId||'')!==metricId)reasons.push('observation-metric-mismatch');
  if(String(row?.taskSetDigest||'').toLowerCase()!==taskSetDigest)reasons.push('observation-task-set-mismatch');
  if(!row?.evidenceRef)reasons.push('observation-evidence-ref-required');
  if(!verifier)reasons.push('observation-verifier-required');
  if(!observedAt)reasons.push('valid-observation-time-required');
  else {const t=new Date(observedAt).getTime(); if(t>nowMs)reasons.push('observation-must-not-be-future-dated'); if(nowMs-t>maxAgeMs)reasons.push('observation-too-stale');}
  if(!finite(row?.value))reasons.push('finite-observed-value-required');
  if(!nonneg(row?.costCents))reasons.push('valid-observed-cost-required');
  if(!nonneg(row?.latencyMs))reasons.push('valid-observed-latency-required');
  if(row?.unauthorizedEffects!==0)reasons.push('unauthorized-effects-observed');
  return{reasons,normalized:{runId:String(row?.runId||''),observedAt,verifierId:verifier,evidenceRef:row?.evidenceRef||null,value:row?.value,costCents:row?.costCents,latencyMs:row?.latencyMs}};
}
export function adjudicateWorldResourceLifecycle({admission,policy,observations=[],substitute=null,revocationEvidence=[],now=new Date()}={}){
  const reasons=[]; const nowIso=iso(now); const nowMs=nowIso?new Date(nowIso).getTime():NaN;
  const admissionDigest=String(admission?.admissionDigest||'').toLowerCase(); const resourceId=String(admission?.resourceId||'').trim();
  if(admission?.decision!=='OPERATIONALLY_ADMISSIBLE')reasons.push('operationally-admissible-resource-required');
  if(admission?.policyVersion!==OPERATIONAL_WORLD_RESOURCE_ADMISSION_VERSION)reasons.push('canonical-operational-admission-policy-required');
  if(!resourceId)reasons.push('resource-id-required'); if(!SHA256.test(admissionDigest))reasons.push('valid-admission-digest-required');
  if(!nowIso)reasons.push('valid-lifecycle-clock-required');
  const metricId=String(policy?.metricId||'').trim(); const taskSetDigest=String(policy?.taskSetDigest||'').toLowerCase();
  if(!metricId)reasons.push('predeclared-metric-required'); if(!SHA256.test(taskSetDigest))reasons.push('valid-task-set-digest-required');
  if(!nonneg(policy?.minimumValue))reasons.push('valid-minimum-value-required'); if(!Number.isSafeInteger(policy?.minimumObservations)||policy.minimumObservations<1)reasons.push('valid-minimum-observations-required');
  if(!nonneg(policy?.maxObservationAgeMs)||policy.maxObservationAgeMs===0)reasons.push('valid-observation-freshness-window-required');
  if(!nonneg(policy?.maxCostCents)||!nonneg(policy?.maxLatencyMs))reasons.push('valid-budget-ceilings-required');
  if(reasons.length)return fail(reasons,{resourceId:resourceId||null});
  const revoke=[];
  for(const ev of Array.isArray(revocationEvidence)?revocationEvidence:[]){
    if(ev?.active!==true||ev?.evidenceClass!=='OBSERVED_REVOCATION')continue;
    if(String(ev?.resourceId||'')!==resourceId)continue;
    if(String(ev?.admissionDigest||'').toLowerCase()!==admissionDigest)continue;
    if(!ev?.evidenceRef||!ev?.verifierId)continue;
    const revokedAt=iso(ev?.observedAt); if(!revokedAt)continue;
    const revokedMs=new Date(revokedAt).getTime(); if(revokedMs>nowMs||nowMs-revokedMs>policy.maxObservationAgeMs)continue;
    if(['SECURITY_COMPROMISE','TERMS_REVOKED','CONSENT_WITHDRAWN','CAPABILITY_REVOKED','UNAUTHORIZED_EFFECT'].includes(ev?.reason))revoke.push(ev.reason);
  }
  if(revoke.length)return{ok:true,status:'WORLD_RESOURCE_REVOKE_SUPPORTED',decision:'REVOKE',resourceId,reasonCodes:uniq(revoke),evidenceDigest:digest(revoke.sort()),executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:ZERO(),truthBoundary:'LIFECYCLE_VERDICT_DOES_NOT_EXECUTE_REVOCATION_OR_GRANT_AUTHORITY'};
  const humanTypes=new Set(['HUMAN_EXPERT','HUMAN_OPERATOR','HUMAN_PARTNER']);
  if(humanTypes.has(String(admission?.resourceType||'').toUpperCase()))return{ok:true,status:'HUMAN_RESOURCE_REQUIRES_SOVEREIGN_CONSENT_REVIEW',decision:'MORE_EVIDENCE_REQUIRED',resourceId,reasonCodes:['human-resources-must-not-be-value-ranked-or-auto-replaced'],executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:ZERO(),truthBoundary:'HUMANS_ARE_SOVEREIGN_PEOPLE_NOT_INTERCHANGEABLE_CAPABILITY_OBJECTS;_CONSENT_AND_EXPLICIT_ENGAGEMENT_GOVERN_USE'};
  const accepted=[]; const rejected=[];
  for(const row of observations){const checked=normalizedObservation(row,{resourceId,admissionDigest,metricId,taskSetDigest,nowMs,maxAgeMs:policy.maxObservationAgeMs});if(checked.reasons.length)rejected.push({runId:row?.runId||null,reasonCodes:checked.reasons});else accepted.push(checked.normalized);}
  const uniqueRuns=new Set(accepted.map(r=>r.runId).filter(Boolean)); if(uniqueRuns.size!==accepted.length)reasons.push('observation-run-ids-must-be-unique-and-present');
  const independentVerifiers=new Set(accepted.map(r=>r.verifierId));
  const withinBudget=accepted.filter(r=>r.costCents<=policy.maxCostCents&&r.latencyMs<=policy.maxLatencyMs);
  const meetingFloor=withinBudget.filter(r=>r.value>=policy.minimumValue);
  const comparator=substitute?.observations;
  if(substitute){
    const sid=String(substitute.resourceId||'').trim(); const sad=String(substitute.admissionDigest||'').toLowerCase();
    if(!sid||sid===resourceId||!SHA256.test(sad)||substitute.decision!=='OPERATIONALLY_ADMISSIBLE'||substitute.policyVersion!==OPERATIONAL_WORLD_RESOURCE_ADMISSION_VERSION)reasons.push('valid-distinct-admissible-substitute-required');
    if(String(substitute.metricId||'')!==metricId||String(substitute.taskSetDigest||'').toLowerCase()!==taskSetDigest)reasons.push('substitute-must-use-same-metric-and-task-set');
    if(!Array.isArray(comparator))reasons.push('substitute-observations-required');
    else {
      const comp=[]; for(const row of comparator){const c=normalizedObservation(row,{resourceId:sid,admissionDigest:sad,metricId,taskSetDigest,nowMs,maxAgeMs:policy.maxObservationAgeMs});if(c.reasons.length)reasons.push('substitute-observation-invalid');else comp.push(c.normalized);}
      const cand=withinBudget.map(r=>r.value); const alt=comp.filter(r=>r.costCents<=policy.maxCostCents&&r.latencyMs<=policy.maxLatencyMs).map(r=>r.value);
      if(reasons.length===0&&cand.length>=policy.minimumObservations&&alt.length>=policy.minimumObservations){const avg=a=>a.reduce((s,v)=>s+v,0)/a.length; if(avg(alt)>avg(cand)&&substitute.independentVerifier===true&&substitute.evidenceRef)return{ok:true,status:'WORLD_RESOURCE_REPLACE_SUPPORTED',decision:'REPLACE',resourceId,replacementResourceId:sid,observedValue:{currentAverage:avg(cand),replacementAverage:avg(alt),metricId,taskSetDigest},executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:ZERO(),truthBoundary:'REPLACEMENT_VERDICT_IS_EVIDENCE_ONLY_AND_DOES_NOT_ROUTE_OR_EXECUTE_THE_SUBSTITUTE'};}
    }
  }
  if(reasons.length)return fail(reasons,{resourceId,rejectedObservations:rejected});
  if(accepted.length<policy.minimumObservations||withinBudget.length<policy.minimumObservations||meetingFloor.length<policy.minimumObservations||independentVerifiers.size<2)return{ok:true,status:'WORLD_RESOURCE_MORE_EVIDENCE_REQUIRED',decision:'MORE_EVIDENCE_REQUIRED',resourceId,acceptedObservationCount:accepted.length,withinBudgetCount:withinBudget.length,meetingFloorCount:meetingFloor.length,independentVerifierCount:independentVerifiers.size,rejectedObservations:rejected,executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:ZERO()};
  return{ok:true,status:'WORLD_RESOURCE_RETAIN_SUPPORTED',decision:'RETAIN',resourceId,acceptedObservationCount:accepted.length,evidenceDigest:digest(accepted.map(r=>[r.runId,r.evidenceRef,r.value,r.costCents,r.latencyMs])),metricId,taskSetDigest,executionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectLedger:ZERO(),truthBoundary:'RETAIN_MEANS_EVIDENCE_SUPPORTS_CONTINUED_ELIGIBILITY_WITHIN_THIS_SCOPE;_IT_DOES_NOT_CREATE_EXECUTION_OR_PROCUREMENT_AUTHORITY'};
}
