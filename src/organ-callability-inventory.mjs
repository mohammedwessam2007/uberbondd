import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ORGAN_CALLABILITY_INVENTORY_VERSION='uberbond.organ-callability-inventory.v1';
const SHA40=/^[a-f0-9]{40}$/i;
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const uniq=values=>[...new Set((Array.isArray(values)?values:[]).map(v=>String(v||'').trim()).filter(Boolean))];
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function runtimeEvidenceFor(evidence,layerId,sourceCommit){const row=evidence?.layers?.[layerId];if(!row||row.evidenceClass!=='OBSERVED_RUNTIME'||row.sourceCommit!==sourceCommit||!row.runtimeObserved||!uniq(row.evidenceRefs).length)return null;return{runtimeObserved:true,observedAt:String(row.observedAt||''),providerIdentity:String(row.providerIdentity||''),runtimeIdentity:String(row.runtimeIdentity||''),costCents:Number.isFinite(Number(row.costCents))?Number(row.costCents):null,evidenceRefs:uniq(row.evidenceRefs)};}
export function compileOrganCallabilityInventory({sourceCommit,layers=[],sourceFacts={},runtimeEvidence=null,generatedAt=new Date()}={}){
  const source=String(sourceCommit||'').trim().toLowerCase();
  if(!SHA40.test(source))return{ok:false,status:'ORGAN_CALLABILITY_INVENTORY_REFUSED',reasonCodes:['exact-source-commit-required'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const date=generatedAt instanceof Date?generatedAt:new Date(generatedAt);if(!Number.isFinite(date.getTime()))return{ok:false,status:'ORGAN_CALLABILITY_INVENTORY_REFUSED',reasonCodes:['valid-generated-at-required'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const ids=layers.map(row=>String(row?.id||'').trim()).filter(Boolean);if(ids.length!==new Set(ids).size)return{ok:false,status:'ORGAN_CALLABILITY_INVENTORY_REFUSED',reasonCodes:['unique-layer-ids-required'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const rows=layers.map(layer=>{
    const refs=uniq(layer.sourceRefs);const facts=refs.map(ref=>({ref,...(sourceFacts[ref]||{})}));const implementation=facts.filter(row=>row.exists===true&&row.isTest!==true);
    const exists=implementation.length>0;const staticallyCallable=implementation.some(row=>row.unattendedReachable===true||row.productionReachable===true||row.operatorEntryPoint===true||row.apiEntryPoint===true);
    const classified=implementation.filter(row=>row.classification?.category).map(row=>({ref:row.ref,...row.classification}));
    const gates=uniq(classified.filter(row=>row.category==='AWAITING_ACTIVATION').map(row=>row.gate));
    const runtime=runtimeEvidenceFor(runtimeEvidence,layer.id,source);
    const state=runtime?'RUNTIME_OBSERVED':staticallyCallable?'CALLABLE_UNOBSERVED':exists&&gates.length?'EXTERNALLY_BLOCKED_OR_GATED':exists?'REGISTERED_SOURCE_ONLY':'MISSING_SOURCE';
    return{id:layer.id,role:layer.role,kind:layer.kind,stateful:layer.stateful===true,requiresRuntimeProof:layer.runtimeProof===true,sourceRefs:refs,sourceExists:exists,staticallyCallable,runtimeObserved:Boolean(runtime),runtimeEvidence:runtime,gates,classifications:classified,state,truthBoundary:runtime?'Runtime observation is admitted only from an exact-source OBSERVED_RUNTIME receipt with at least one evidence reference.':'Source presence, registry membership, tests and static reachability are not runtime observation.'};
  });
  const counts=Object.fromEntries(['MISSING_SOURCE','REGISTERED_SOURCE_ONLY','EXTERNALLY_BLOCKED_OR_GATED','CALLABLE_UNOBSERVED','RUNTIME_OBSERVED'].map(state=>[state,rows.filter(row=>row.state===state).length]));
  const result={ok:rows.every(row=>row.sourceExists),schemaVersion:ORGAN_CALLABILITY_INVENTORY_VERSION,sourceCommit:source,generatedAt:date.toISOString(),rows,counts,runtimeObserved:rows.filter(row=>row.runtimeObserved).map(row=>row.id),callableUnobserved:rows.filter(row=>row.state==='CALLABLE_UNOBSERVED').map(row=>row.id),externallyBlockedOrGated:rows.filter(row=>row.state==='EXTERNALLY_BLOCKED_OR_GATED').map(row=>row.id),registeredSourceOnly:rows.filter(row=>row.state==='REGISTERED_SOURCE_ONLY').map(row=>row.id),missingSource:rows.filter(row=>row.state==='MISSING_SOURCE').map(row=>row.id),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),truthBoundary:'This inventory separates registry/source existence, static callability, gating and exact-source runtime observation. It never promotes source or test evidence into runtime proof.'};
  result.inventoryId=digest({sourceCommit:result.sourceCommit,generatedAt:result.generatedAt,rows:result.rows.map(row=>({id:row.id,state:row.state,gates:row.gates,runtimeEvidence:row.runtimeEvidence}))});return result;
}
