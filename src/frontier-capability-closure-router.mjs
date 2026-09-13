import crypto from 'node:crypto';

export const FRONTIER_CAPABILITY_CLOSURE_ROUTER_VERSION='uberbond.frontier-capability-closure-router.v1';
export const CLOSURE_CLASSES=Object.freeze(['INTERNAL_RUNTIME_EVIDENCE','INTERNAL_DEEPENING','INTENTIONALLY_GATED','EXTERNAL_OR_OWNER_ONLY','ALREADY_IMPLEMENTED']);
const text=(v,n=2000)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const arr=v=>Array.isArray(v)?v:[];
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function classify(entry={}){
  const maturity=text(entry.maturity,80)||'UNKNOWN';
  if(maturity==='IMPLEMENTED_PRIMITIVE') return {closureClass:'ALREADY_IMPLEMENTED',reasonCodes:['implemented-primitive']};
  const note=(text(entry.note,4000)||'').toLowerCase();
  const receipts=arr(entry.runtimeReceipts).filter(Boolean);
  const status=text(entry.status,120)||null;

  const gated=/intentionally (disabled|gated)|authority remains|cannot create or widen|no autonomous canonical rewrite|founder-only|human-only/.test(note);
  if(gated) return {closureClass:'INTENTIONALLY_GATED',reasonCodes:['explicit-safety-or-authority-gate']};

  const external=/external activation|economic proof|market truth|real demand|customer|provider|payment|legal instrument|legal or market institution|external evidence|real-world|physical-world|independent evidence/.test(note);
  if(external) return {closureClass:'EXTERNAL_OR_OWNER_ONLY',reasonCodes:['maturity-requires-external-reality']};

  const deeper=/not yet implemented|future work|future research|incomplete|remains future|full co-evolution|self-rewriting|autonomous rival implementation|general world-model|stronger causal identification|full civilization dynamics|richer .* semantics|full company compiler semantics|broader/.test(note);
  if(deeper) return {closureClass:'INTERNAL_DEEPENING',reasonCodes:['explicit-capability-depth-gap']};

  if(receipts.length===0 || status==='SOURCE_AND_TEST_PRESENT') return {closureClass:'INTERNAL_RUNTIME_EVIDENCE',reasonCodes:['runtime-receipt-not-yet-bound']};
  return {closureClass:'INTERNAL_DEEPENING',reasonCodes:['partial-primitive-with-runtime-receipt-still-needs-depth']};
}

export function routeFrontierCapabilityClosures({entries=[]}={}){
  const routed=[];
  for(const raw of arr(entries)){
    const id=text(raw?.id,160)||String(raw?.id??'').trim();
    const name=text(raw?.name,500);
    if(!id||!name) continue;
    const verdict=classify(raw);
    routed.push({id,name,maturity:text(raw.maturity,80)||'UNKNOWN',status:text(raw.status,120)||null,sources:arr(raw.sources).map(v=>text(v,1000)).filter(Boolean),tests:arr(raw.tests).map(v=>text(v,1000)).filter(Boolean),runtimeReceipts:arr(raw.runtimeReceipts).map(v=>text(v,1000)).filter(Boolean),note:text(raw.note,4000)||null,...verdict,classificationConfidence:'HEURISTIC_FROM_EXPLICIT_MATURITY_EVIDENCE__REQUIRES_HUMAN_OR_INDEPENDENT_REVIEW_BEFORE_PROMOTION'});
  }
  const counts=Object.fromEntries(CLOSURE_CLASSES.map(c=>[c,routed.filter(r=>r.closureClass===c).length]));
  const queues={
    internalRuntimeEvidence:routed.filter(r=>r.closureClass==='INTERNAL_RUNTIME_EVIDENCE'),
    internalDeepening:routed.filter(r=>r.closureClass==='INTERNAL_DEEPENING'),
    intentionallyGated:routed.filter(r=>r.closureClass==='INTENTIONALLY_GATED'),
    externalOrOwnerOnly:routed.filter(r=>r.closureClass==='EXTERNAL_OR_OWNER_ONLY')
  };
  const receipt={version:FRONTIER_CAPABILITY_CLOSURE_ROUTER_VERSION,total:routed.length,counts,queuesDigest:`sha256:${hash(Object.fromEntries(Object.entries(queues).map(([k,v])=>[k,v.map(r=>r.id)])))}`};
  return{ok:true,status:'FRONTIER_CAPABILITY_CLOSURE_ROUTED',...receipt,routed,queues,truthBoundary:'HEURISTIC_ROUTING_ONLY__DOES_NOT_PROMOTE_MATURITY_CREATE_EXTERNAL_PROOF_OR_WIDEN_AUTHORITY',externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}
