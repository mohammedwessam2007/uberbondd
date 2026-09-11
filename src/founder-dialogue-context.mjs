import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FOUNDER_DIALOGUE_CONTEXT_POLICY_VERSION = 'founder-dialogue-context-1.0.0';
export const FOUNDER_DIALOGUE_CONTEXT_SCHEMA_VERSION = 'uberbond.founder-dialogue-context.v1';

const MAX_HISTORY = 12;
const MAX_INITIATIVES = 16;
const MAX_BLOCKERS = 12;
const MAX_NEXT = 12;

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function text(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function boundedStrings(values, maxItems, maxText) {
  if (!Array.isArray(values) || values.length > 256) return null;
  const out = [];
  for (const value of values.slice(0, maxItems)) {
    const normalized = text(value, maxText);
    if (!normalized) return null;
    out.push(normalized);
  }
  return out;
}

function fail(reasonCodes, status = 'FOUNDER_DIALOGUE_CONTEXT_REFUSED') {
  return {
    ok: false,
    policyVersion: FOUNDER_DIALOGUE_CONTEXT_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileFounderDialogueContext({ mountResult, maxHistory = 8 } = {}) {
  if (!mountResult?.ok || !String(mountResult.status || '').startsWith('CONTEXT_MOUNT_READY')) {
    return fail(['current-context-mount-required']);
  }
  const mount = mountResult.mount;
  if (!mount || typeof mount !== 'object' || Array.isArray(mount)) return fail(['context-mount-object-required']);
  const limit = Number(maxHistory);
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_HISTORY) return fail(['valid-history-limit-required']);

  const objective = text(mount.brainstate?.objective, 5000);
  const economicNorthStar = text(mount.brainstate?.economicNorthStar, 2000);
  const mission = text(mount.mission, 4000);
  const activeMission = text(mount.brainstate?.frontier?.activeMission, 4000);
  const blockers = boundedStrings(mount.brainstate?.frontier?.blockers || [], MAX_BLOCKERS, 1800);
  const nextActions = boundedStrings(mount.brainstate?.frontier?.nextActions || [], MAX_NEXT, 1800);
  const relevantInitiatives = Array.isArray(mount.missionContext?.relevantInitiatives)
    ? mount.missionContext.relevantInitiatives.slice(0, MAX_INITIATIVES).map(item => ({
        id: text(item?.id, 160),
        name: text(item?.name, 300),
        status: text(item?.status, 120)
      }))
    : null;
  const history = Array.isArray(mount.cognitiveHistory?.events)
    ? mount.cognitiveHistory.events.slice(-limit).map(event => ({
        sequence: Number.isSafeInteger(event?.sequence) ? event.sequence : null,
        eventId: text(event?.eventId, 80),
        kind: text(event?.kind, 120),
        subjectId: text(event?.subjectId, 300),
        summary: text(event?.summary, 1800),
        truthClass: text(event?.truthClass, 120),
        observedAt: text(event?.observedAt, 80),
        evidenceRefs: Array.isArray(event?.evidenceRefs)
          ? event.evidenceRefs.slice(0, 16).map(ref => text(ref, 500)).filter(Boolean)
          : []
      }))
    : null;

  const reasons = [];
  if (!objective || !economicNorthStar || !mission || !activeMission) reasons.push('north-star-and-mission-context-required');
  if (!blockers || !nextActions) reasons.push('bounded-frontier-required');
  if (!relevantInitiatives || relevantInitiatives.some(item => !item.id || !item.name || !item.status)) reasons.push('bounded-relevant-initiatives-required');
  if (!history || history.some(item => !item.eventId || !item.kind || !item.summary || !item.truthClass || !item.observedAt)) reasons.push('bounded-cognitive-history-required');
  if (!text(mount.contextMountId, 80) || !text(mount.brainstateId, 80) || !text(mount.sourceCommit, 64)) reasons.push('mount-identity-required');
  if (reasons.length) return fail(reasons);

  return {
    ok: true,
    policyVersion: FOUNDER_DIALOGUE_CONTEXT_POLICY_VERSION,
    status: 'FOUNDER_DIALOGUE_CONTEXT_READY',
    context: {
      schemaVersion: FOUNDER_DIALOGUE_CONTEXT_SCHEMA_VERSION,
      contextMountId: mount.contextMountId,
      brainstateId: mount.brainstateId,
      sourceCommit: mount.sourceCommit,
      missionContextId: mount.missionContextId,
      mission,
      terminalObjective: objective,
      economicNorthStar,
      activeMission,
      frontier: { blockers, nextActions },
      relevantInitiatives,
      cognitiveHistory: history,
      laws: {
        zeroRetelling: mount.laws?.zeroRetelling || null,
        staleContext: mount.laws?.staleContext || null,
        capabilityNeverCreatesAuthority: true
      },
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE'
    },
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
