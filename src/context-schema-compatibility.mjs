import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONTEXT_SCHEMA_COMPATIBILITY_POLICY_VERSION='context-schema-compatibility-1.0.0';
export const CONTEXT_SCHEMA_COMPATIBILITY_RECEIPT_SCHEMA='uberbond.context-schema-compatibility.v1';
export const CONTEXT_SCHEMA_REGISTRY=Object.freeze({
  contextAbi:['uberbond.context-abi.v1'],
  brainstate:['uberbond.brainstate-capsule.v1'],
  cognitiveEvent:['uberbond.cognitive-event.v1'],
  journalEntry:['uberbond.cognitive-journal-entry.v1'],
  journalSegment:['uberbond.cognitive-journal-segment.v1'],
  journalManifest:['uberbond.cognitive-journal-manifest.v1'],
  contextMount:['uberbond.context-mount.v1'],
  contextProjection:['uberbond.context-projection.v1'],
  contextTaskBinding:['uberbond.context-task-binding.v1'],
  replicationBundle:['uberbond.context-replication-bundle.v1']
});
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function fail(reasonCodes,status='CONTEXT_SCHEMA_COMPATIBILITY_REFUSED',extra={}){return{ok:false,policyVersion:CONTEXT_SCHEMA_COMPATIBILITY_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function payload(receipt={}){const{receiptId:_ignored,...rest}=receipt;return rest;}

export function compileContextSchemaCompatibility({contextAbiVersion,schemas={}}={}){
  const abi=String(contextAbiVersion||'');const reasons=[];const observed={};
  if(!CONTEXT_SCHEMA_REGISTRY.contextAbi.includes(abi))reasons.push('unsupported-context-abi');
  for(const [surface,value] of Object.entries(schemas||{})){
    if(!Object.hasOwn(CONTEXT_SCHEMA_REGISTRY,surface)||surface==='contextAbi'){reasons.push(`unknown-context-schema-surface:${surface}`);continue;}
    const version=String(value||'');observed[surface]=version;
    if(!CONTEXT_SCHEMA_REGISTRY[surface].includes(version))reasons.push(`unsupported-context-schema:${surface}`);
  }
  if(reasons.length)return fail(reasons,'CONTEXT_SCHEMA_INCOMPATIBLE',{contextAbiVersion:abi,observedSchemas:observed});
  const receipt={schemaVersion:CONTEXT_SCHEMA_COMPATIBILITY_RECEIPT_SCHEMA,contextAbiVersion:abi,observedSchemas:Object.fromEntries(Object.entries(observed).sort(([a],[b])=>a.localeCompare(b))),compatibilityMode:'EXACT_REGISTERED_SCHEMA_ONLY',migrationApplied:false,consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
  receipt.receiptId=digest(payload(receipt));
  return{ok:true,policyVersion:CONTEXT_SCHEMA_COMPATIBILITY_POLICY_VERSION,status:'CONTEXT_SCHEMA_COMPATIBLE',receipt,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'Only exact registered schema versions are admitted. Unknown legacy or future versions require an explicit separately tested migration and are never guessed compatible.'};
}
