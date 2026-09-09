import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { recomputeExecutionLeafGraphDigest } from './execution-leaf-graph-receipt-digest.mjs';

export const FINITE_CLOSURE_TRIBUNAL_VERSION='uberbond.finite-closure-tribunal.v1';
const SHA40=/^[0-9a-f]{40}$/;const SHA256=/^(?:sha256:)?[0-9a-f]{64}$/;
const INTERNALLY_CLOSED_STATES=new Set(['VERIFIED_CURRENT','ENFORCED_BY_CODE']);
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const uniq=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>text(x,1000)).filter(Boolean))].sort();
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex')}`;
const fail=(reasons,extra={})=>({ok:false,status:'FINITE_CLOSURE_TRIBUNAL_REFUSED',reasonCodes:[...new Set(reasons.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

function graphReasons(graph,sourceCommit){const reasons=[];if(graph?.ok!==true||graph?.status!=='ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED')reasons.push('canonical-current-execution-graph-required');if(graph?.sourceCommit!==sourceCommit)reasons.push('execution-graph-source-mismatch');if(Number(graph?.counts?.orphanRequirements)!==0)reasons.push('zero-orphan-graph-required');if(Number(graph?.counts?.floatingLeaves)!==0)reasons.push('zero-floating-graph-required');if(Number(graph?.counts?.dependencyCycles)!==0)reasons.push('acyclic-graph-required');if(!SHA256.test(String(graph?.graphDigest||''))||graph.graphDigest!==recomputeExecutionLeafGraphDigest(graph))reasons.push('execution-graph-integrity-required');return reasons;}
function externalStatus(value,allowed){return allowed.includes(String(value||''))?String(value):'NOT_MEASURED';}

export function compileFiniteClosureTribunal({
  truthReceipt=null,semanticTribunal=null,executionGraph=null,continuationProof=null,
  sinkAuthorityReport=null,recursiveGovernanceReport=null,cutSetReport=null,
  namedRuntimeStatus='NOT_MEASURED',observedAutonomyStatus='NOT_MEASURED',externalCommercialStatus='NOT_MEASURED',personalRealityStatus='NOT_MEASURED',asiEvidenceStatus='SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',openEndedFrontierStatus='OPEN'
}={}){
  const reasons=[];
  const sourceCommit=String(truthReceipt?.headSha||'').toLowerCase();
  if(truthReceipt?.ok!==true||truthReceipt?.status!=='CURRENT_TRUTH_AND_ZERO_ORPHAN_GRAPH_REGENERATED_FOR_EXACT_SOURCE_HEAD'||!SHA40.test(sourceCommit))reasons.push('exact-current-truth-receipt-required');
  if(semanticTribunal?.ok!==true||semanticTribunal?.status!=='SEMANTIC_ZERO_ORPHAN_REQUIREMENTS_VERIFIED')reasons.push('semantic-zero-orphan-tribunal-required');
  if(semanticTribunal?.sourceCommit!==sourceCommit)reasons.push('semantic-tribunal-source-mismatch');
  reasons.push(...graphReasons(executionGraph,sourceCommit));
  if(continuationProof?.ok!==true||!['EXECUTION_LEAF_CONTINUATION_READY','EXECUTION_LEAF_CONTINUATION_RESUME_READY','EXECUTION_LEAF_CONTINUATION_CHECKPOINT_READY'].includes(continuationProof?.status))reasons.push('canonical-graph-continuation-composition-proof-required');
  if(sinkAuthorityReport?.ok!==true||sinkAuthorityReport?.status!=='ALL_DECLARED_EFFECT_SINKS_AUTHORITY_BOUND')reasons.push('all-effect-sinks-must-enforce-exact-composed-authority');
  if(recursiveGovernanceReport?.ok!==true||recursiveGovernanceReport?.status!=='RECURSIVE_GOVERNANCE_PRINCIPAL_CONTROL_VERIFIED')reasons.push('principal-level-recursive-governance-proof-required');
  if(cutSetReport?.ok!==true||cutSetReport?.status!=='SOVEREIGN_CUT_SET_AUDIT_CURRENT')reasons.push('current-cut-set-audit-required');
  if((cutSetReport?.unresolvedInternalCuts||[]).length)reasons.push('unresolved-internal-single-point-failures-remain');

  const requirements=semanticTribunal?.requirements||[];
  const finite=requirements.filter(r=>r.requirementClass==='FINITE_BEHAVIOR');
  const nonClosed=finite.filter(r=>!INTERNALLY_CLOSED_STATES.has(r.currentState));
  if(nonClosed.length)reasons.push('finite-behavior-requirements-not-source-closed');
  const evidenceToRequirements=new Map();
  for(const requirement of finite){for(const ref of [...uniq(requirement.sourceRefs),...uniq(requirement.testRefs)]){if(!evidenceToRequirements.has(ref))evidenceToRequirements.set(ref,new Set());evidenceToRequirements.get(ref).add(requirement.requirementId);}}
  const floatingEvidence=[...evidenceToRequirements].filter(([,ids])=>ids.size===0).map(([ref])=>ref);
  if(floatingEvidence.length)reasons.push('floating-closure-evidence-remains');
  const semanticIds=new Set(requirements.map(r=>r.requirementId));const graphIds=new Set((executionGraph?.requirements||[]).map(r=>r.id));
  const semanticMissingFromGraph=[...semanticIds].filter(id=>!graphIds.has(id)).sort();const graphMissingFromSemantic=[...graphIds].filter(id=>!semanticIds.has(id)).sort();
  if(semanticMissingFromGraph.length||graphMissingFromSemantic.length)reasons.push('semantic-and-execution-denominators-must-be-reciprocal');

  const finiteStatus=nonClosed.length===0&&reasons.filter(r=>!['current-cut-set-audit-required'].includes(r)).length===0?'100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE':'INCOMPLETE';
  const separatedStatus={
    FINITE_ENGINEERING_CLOSURE:finiteStatus,
    NAMED_RUNTIME_STATUS:externalStatus(namedRuntimeStatus,['NAMED_RUNTIME_VERIFIED_WITHIN_REHEARSED_SCOPE','PARTIAL','BLOCKED','NOT_MEASURED']),
    OBSERVED_AUTONOMY_STATUS:externalStatus(observedAutonomyStatus,['OBSERVED','PARTIAL','ELAPSED_EVIDENCE_PENDING','NOT_MEASURED']),
    EXTERNAL_COMMERCIAL_STATUS:externalStatus(externalCommercialStatus,['OBSERVED','PARTIAL','NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE','NOT_MEASURED']),
    PERSONAL_REALITY_STATUS:externalStatus(personalRealityStatus,['OBSERVED','PARTIAL','LONGITUDINAL_EVIDENCE_PENDING','NOT_MEASURED']),
    ASI_EVIDENCE_STATUS:text(asiEvidenceStatus,200)||'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    OPEN_ENDED_FRONTIER_STATUS:text(openEndedFrontierStatus,200)||'OPEN'
  };
  const summary={sourceCommit,finiteRequirements:finite.length,finiteClosedRequirements:finite.length-nonClosed.length,finiteOpenRequirements:nonClosed.map(r=>r.requirementId),semanticRequirements:requirements.length,semanticMissingFromGraph,graphMissingFromSemantic,floatingEvidence,separatedStatus};
  if(reasons.length)return fail(reasons,{...summary,truthBoundary:'No aggregate percentage is emitted. Finite engineering, named runtime, autonomy, commercial reality, personal reality, ASI evidence and open-ended frontier remain separate.'});
  const receipt={version:FINITE_CLOSURE_TRIBUNAL_VERSION,sourceCommit,semanticReceiptDigest:semanticTribunal.receiptDigest,executionGraphDigest:executionGraph.graphDigest,finiteRequirementIds:finite.map(r=>r.requirementId).sort(),sinkAuthorityReceiptDigest:sinkAuthorityReport.receiptDigest,recursiveGovernanceReceiptDigest:recursiveGovernanceReport.receiptDigest,cutSetReceiptDigest:cutSetReport.receiptDigest,separatedStatus};
  return{ok:true,status:'FINITE_REALIZATION_TRIBUNAL_PASSED_WITH_SEPARATE_REALITY_BOUNDARIES',...summary,receipt,receiptDigest:digest(receipt),truthBoundary:'100% may describe only the declared finite engineering denominator proven here. Runtime, elapsed, external commercial, personal reality, ASI and open-ended civilization research cannot be averaged into that number or completed by proclamation.',businessEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS)};
}
