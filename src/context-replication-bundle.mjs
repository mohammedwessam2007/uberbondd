import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { verifyBrainstateIntegrity } from './sovereign-context-fabric.mjs';
import { verifyCognitiveJournalSegments } from './cognitive-journal-segments.mjs';
import { compileContextSchemaCompatibility } from './context-schema-compatibility.mjs';

export const CONTEXT_REPLICATION_BUNDLE_POLICY_VERSION='context-replication-bundle-1.1.0';
export const CONTEXT_REPLICATION_BUNDLE_SCHEMA='uberbond.context-replication-bundle.v1';
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function fail(reasonCodes,status='CONTEXT_REPLICATION_BUNDLE_REFUSED',extra={}){return{ok:false,policyVersion:CONTEXT_REPLICATION_BUNDLE_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function payload(bundle={}){const{bundleId:_ignored,...rest}=bundle;return rest;}

export function compileContextReplicationBundle({brainstate,manifest,segments}={}){
  const brain=verifyBrainstateIntegrity(brainstate);if(!brain.ok)return fail(['verified-brainstate-required',...(brain.reasonCodes||[])]);
  const journal=verifyCognitiveJournalSegments({manifest,segments});if(!journal.ok)return fail(['verified-segmented-journal-required',...(journal.reasonCodes||[])]);
  const schemas={brainstate:brainstate?.schemaVersion,journalManifest:manifest?.schemaVersion,replicationBundle:CONTEXT_REPLICATION_BUNDLE_SCHEMA};
  if(Array.isArray(segments)&&segments.length)schemas.journalSegment=segments[0]?.schemaVersion;
  const compatibility=compileContextSchemaCompatibility({contextAbiVersion:brainstate?.contextAbiVersion,schemas});
  if(!compatibility.ok)return fail(['context-schema-compatibility-required',...(compatibility.reasonCodes||[])]);
  if(!SHA40.test(String(brainstate.sourceCommit||''))||!SHA64.test(String(brainstate.brainstateId||''))||!SHA64.test(String(manifest.manifestId||'')))return fail(['exact-replication-identities-required']);
  const bundle={schemaVersion:CONTEXT_REPLICATION_BUNDLE_SCHEMA,sourceCommit:brainstate.sourceCommit,brainstateId:brainstate.brainstateId,contextAbiVersion:brainstate.contextAbiVersion,journalManifestId:manifest.manifestId,journalTipDigest:journal.journalTipDigest,totalJournalEntries:journal.totalEntries,segmentCount:journal.segmentCount,lastSegmentDigest:manifest.lastSegmentDigest,consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
  bundle.bundleId=digest(payload(bundle));
  return{ok:true,policyVersion:CONTEXT_REPLICATION_BUNDLE_POLICY_VERSION,status:'CONTEXT_REPLICATION_BUNDLE_READY',bundle,schemaCompatibility:compatibility.receipt,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function verifyContextReplicationBundle(bundle,{brainstate,manifest,segments,expectedSourceCommit=null,currentBundle=null}={}){
  if(!bundle||typeof bundle!=='object'||Array.isArray(bundle)||bundle.schemaVersion!==CONTEXT_REPLICATION_BUNDLE_SCHEMA)return fail(['canonical-context-replication-bundle-required'],'CONTEXT_REPLICATION_BUNDLE_INVALID');
  if(!SHA64.test(String(bundle.bundleId||''))||bundle.bundleId!==digest(payload(bundle)))return fail(['context-replication-bundle-digest-mismatch'],'CONTEXT_REPLICATION_BUNDLE_INVALID');
  if(bundle.consequenceAuthority!=='NONE'||bundle.businessEffectAuthority!=='NONE'||bundle.externalEffectAuthority!=='NONE')return fail(['zero-replication-bundle-authority-required'],'CONTEXT_REPLICATION_BUNDLE_INVALID');
  const compiled=compileContextReplicationBundle({brainstate,manifest,segments});if(!compiled.ok)return fail(['replication-bundle-components-invalid',...(compiled.reasonCodes||[])],'CONTEXT_REPLICATION_BUNDLE_INVALID');
  if(compiled.bundle.bundleId!==bundle.bundleId)return fail(['replication-bundle-component-binding-mismatch'],'CONTEXT_REPLICATION_BUNDLE_INVALID');
  if(expectedSourceCommit&&bundle.sourceCommit!==String(expectedSourceCommit).toLowerCase())return fail(['replication-bundle-source-mismatch'],'CONTEXT_REPLICATION_BUNDLE_INVALID');
  if(currentBundle){
    if(!currentBundle||typeof currentBundle!=='object'||currentBundle.schemaVersion!==CONTEXT_REPLICATION_BUNDLE_SCHEMA||!SHA64.test(String(currentBundle.bundleId||''))||currentBundle.bundleId!==digest(payload(currentBundle)))return fail(['valid-current-bundle-required-for-rollback-check'],'CONTEXT_REPLICATION_BUNDLE_INVALID');
    if(currentBundle.sourceCommit===bundle.sourceCommit&&bundle.totalJournalEntries<currentBundle.totalJournalEntries)return fail(['same-source-journal-rollback-refused'],'CONTEXT_REPLICATION_BUNDLE_ROLLBACK_REFUSED');
    if(currentBundle.sourceCommit===bundle.sourceCommit&&bundle.totalJournalEntries===currentBundle.totalJournalEntries&&bundle.journalTipDigest!==currentBundle.journalTipDigest)return fail(['same-source-equal-height-fork-refused'],'CONTEXT_REPLICATION_BUNDLE_FORK_REFUSED');
  }
  return{ok:true,policyVersion:CONTEXT_REPLICATION_BUNDLE_POLICY_VERSION,status:'CONTEXT_REPLICATION_BUNDLE_VERIFIED',bundleId:bundle.bundleId,sourceCommit:bundle.sourceCommit,brainstateId:bundle.brainstateId,journalManifestId:bundle.journalManifestId,journalTipDigest:bundle.journalTipDigest,totalJournalEntries:bundle.totalJournalEntries,segmentCount:bundle.segmentCount,schemaCompatibility:compiled.schemaCompatibility,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'This proves internal integrity, exact registered schema compatibility, and component binding. Remote host identity, transport authenticity, and source-commit ancestry remain separate evidence requirements.'};
}
