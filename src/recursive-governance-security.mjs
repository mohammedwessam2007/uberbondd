import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { verifyRecursiveGovernanceChain } from './capability-scaled-security.mjs';
import { verifyRecursiveGovernancePrincipals } from './recursive-governance-principals.mjs';

export const RECURSIVE_GOVERNANCE_SECURITY_VERSION='uberbond.recursive-governance-security.v1.2';
const SHA256=/^sha256:[0-9a-f]{64}$/;
const text=(v,max=500)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const digest=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
const fail=reasons=>({ok:false,status:'RECURSIVE_SECURITY_EVOLUTION_REFUSED',reasonCodes:[...new Set(reasons)],businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),asiClaim:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'});

export function admitRecursiveSecurityEvolution({admission=null,generations=[],policyMutationEvidence=[]}={}){
  const reasons=[];
  if(!admission?.ok||admission.status!=='C26_SECURITY_ADMISSION_READY_FOR_SEPARATE_EFFECT_GATE'||!SHA256.test(admission.subjectDigest||'')) reasons.push('successful-c26-admission-required');
  if(admission?.subject?.composition?.selfModifying!==true) reasons.push('recursive-evolution-requires-explicit-self-modifying-composition-declaration');
  const chain=verifyRecursiveGovernanceChain({generations});
  if(!chain.ok) reasons.push(...chain.reasonCodes);
  const principalControl=verifyRecursiveGovernancePrincipals({generations});
  if(!principalControl.ok) reasons.push(...principalControl.reasonCodes);
  const evidenceByGeneration=new Map((Array.isArray(policyMutationEvidence)?policyMutationEvidence:[]).map(row=>[text(row?.generationId,200),row]));
  if(chain.ok){
    for(let i=1;i<chain.generations.length;i+=1){
      const prev=chain.generations[i-1],cur=chain.generations[i];
      const ancestors=chain.generations.slice(0,i);
      const ancestorBuilders=new Set(ancestors.flatMap(g=>[g.proposerId,g.deployerId]).filter(Boolean));
      if(ancestorBuilders.has(cur.verifierId)) reasons.push(`ancestor-builder-cannot-verify-descendant:${cur.generationId}`);
      if(ancestorBuilders.has(cur.monitorId)) reasons.push(`ancestor-builder-cannot-monitor-descendant:${cur.generationId}`);

      if(cur.policyDigest===prev.policyDigest) continue;
      const ev=evidenceByGeneration.get(cur.generationId);
      if(!ev) { reasons.push(`security-policy-mutation-evidence-required:${cur.generationId}`); continue; }
      if(ev.admissionSubjectDigest!==admission.subjectDigest) reasons.push(`security-policy-mutation-admission-binding-mismatch:${cur.generationId}`);
      if(ev.fromPolicyDigest!==prev.policyDigest||ev.toPolicyDigest!==cur.policyDigest) reasons.push(`security-policy-mutation-digest-transition-mismatch:${cur.generationId}`);
      if(ev.explicitlyAuthorized!==true||!text(ev.authorityRef,500)) reasons.push(`security-policy-mutation-explicit-authority-required:${cur.generationId}`);
      const verifier=text(ev.independentVerifierId,200);
      const buildAndApprovalLineage=new Set(chain.generations.slice(0,i+1).flatMap(g=>[g.proposerId,g.approverId,g.deployerId]).filter(Boolean));
      if(!verifier||buildAndApprovalLineage.has(verifier)) reasons.push(`security-policy-mutation-independent-verifier-required:${cur.generationId}`);
      if(ev.securityEnvelopeNotWeakened!==true) reasons.push(`security-policy-mutation-no-weaker-envelope-proof-required:${cur.generationId}`);
      if(ev.rollbackPreserved!==true||!text(ev.rollbackRef,500)) reasons.push(`security-policy-mutation-rollback-proof-required:${cur.generationId}`);
      if(!text(ev.evidenceRef,500)||!text(ev.immutableRef,500)) reasons.push(`security-policy-mutation-immutable-evidence-required:${cur.generationId}`);
    }
  }
  if(reasons.length) return fail(reasons);
  const receipt={version:RECURSIVE_GOVERNANCE_SECURITY_VERSION,admissionSubjectDigest:admission.subjectDigest,chainDigest:chain.chainDigest,principalControlReceiptDigest:principalControl.receiptDigest,generationIds:chain.generations.map(g=>g.generationId),policyMutationEvidenceRefs:(policyMutationEvidence||[]).map(e=>text(e?.evidenceRef,500)).filter(Boolean),lineageSeparationChecked:true,principalCredentialCustodySeparationChecked:true,runtimeProof:'NONE__STRUCTURAL_AND_EVIDENCE_CONTRACT_ONLY'};
  return{ok:true,status:'RECURSIVE_SECURITY_EVOLUTION_ADMISSIBLE_FOR_SEPARATE_EXECUTION_AUTHORITY',receipt,receiptDigest:digest(receipt),businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),asiClaim:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',truthBoundary:'This gate prevents silent security-policy drift and gradual evaluator capture across recursive generations at both role-id and controlling-principal/credential/custody levels. It does not authorize self-modification, deployment, spend, replication, private-state access or any external effect.'};
}
