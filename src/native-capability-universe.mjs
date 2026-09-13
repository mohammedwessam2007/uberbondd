import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { inspectNativeCapabilityMarket } from './native-capability-market.mjs';
import { inspectNativeFrontierCapabilityMarket } from './native-frontier-capability-market.mjs';

export const NATIVE_CAPABILITY_UNIVERSE_VERSION='uberbond.native-capability-universe.v1';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

export function inspectNativeCapabilityUniverse(options={}){
  const core=inspectNativeCapabilityMarket(options);
  const frontier=inspectNativeFrontierCapabilityMarket(options);
  const capabilities=[...(core.capabilities||[]),...(frontier.capabilities||[])];
  const ids=capabilities.map(x=>x.id);const atoms=capabilities.map(x=>x.atomId);
  const duplicateIds=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
  const duplicateAtoms=[...new Set(atoms.filter((id,i)=>atoms.indexOf(id)!==i))];
  const failures=[...(core.failures||[]),...(frontier.failures||[])];
  const ok=core.ok===true&&frontier.ok===true&&duplicateIds.length===0&&duplicateAtoms.length===0;
  return envelope({ok,status:ok?'NATIVE_CAPABILITY_UNIVERSE_ACTIVE':'NATIVE_CAPABILITY_UNIVERSE_DEGRADED',state:{marketCount:2,total:capabilities.length,active:capabilities.length,failed:failures.length,capabilityIds:[...ids].sort(),atomIds:[...atoms].sort()},capabilities,failures,duplicateIds,duplicateAtoms,universeDigest:hash(capabilities.map(x=>[x.id,x.atomId,x.sourceHash,x.verification?.sandbox?.probeDigest])),truthBoundary:'FIRST_PARTY_ZERO_EFFECT_CAPABILITIES_ONLY__DOES_NOT_SUBSTITUTE_FOR_THIRD_PARTY_SECURITY_REVIEW_HOST_RUNTIME_OR_EXTERNAL_REALITY'});
}

export function routeNativeCapability({mission='',requiredAtomIds=[],universe}={}){
  const snapshot=universe||inspectNativeCapabilityUniverse();if(!snapshot.ok)return snapshot;
  const required=new Set((Array.isArray(requiredAtomIds)?requiredAtomIds:[]).map(String));
  const tokens=new Set(String(mission).toLowerCase().match(/[a-z0-9-]{2,}/g)||[]);
  const results=snapshot.capabilities.map(cap=>{let lexical=0;const blob=`${cap.id} ${cap.atomId} ${cap.taskClass} ${cap.description||''}`.toLowerCase();for(const token of tokens)if(blob.includes(token))lexical+=1;return{capability:cap,score:(required.has(cap.atomId)?100:0)+lexical};}).filter(row=>required.size===0||required.has(row.capability.atomId)).sort((a,b)=>b.score-a.score||a.capability.id.localeCompare(b.capability.id));
  const covered=new Set(results.map(r=>r.capability.atomId));const missing=[...required].filter(id=>!covered.has(id)).sort();
  return envelope({ok:missing.length===0,status:missing.length?'NATIVE_CAPABILITY_GAP':'NATIVE_CAPABILITY_ROUTE_READY',results,missingAtomIds:missing,routeDigest:hash(results.map(r=>[r.capability.id,r.capability.sourceHash,r.score]))});
}
