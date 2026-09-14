import crypto from 'node:crypto';
import { HARNESS_PHASES, RUNTIME_LAYERS } from './sovereign-institutional-harness.mjs';
import { assertObservedProof, inspectProofAncestry } from './content-addressed-proof-dag.mjs';

export const SOVEREIGN_HARNESS_HARDENING_VERSION='uberbond.sovereign-institutional-harness-hardening.v2';
const REVIEW_DISCIPLINES=['CODE_REVIEWER','SECURITY_ENGINEER','PERFORMANCE_OBSERVABILITY_ENGINEER','RISK_OFFICER','ADVERSARIAL_FALSIFIER','AUTHORITY_GUARD','REALITY_RECONCILER'];
const CRITICAL_TYPES=['failing-test-receipt','passing-test-receipt','ci-receipt','risk-verdict','rollback-rehearsal'];
const text=(v,n=1000)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(v=>text(v,500)).filter(Boolean))].sort();
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const fail=(status,reasons,extra={})=>({ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',...extra});
const rowsOf=artifacts=>(Array.isArray(artifacts)?artifacts:[]).map(raw=>({id:text(raw?.id,200),type:text(raw?.type,160)?.toLowerCase()||null,phase:text(raw?.phase,80)?.toUpperCase()||null,proofId:text(raw?.proofId,200),observed:raw?.observed===true,synthetic:raw?.synthetic===true,sequence:Number(raw?.sequence)}));

export function validateCriticalEvidenceBinding({artifacts=[],proofDag=null}={}){
  const reasons=[];const byType=new Map(rowsOf(artifacts).map(r=>[r.type,r]));
  if(!proofDag?.ok)reasons.push('valid-proof-dag-required');
  for(const type of CRITICAL_TYPES){
    const row=byType.get(type);
    if(!row){reasons.push(`critical-artifact-required:${type}`);continue;}
    if(!row.observed)reasons.push(`critical-artifact-must-be-observed:${type}`);
    if(row.synthetic)reasons.push(`critical-artifact-may-not-be-synthetic:${type}`);
    if(!row.proofId)reasons.push(`critical-artifact-proof-id-required:${type}`);
    if(proofDag?.ok&&row.proofId&&!assertObservedProof({dag:proofDag,proofId:row.proofId}).ok)reasons.push(`critical-artifact-proof-refused:${type}`);
  }
  const packet={version:SOVEREIGN_HARNESS_HARDENING_VERSION,criticalTypes:CRITICAL_TYPES};packet.digest=digest(packet);
  return reasons.length?fail('CRITICAL_EVIDENCE_BINDING_REFUSED',reasons,packet):{ok:true,status:'CRITICAL_EVIDENCE_BINDING_VALID',...packet,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function validateReviewIndependence({roles=[]}={}){
  const reasons=[];const normalized=(Array.isArray(roles)?roles:[]).map(r=>({discipline:text(r?.discipline,120)?.toUpperCase()||null,executionInstanceRef:text(r?.executionInstanceRef,300),contextIsolation:r?.contextIsolation===true}));
  const review=normalized.filter(r=>REVIEW_DISCIPLINES.includes(r.discipline));
  const buildInstances=new Set(normalized.filter(r=>!REVIEW_DISCIPLINES.includes(r.discipline)).map(r=>r.executionInstanceRef).filter(Boolean));
  const reviewInstances=new Set();
  for(const r of review){
    if(!r.executionInstanceRef)reasons.push(`review-instance-required:${r.discipline}`);
    if(!r.contextIsolation)reasons.push(`review-context-isolation-required:${r.discipline}`);
    if(buildInstances.has(r.executionInstanceRef))reasons.push(`review-instance-contaminated-by-build:${r.discipline}`);
    if(reviewInstances.has(r.executionInstanceRef))reasons.push(`review-instances-must-be-pairwise-distinct:${r.discipline}`);
    if(r.executionInstanceRef)reviewInstances.add(r.executionInstanceRef);
  }
  const packet={version:SOVEREIGN_HARNESS_HARDENING_VERSION,reviewCount:review.length,pairwiseDistinctInstances:reviewInstances.size===review.length};packet.digest=digest(packet);
  return reasons.length?fail('REVIEW_INDEPENDENCE_REFUSED',reasons,packet):{ok:true,status:'REVIEW_INDEPENDENCE_VALID',...packet,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function validatePhaseProofContinuity({artifacts=[],proofDag=null}={}){
  if(!proofDag?.ok)return fail('PHASE_PROOF_CONTINUITY_REFUSED',['valid-proof-dag-required']);
  const reasons=[];const rows=rowsOf(artifacts).filter(r=>r.proofId&&HARNESS_PHASES.includes(r.phase));
  for(let i=1;i<HARNESS_PHASES.length;i++){
    const priorIds=new Set(rows.filter(r=>r.phase===HARNESS_PHASES[i-1]).map(r=>r.proofId));
    if(!priorIds.size)continue;
    for(const row of rows.filter(r=>r.phase===HARNESS_PHASES[i])){
      const ancestry=inspectProofAncestry({dag:proofDag,proofId:row.proofId});
      if(!ancestry.ok){reasons.push(`proof-ancestry-unavailable:${row.type}`);continue;}
      const ids=new Set(ancestry.ancestry.map(n=>n.id));
      if(![...priorIds].some(id=>ids.has(id)))reasons.push(`phase-proof-must-descend-from-prior-phase:${row.phase}:${row.type}`);
    }
  }
  const packet={version:SOVEREIGN_HARNESS_HARDENING_VERSION,phaseOrder:HARNESS_PHASES,artifactProofCount:rows.length};packet.digest=digest(packet);
  return reasons.length?fail('PHASE_PROOF_CONTINUITY_REFUSED',reasons,packet):{ok:true,status:'PHASE_PROOF_CONTINUITY_VALID',...packet,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function validateRuntimeContractChain({runtimeLayers=[]}={}){
  const reasons=[];const rows=(Array.isArray(runtimeLayers)?runtimeLayers:[]).map(r=>({layer:text(r?.layer,80)?.toUpperCase()||null,inputContracts:uniq(r?.inputContracts),outputContracts:uniq(r?.outputContracts)}));const by=new Map(rows.map(r=>[r.layer,r]));
  for(const layer of RUNTIME_LAYERS)if(!by.has(layer))reasons.push(`runtime-layer-required:${layer}`);
  for(let i=0;i<RUNTIME_LAYERS.length-1;i++){
    const a=by.get(RUNTIME_LAYERS[i]),b=by.get(RUNTIME_LAYERS[i+1]);if(!a||!b)continue;
    if(!a.outputContracts.length)reasons.push(`runtime-output-contract-required:${a.layer}`);
    if(!b.inputContracts.length)reasons.push(`runtime-input-contract-required:${b.layer}`);
    if(!a.outputContracts.some(x=>b.inputContracts.includes(x)))reasons.push(`runtime-contract-disconnected:${a.layer}->${b.layer}`);
  }
  const packet={version:SOVEREIGN_HARNESS_HARDENING_VERSION,layerOrder:RUNTIME_LAYERS};packet.digest=digest(packet);
  return reasons.length?fail('RUNTIME_CONTRACT_CHAIN_REFUSED',reasons,packet):{ok:true,status:'RUNTIME_CONTRACT_CHAIN_VALID',...packet,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function validateAuthorityLease({lease={},missionId=null,now=null,requiredAction=null}={}){
  const reasons=[];const actions=uniq(lease?.actions);const issued=Date.parse(lease?.issuedAt||''),expires=Date.parse(lease?.expiresAt||''),clock=Date.parse(now||new Date().toISOString());
  if(!text(lease?.leaseId,200))reasons.push('lease-id-required');
  if(!text(lease?.subject,200))reasons.push('lease-subject-required');
  if(text(lease?.missionId,200)!==text(missionId,200))reasons.push('lease-mission-binding-required');
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||!Number.isFinite(clock))reasons.push('valid-lease-times-required');
  if(Number.isFinite(issued)&&Number.isFinite(expires)&&issued>=expires)reasons.push('lease-expiry-must-follow-issue');
  if(Number.isFinite(expires)&&Number.isFinite(clock)&&clock>=expires)reasons.push('lease-must-be-unexpired');
  if(requiredAction&&!actions.includes(requiredAction))reasons.push('required-action-not-in-lease');
  if(lease?.revoked===true)reasons.push('lease-revoked');
  if(lease?.attenuationOnly!==true)reasons.push('attenuation-only-lease-required');
  if(!text(lease?.evidenceRef,1000))reasons.push('lease-evidence-ref-required');
  const packet={version:SOVEREIGN_HARNESS_HARDENING_VERSION,leaseId:text(lease?.leaseId,200),missionId:text(missionId,200),requiredAction:text(requiredAction,160),actions};packet.digest=digest(packet);
  return reasons.length?fail('AUTHORITY_LEASE_REFUSED',reasons,packet):{ok:true,status:'AUTHORITY_LEASE_VALID',...packet,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function reconcileObservedEffect({intent={},observation={},killSwitchAvailable=false,rollbackAvailable=false}={}){
  const reasons=[];const intended=text(intent?.effectDigest,200),observed=text(observation?.effectDigest,200);const match=Boolean(intended&&observed&&intended===observed);
  if(!intended)reasons.push('intended-effect-digest-required');
  if(!observed)reasons.push('observed-effect-digest-required');
  if(observation?.observed!==true)reasons.push('real-observation-required');
  if(!text(observation?.evidenceRef,1000))reasons.push('observation-evidence-required');
  if(!match&&!killSwitchAvailable)reasons.push('discrepancy-requires-kill-switch');
  if(!match&&!rollbackAvailable)reasons.push('discrepancy-requires-rollback-path');
  const packet={version:SOVEREIGN_HARNESS_HARDENING_VERSION,intendedEffectDigest:intended,observedEffectDigest:observed,match,action:match?'CONTINUE_MONITORING':'STOP_RECONCILE_ROLLBACK'};packet.digest=digest(packet);
  return reasons.length?fail('REALITY_RECONCILIATION_REFUSED',reasons,packet):{ok:true,status:match?'REALITY_RECONCILED':'REALITY_DISCREPANCY_CONTAINED',...packet,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}

export function hardeningChecks({roles=[],artifacts=[],proofDag=null,runtimeLayers=[],lease=null,missionId=null,now=null,requiredAction=null}={}){
  const checks={criticalEvidence:validateCriticalEvidenceBinding({artifacts,proofDag}),reviewIndependence:validateReviewIndependence({roles}),phaseProofContinuity:validatePhaseProofContinuity({artifacts,proofDag}),runtimeContractChain:validateRuntimeContractChain({runtimeLayers}),authorityLease:lease?validateAuthorityLease({lease,missionId,now,requiredAction}):null};
  const failed=Object.entries(checks).filter(([,v])=>v&&v.ok===false).map(([k])=>k);
  return failed.length?fail('SOVEREIGN_HARNESS_HARDENING_BLOCKED',failed,{checks}):{ok:true,status:'SOVEREIGN_HARNESS_HARDENING_PASSED',checks,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}
