import { semanticHash, canonicalSemanticJson, validateFinitePolicy } from './semantic-closure-kernel.mjs';

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>canonicalSemanticJson(a)===canonicalSemanticJson(b);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);

export function certifyExhaustiveCrownDecisionFranchise({
  domain,observations,observationTrustPins,
  taskClass,qualityContractHash,relevantKeys,crownRevision,
  sourceDependencies={},invalidators={},evidenceRef,expiresAt,now=Date.now()
}={}){
  const fail=(reason,extra={})=>({ok:false,status:'EXHAUSTIVE_CROWN_POLICY_REFUSED',reasons:[reason],semanticAuthority:'NONE',...extra});
  try{
    if(!Array.isArray(domain)||!domain.length||domain.length>4096)throw new Error('bounded-finite-domain-required');
    if(!Array.isArray(observations)||observations.length!==domain.length)throw new Error('exactly-one-observation-per-domain-state-required');
    if(!plain(observationTrustPins))throw new Error('independent-observation-trust-pins-required');
    if(typeof taskClass!=='string'||!taskClass||!digest(qualityContractHash)||typeof crownRevision!=='string'||!crownRevision)throw new Error('task-quality-crown-contract-required');
    if(!Array.isArray(relevantKeys)||!relevantKeys.length||new Set(relevantKeys).size!==relevantKeys.length)throw new Error('exact-relevant-keys-required');
    if(typeof evidenceRef!=='string'||!evidenceRef.length)throw new Error('certification-evidence-ref-required');
    const expiry=Date.parse(expiresAt);if(!Number.isFinite(expiry)||expiry<=now)throw new Error('future-expiry-required');

    const domainHashes=new Map();
    for(const state of domain){
      if(!plain(state)||!same(Object.keys(state).sort(),[...relevantKeys].sort()))throw new Error('domain-state-schema-mismatch');
      const hash=semanticHash(state);if(domainHashes.has(hash))throw new Error('duplicate-domain-state');
      domainHashes.set(hash,state);
    }

    const rows=[],seen=new Set(),receiptRefs=[];
    for(const observation of observations){
      if(!plain(observation)||typeof observation.observationId!=='string'||!observation.observationId)throw new Error('observation-id-required');
      const pin=observationTrustPins[observation.observationId];
      if(!digest(pin)||semanticHash(observation)!==pin)throw new Error('untrusted-or-mutated-crown-observation');
      if(observation.semanticAuthority!=='CURRENT_TASK_CLASS_CROWN')throw new Error('current-crown-authority-required');
      if(observation.exactModelId!=='anthropic/claude-opus-5.5')throw new Error('exact-opus-5-5-observation-required');
      if(observation.taskClass!==taskClass||observation.qualityContractHash!==qualityContractHash||observation.crownRevision!==crownRevision)throw new Error('observation-contract-drift');
      if(!digest(observation.inputHash)||observation.inputHash!==semanticHash(observation.input))throw new Error('observation-input-hash-mismatch');
      if(!digest(observation.decisionHash)||observation.decisionHash!==semanticHash(observation.decision))throw new Error('observation-decision-hash-mismatch');
      if(typeof observation.providerReceiptRef!=='string'||!observation.providerReceiptRef.length)throw new Error('provider-receipt-required');
      const stateHash=semanticHash(observation.input);
      if(!domainHashes.has(stateHash)||seen.has(stateHash))throw new Error('observation-domain-coverage-mismatch');
      seen.add(stateHash);receiptRefs.push(observation.providerReceiptRef);
      rows.push({input:structuredClone(observation.input),output:structuredClone(observation.decision)});
    }
    if(seen.size!==domainHashes.size)throw new Error('domain-not-exhaustively-observed');

    const policy={domain:structuredClone(domain),rows};validateFinitePolicy(policy);
    const spec={
      schemaVersion:'uberbond.decision-franchise.spec.v1',taskClass,
      qualityContractHash,sideEffectClass:'NONE',
      relevantKeys:structuredClone(relevantKeys),policy
    };
    const record={
      kind:'DECISION_FRANCHISE',status:'ACTIVE',id:'df:'+semanticHash(spec),spec,
      crownRevision,sourceDependencies:structuredClone(sourceDependencies),
      invalidators:structuredClone(invalidators),
      proofClass:'E3',evidenceRef,expiresAt,mintedAt:new Date(now).toISOString(),
      certification:{
        kind:'EXHAUSTIVE_CURRENT_CROWN_OBSERVATIONS',
        exactModelId:'anthropic/claude-opus-5.5',
        observedStateCount:domain.length,
        zeroMismatch:true,
        providerReceiptRefs:[...new Set(receiptRefs)].sort(),
        observationsHash:semanticHash(observations),
        domainHash:semanticHash(domain)
      }
    };
    return {
      ok:true,status:'EXHAUSTIVE_CROWN_DECISION_FRANCHISE_CERTIFIED',
      record,trustPin:semanticHash(record),proofClass:'E3',
      observedStateCount:domain.length,zeroMismatch:true,
      semanticAuthority:'CERTIFIED_BOUNDED_POLICY',
      externalEffectAuthority:'NONE',
      claimBoundary:'Exact finite domain only. No interpolation, extrapolation, statistical generalization, or authority outside the exhaustively observed states.'
    };
  }catch(error){return fail(String(error?.message||error));}
}
