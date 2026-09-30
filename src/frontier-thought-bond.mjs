import { semanticHash, canonicalSemanticJson, validateSemanticContext } from './semantic-closure-kernel.mjs';

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>canonicalSemanticJson(a)===canonicalSemanticJson(b);

export const thoughtBondAuthorityId=slotHash=>{
  if(!digest(slotHash))throw new Error('thought-bond-slot-hash-required');
  return 'thought-bond:'+slotHash;
};

export function thoughtBondSlotHash(cut){
  if(!plain(cut)||!plain(cut.context))throw new Error('complete-proof-cut-required');
  return semanticHash({
    obligation:cut.obligation,
    scope:cut.context.scope,
    qualityContractHash:cut.context.qualityContractHash,
    crownRevision:cut.context.crownRevision,
    sourceHashes:cut.context.sourceHashes,
    invalidators:cut.context.invalidators,
    requiredClaimIds:cut.context.requiredClaimIds
  });
}

export function mintFrontierThoughtBond({cut,crownObservation,observationTrustPin,expiresAt,now=Date.now()}={}){
  const fail=reason=>({ok:false,status:'FRONTIER_THOUGHT_BOND_REFUSED',reasons:[reason],semanticAuthority:'NONE'});
  try{
    if(!plain(cut)||!plain(cut.context)||validateSemanticContext(cut.context,now).length)throw new Error('complete-current-proof-cut-required');
    const cutHash=semanticHash(cut);
    if(!plain(crownObservation)||!digest(observationTrustPin)||semanticHash(crownObservation)!==observationTrustPin)throw new Error('trusted-crown-observation-required');
    if(crownObservation.semanticAuthority!=='CURRENT_TASK_CLASS_CROWN'||crownObservation.exactModelId!=='anthropic/claude-opus-5.5')throw new Error('current-opus-5-5-authority-required');
    if(crownObservation.cutHash!==cutHash||crownObservation.scope!==cut.context.scope||
       crownObservation.qualityContractHash!==cut.context.qualityContractHash||
       crownObservation.crownRevision!==cut.context.crownRevision)throw new Error('crown-observation-cut-contract-mismatch');
    if(!same(crownObservation.sourceHashes,cut.context.sourceHashes)||!same(crownObservation.invalidators,cut.context.invalidators))throw new Error('crown-observation-dependency-drift');
    if(typeof crownObservation.providerReceiptRef!=='string'||!crownObservation.providerReceiptRef)throw new Error('provider-receipt-required');
    if(!Number.isFinite(Date.parse(crownObservation.observedAt))||Date.parse(crownObservation.observedAt)>now)throw new Error('valid-observation-time-required');
    const expiry=Date.parse(expiresAt);if(!Number.isFinite(expiry)||expiry<=now)throw new Error('future-bond-expiry-required');

    const record={
      id:thoughtBondAuthorityId(thoughtBondSlotHash(cut)),kind:'CROWN',status:'ACTIVE',
      scope:cut.context.scope,qualityContractHash:cut.context.qualityContractHash,
      crownRevision:cut.context.crownRevision,verifiedAt:crownObservation.observedAt,expiresAt,
      sourceHashes:structuredClone(cut.context.sourceHashes),
      invalidators:Object.keys(cut.context.invalidators).sort(),
      evidenceRef:crownObservation.providerReceiptRef,
      value:structuredClone(crownObservation.value)
    };
    const bond={
      schemaVersion:'uberbond.frontier-thought-bond.v1',cutHash,
      cut:structuredClone(cut),crownObservation:structuredClone(crownObservation),
      observationTrustPin,record,recordHash:semanticHash(record),createdAt:new Date(now).toISOString()
    };
    bond.bondHash=semanticHash({...bond,bondHash:undefined});
    return {ok:true,status:'FRONTIER_THOUGHT_BOND_MINTED',bond,semanticAuthority:'CURRENT_TASK_CLASS_CROWN_BOUND_TO_EXACT_CUT',externalEffectAuthority:'NONE'};
  }catch(error){return fail(String(error?.message||error));}
}

export function verifyFrontierThoughtBond({bond,now=Date.now()}={}){
  try{
    if(bond?.schemaVersion!=='uberbond.frontier-thought-bond.v1'||bond.bondHash!==semanticHash({...bond,bondHash:undefined}))throw new Error('untampered-thought-bond-required');
    const minted=mintFrontierThoughtBond({
      cut:bond.cut,crownObservation:bond.crownObservation,observationTrustPin:bond.observationTrustPin,
      expiresAt:bond.record.expiresAt,now
    });
    if(!minted.ok||minted.bond.recordHash!==bond.recordHash||!same(minted.bond.record,bond.record))throw new Error('thought-bond-reverification-failed');
    return {ok:true,status:'FRONTIER_THOUGHT_BOND_VERIFIED',cutHash:bond.cutHash,authorityId:bond.record.id,record:structuredClone(bond.record),semanticAuthority:'CURRENT_TASK_CLASS_CROWN_BOUND_TO_EXACT_CUT'};
  }catch(error){return {ok:false,status:'FRONTIER_THOUGHT_BOND_REFUSED',reasons:[String(error?.message||error)],semanticAuthority:'NONE'};}
}

export function verifyDistinctThoughtBondConsumers({bond,consumers,now=Date.now()}={}){
  const verified=verifyFrontierThoughtBond({bond,now});if(!verified.ok)return verified;
  if(!Array.isArray(consumers)||!consumers.length||consumers.length>100000)throw new Error('bounded-consumers-required');
  const ids=new Set();
  for(const c of consumers){
    if(!plain(c)||typeof c.consumerId!=='string'||!c.consumerId||ids.has(c.consumerId)||c.cutHash!==bond.cutHash)throw new Error('distinct-exact-cut-consumers-required');
    ids.add(c.consumerId);
  }
  return {ok:true,status:'THOUGHT_BOND_FANOUT_VERIFIED',consumerCount:ids.size,uniqueConsumers:ids.size,
    crownObservationsRequired:1,providerCallsPerformed:0,frontierLeafCompressionFactor:ids.size,
    semanticAuthority:'CURRENT_TASK_CLASS_CROWN_BOUND_TO_EXACT_CUT',
    claimBoundary:'Compression factor applies to the shared frontier leaf only; each consumer still requires independent enclosing proof closure.'};
}

export function modelThoughtBondFanout({consumerCount,crownUnitUsd}={}){
  if(!Number.isSafeInteger(consumerCount)||consumerCount<1||!Number.isFinite(crownUnitUsd)||crownUnitUsd<=0)throw new Error('positive-fanout-model-inputs-required');
  return {status:'THOUGHT_BOND_FRONTIER_LEAF_CAPACITY_MODEL_ONLY',consumerCount,crownUnitUsd,
    naiveCrownUsd:consumerCount*crownUnitUsd,coalescedCrownUsd:crownUnitUsd,multiplier:consumerCount,
    avoidedCrownUsd:(consumerCount-1)*crownUnitUsd,
    claimBoundary:'Frontier-leaf economics only; not an end-to-end task multiplier.'};
}
