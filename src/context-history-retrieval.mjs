import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { verifyCognitiveJournalEntries } from './cognitive-event-journal.mjs';
import { applyContextPrivacyView } from './context-privacy.mjs';

export const CONTEXT_HISTORY_RETRIEVAL_POLICY_VERSION = 'context-history-retrieval-1.1.0';
export const CONTEXT_MOUNT_SCHEMA_VERSION = 'uberbond.context-mount.v1';
const MAX_HISTORY = 64;

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function fail(reasonCodes, status = 'CONTEXT_HISTORY_REFUSED', extra = {}) {
  return { ok:false, policyVersion:CONTEXT_HISTORY_RETRIEVAL_POLICY_VERSION, status, reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))], businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}
function tokens(value) { return new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 3)); }
function overlap(a,b){let count=0;for(const token of a)if(b.has(token))count+=1;return count;}
function historyProjection(entry) {
  return { sequence:entry.sequence, entryDigest:entry.entryDigest, eventId:entry.eventId, kind:entry.event.kind, sourceNodeId:entry.event.sourceNodeId, subjectType:entry.event.subjectType, subjectId:entry.event.subjectId, summary:entry.event.summary, truthClass:entry.event.truthClass, observedAt:entry.event.observedAt, evidenceRefs:[...entry.event.evidenceRefs], parentEventIds:[...entry.event.parentEventIds] };
}

export function retrieveRelevantCognitiveHistory({ entries = [], mission, maxEvents = 24 } = {}) {
  const verified = verifyCognitiveJournalEntries(entries);
  if (!verified.ok) return fail(['verified-cognitive-journal-required', ...(verified.reasonCodes || [])]);
  const privacy = applyContextPrivacyView(entries);
  if (!privacy.ok) return fail(['valid-context-privacy-view-required', ...(privacy.reasonCodes || [])], 'CONTEXT_HISTORY_PRIVACY_REFUSED');
  const retrievable = privacy.visibleEntries;
  const missionText = String(mission || '').trim();
  if (!missionText || missionText.length > 4000) return fail(['bounded-mission-required']);
  const limit = Number(maxEvents);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_HISTORY) return fail(['valid-history-limit-required']);

  const missionTokens = tokens(missionText);
  const priorityKinds = new Set(['CONTRADICTION','BLOCKER','FOUNDER_DOCTRINE','DECISION_UPDATE','SESSION_HANDOFF','CONTEXT_CHECKPOINT']);
  const scored = retrievable.map((entry,index)=>{
    const event=entry.event;
    const eventTokens=tokens([event.kind,event.sourceNodeId,event.subjectType,event.subjectId,event.summary,...(event.evidenceRefs||[])].join(' '));
    const semantic=overlap(missionTokens,eventTokens);
    const priority=priorityKinds.has(event.kind)?2:0;
    const recency=retrievable.length?(index+1)/retrievable.length:0;
    return{entry,semantic,score:semantic*10+priority+recency};
  });
  const semanticMatches=scored.filter(row=>row.semantic>0);
  semanticMatches.sort((a,b)=>b.score-a.score||b.entry.sequence-a.entry.sequence);
  const selected=semanticMatches.length?semanticMatches.slice(0,limit):retrievable.slice(-Math.min(limit,6)).map(entry=>({entry,semantic:0,score:0}));
  selected.sort((a,b)=>a.entry.sequence-b.entry.sequence);

  return {
    ok:true,policyVersion:CONTEXT_HISTORY_RETRIEVAL_POLICY_VERSION,
    status:semanticMatches.length?'COGNITIVE_HISTORY_RELEVANT_SLICE_READY':'COGNITIVE_HISTORY_RECENT_FALLBACK_READY',
    mission:missionText,totalJournalEntries:entries.length,retrievableJournalEntries:privacy.retrievableJournalEntries,
    suppressedEventCount:privacy.suppressedEventIds.length,privacyDirectiveCount:privacy.privacyDirectiveEventIds.length,
    selectedCount:selected.length,journalTipDigest:verified.tipDigest,events:selected.map(row=>historyProjection(row.entry)),
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),
    truthBoundary:'Retrieval is computed from the fully verified append-only journal after founder-authorized suppression directives are applied as a view. Suppressed historical bytes are not represented as physically deleted.'
  };
}

export function compileContextMount({ doctorResult, journalEntries = [], mission = null, maxHistoricalEvents = 24, recompiledFromStale = false } = {}) {
  if (!doctorResult?.ok || doctorResult.status !== 'CONTEXT_CURRENT__MISSION_CONTEXT_READY') return fail(['current-context-doctor-result-required'],'CONTEXT_MOUNT_REFUSED');
  if (!doctorResult.capsule || !doctorResult.missionContext) return fail(['brainstate-and-mission-context-required'],'CONTEXT_MOUNT_REFUSED');
  const missionText=String(mission||doctorResult.missionContext.mission||'').trim();
  const history=retrieveRelevantCognitiveHistory({entries:journalEntries,mission:missionText,maxEvents:maxHistoricalEvents});
  if(!history.ok)return history;
  const mount={
    schemaVersion:CONTEXT_MOUNT_SCHEMA_VERSION,contextAbiVersion:doctorResult.capsule.contextAbiVersion,
    sourceCommit:doctorResult.sourceCommit,brainstateId:doctorResult.brainstateId,contextIdentityDigest:doctorResult.contextIdentityDigest,
    missionContextId:doctorResult.missionContext.missionContextId,mission:missionText,recompiledFromStale:recompiledFromStale===true,
    brainstate:doctorResult.capsule,missionContext:doctorResult.missionContext,
    cognitiveHistory:{retrievalStatus:history.status,totalJournalEntries:history.totalJournalEntries,retrievableJournalEntries:history.retrievableJournalEntries,suppressedEventCount:history.suppressedEventCount,privacyDirectiveCount:history.privacyDirectiveCount,selectedCount:history.selectedCount,journalTipDigest:history.journalTipDigest,events:history.events},
    laws:{zeroRetelling:doctorResult.capsule.laws.zeroRetellingLaw,staleContext:doctorResult.capsule.laws.staleContextLaw,capabilityNeverCreatesAuthority:true},
    businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'
  };
  mount.contextMountId=digest(mount);
  return{ok:true,policyVersion:CONTEXT_HISTORY_RETRIEVAL_POLICY_VERSION,status:recompiledFromStale?'CONTEXT_MOUNT_READY__STALE_CACHE_RECOMPILED':'CONTEXT_MOUNT_READY',mount,externalEffectLedger:zeroEffects()};
}
