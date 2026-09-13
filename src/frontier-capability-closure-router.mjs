import crypto from 'node:crypto';

export const FRONTIER_CAPABILITY_CLOSURE_ROUTER_VERSION='uberbond.frontier-capability-closure-router.v1.2';
export const CLOSURE_CLASSES=Object.freeze(['INTERNAL_RUNTIME_EVIDENCE','INTERNAL_DEEPENING','INTENTIONALLY_GATED','EXTERNAL_OR_OWNER_ONLY','ALREADY_IMPLEMENTED']);
const text=(v,n=2000)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const arr=v=>Array.isArray(v)?v:[];
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function classify(entry={},hasIndependentRuntimeEvidence=false){
  const maturity=text(entry.maturity,80)||'UNKNOWN';
  if(maturity==='IMPLEMENTED_PRIMITIVE') return {closureClass:'ALREADY_IMPLEMENTED',ultimateBoundary:'INTERNAL_COMPLETE',reasonCodes:['implemented-primitive']};
  const note=(text(entry.note,4000)||'').toLowerCase();
  const receipts=arr(entry.runtimeReceipts).filter(Boolean);
  const hasRuntimeEvidence=receipts.length>0||hasIndependentRuntimeEvidence;

  const gated=/intentionally (disabled|gated)|cannot create or widen|no autonomous canonical rewrite|founder-only|human-only/.test(note);
  const external=/external activation|economic proof|market truth|real demand|customer|provider|payment|legal instrument|legal or market institution|external evidence|real-world|physical-world|independent evidence/.test(note);
  const deeper=/not yet implemented|future work|future research|incomplete|remains future|full co-evolution|self-rewriting|autonomous rival implementation|general world-model|stronger causal identification|full civilization dynamics|richer .* semantics|full company compiler semantics|broader/.test(note);
  const ultimateBoundary=gated?'INTENTIONALLY_GATED':external?'EXTERNAL_OR_OWNER_ONLY':deeper?'INTERNAL_DEEPENING':'INTERNAL_COMPLETE_AFTER_RUNTIME_EVIDENCE';

  if(gated) return {closureClass:'INTENTIONALLY_GATED',ultimateBoundary,reasonCodes:['explicit-safety-or-authority-gate']};
  if(deeper) return {closureClass:'INTERNAL_DEEPENING',ultimateBoundary,reasonCodes:['explicit-capability-depth-gap']};
  if(!hasRuntimeEvidence) return {closureClass:'INTERNAL_RUNTIME_EVIDENCE',ultimateBoundary,reasonCodes:['runtime-receipt-not-yet-bound']};
  if(external) return {closureClass:'EXTERNAL_OR_OWNER_ONLY',ultimateBoundary,reasonCodes:['internal-runtime-evidence-present__maturity-now-requires-external-reality']};
  return {closureClass:'ALREADY_IMPLEMENTED',ultimateBoundary:'INTERNAL_COMPLETE',reasonCodes:['bounded-primitive-and-independent-runtime-evidence-present']};
}

export function routeFrontierCapabilityClosures({entries=[],runtimeEvidenceCapabilityIds=[]}={}){
  const independentRuntime=new Set(arr(runtimeEvidenceCapabilityIds).map(v=>String(v)));
  const routed=[];
  for(const raw of arr(entries)){
    const id=text(raw?.id,160)||String(raw?.id??'').trim();
    const name=text(raw?.name,500);
    if(!id||!name) continue;
    const independentRuntimeEvidenceBound=independentRuntime.has(id);
    const verdict=classify(raw,independentRuntimeEvidenceBound);
    routed.push({id,name,maturity:text(raw.maturity,80)||'UNKNOWN',status:text(raw.status,120)||null,sources:arr(raw.sources).map(v=>text(v,1000)).filter(Boolean),tests:arr(raw.tests).map(v=>text(v,1000)).filter(Boolean),runtimeReceipts:arr(raw.runtimeReceipts).map(v=>text(v,1000)).filter(Boolean),independentRuntimeEvidenceBound,note:text(raw.note,4000)||null,...verdict,classificationConfidence:'HEURISTIC_FROM_EXPLICIT_MATURITY_EVIDENCE__REQUIRES_HUMAN_OR_INDEPENDENT_REVIEW_BEFORE_CANONICAL_MATURITY_PROMOTION'});
  }
  const counts=Object.fromEntries(CLOSURE_CLASSES.map(c=>[c,routed.filter(r=>r.closureClass===c).length]));
  const queues={
    internalRuntimeEvidence:routed.filter(r=>r.closureClass==='INTERNAL_RUNTIME_EVIDENCE'),
    internalDeepening:routed.filter(r=>r.closureClass==='INTERNAL_DEEPENING'),
    intentionallyGated:routed.filter(r=>r.closureClass==='INTENTIONALLY_GATED'),
    externalOrOwnerOnly:routed.filter(r=>r.closureClass==='EXTERNAL_OR_OWNER_ONLY'),
    internallySatisfied:routed.filter(r=>r.closureClass==='ALREADY_IMPLEMENTED')
  };
  const ultimateCounts={};for(const row of routed)ultimateCounts[row.ultimateBoundary]=(ultimateCounts[row.ultimateBoundary]||0)+1;
  const receipt={version:FRONTIER_CAPABILITY_CLOSURE_ROUTER_VERSION,total:routed.length,counts,ultimateCounts,independentRuntimeEvidenceCount:routed.filter(r=>r.independentRuntimeEvidenceBound).length,queuesDigest:`sha256:${hash(Object.fromEntries(Object.entries(queues).map(([k,v])=>[k,v.map(r=>r.id)])))}`};
  return{ok:true,status:'FRONTIER_CAPABILITY_CLOSURE_ROUTED',...receipt,routed,queues,truthBoundary:'ROUTING_AND INDEPENDENT_RUNTIME_EVIDENCE DO NOT MUTATE CANONICAL MATURITY, CREATE EXTERNAL PROOF, OR WIDEN AUTHORITY',externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}
