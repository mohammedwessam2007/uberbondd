import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONTEXT_PROJECTION_POLICY_VERSION = 'context-projection-1.1.0';
export const CONTEXT_PROJECTION_SCHEMA_VERSION = 'uberbond.context-projection.v1';
const MAX_HISTORY = 12;
const MAX_INITIATIVES = 20;
const AUDIENCES = Object.freeze(['isolated-worker', 'founder-dialogue', 'research-worker']);
const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function text(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function fail(reasonCodes, status = 'CONTEXT_PROJECTION_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: CONTEXT_PROJECTION_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function payload(projection = {}) {
  const { projectionId: _ignored, ...rest } = projection;
  return rest;
}
function projectionShapeReasons(projection) {
  const reasons = [];
  if (!AUDIENCES.includes(String(projection?.audience || ''))) reasons.push('recognized-context-audience-required');
  if (!SHA40.test(String(projection?.sourceCommit || ''))) reasons.push('exact-context-source-commit-required');
  for (const key of ['brainstateId', 'contextMountId', 'missionContextId']) {
    if (!SHA64.test(String(projection?.[key] || ''))) reasons.push(`exact-${key}-required`);
  }
  if (!text(projection?.terminalObjective, 5000) || !text(projection?.economicNorthStar, 2000) || !text(projection?.mission, 4000) || !text(projection?.activeMission, 4000)) reasons.push('projection-north-star-and-mission-required');
  if (!projection?.frontier || !Array.isArray(projection.frontier.blockers) || projection.frontier.blockers.length > 16 || projection.frontier.blockers.some(v => !text(v, 1800)) || !Array.isArray(projection.frontier.nextActions) || projection.frontier.nextActions.length > 16 || projection.frontier.nextActions.some(v => !text(v, 1800))) reasons.push('bounded-projection-frontier-required');
  if (!Array.isArray(projection?.relevantInitiatives) || projection.relevantInitiatives.length > MAX_INITIATIVES || projection.relevantInitiatives.some(item => !item || typeof item !== 'object' || Array.isArray(item) || !text(item.id,160) || !text(item.name,300) || !text(item.status,120))) reasons.push('bounded-projection-initiatives-required');
  if (!Array.isArray(projection?.cognitiveHistory) || projection.cognitiveHistory.length > MAX_HISTORY || projection.cognitiveHistory.some(event => !event || typeof event !== 'object' || Array.isArray(event) || !text(event.eventId,80) || !text(event.kind,120) || !text(event.summary,1800) || !text(event.truthClass,120) || !text(event.observedAt,80) || !Array.isArray(event.evidenceRefs) || event.evidenceRefs.length > 16 || event.evidenceRefs.some(ref => !text(ref,500)))) reasons.push('bounded-projection-history-required');
  if (!projection?.laws || typeof projection.laws !== 'object' || Array.isArray(projection.laws) || !text(projection.laws.zeroRetelling,4000) || !text(projection.laws.staleContext,4000) || projection.laws.capabilityNeverCreatesAuthority !== true) reasons.push('projection-laws-required');
  if (projection?.consequenceAuthority !== 'NONE' || projection?.businessEffectAuthority !== 'NONE' || projection?.externalEffectAuthority !== 'NONE') reasons.push('zero-context-projection-authority-required');
  return reasons;
}

export function compileContextProjection({ mountResult, audience = 'isolated-worker', maxHistory = 8 } = {}) {
  if (!mountResult?.ok || !String(mountResult.status || '').startsWith('CONTEXT_MOUNT_READY')) return fail(['verified-current-context-mount-required']);
  const mount = mountResult.mount;
  if (!mount || mount.schemaVersion !== 'uberbond.context-mount.v1') return fail(['canonical-context-mount-required']);
  const historyLimit = Number(maxHistory);
  if (!Number.isSafeInteger(historyLimit) || historyLimit < 0 || historyLimit > MAX_HISTORY) return fail(['valid-history-limit-required']);
  const normalizedAudience = text(audience, 80);
  if (!normalizedAudience || !AUDIENCES.includes(normalizedAudience)) return fail(['recognized-context-audience-required']);

  const initiatives = Array.isArray(mount.missionContext?.relevantInitiatives)
    ? mount.missionContext.relevantInitiatives.slice(0, MAX_INITIATIVES).map(item => ({ id: text(item?.id, 160), name: text(item?.name, 300), status: text(item?.status, 120) }))
    : null;
  const history = Array.isArray(mount.cognitiveHistory?.events)
    ? mount.cognitiveHistory.events.slice(-historyLimit).map(event => ({
        sequence: Number.isSafeInteger(event?.sequence) ? event.sequence : null,
        eventId: text(event?.eventId, 80),
        kind: text(event?.kind, 120),
        subjectId: text(event?.subjectId, 300),
        summary: text(event?.summary, 1800),
        truthClass: text(event?.truthClass, 120),
        observedAt: text(event?.observedAt, 80),
        evidenceRefs: Array.isArray(event?.evidenceRefs) ? event.evidenceRefs.slice(0, 16).map(ref => text(ref, 500)).filter(Boolean) : []
      }))
    : null;
  const blockers = Array.isArray(mount.brainstate?.frontier?.blockers) ? mount.brainstate.frontier.blockers.slice(0, 16).map(v => text(v, 1800)) : null;
  const nextActions = Array.isArray(mount.brainstate?.frontier?.nextActions) ? mount.brainstate.frontier.nextActions.slice(0, 16).map(v => text(v, 1800)) : null;
  const reasons = [];
  if (!SHA40.test(String(mount.sourceCommit || '')) || !SHA64.test(String(mount.brainstateId || '')) || !SHA64.test(String(mount.contextMountId || '')) || !SHA64.test(String(mount.missionContextId || ''))) reasons.push('mount-identity-required');
  if (!text(mount.brainstate?.objective, 5000) || !text(mount.brainstate?.economicNorthStar, 2000) || !text(mount.mission, 4000) || !text(mount.brainstate?.frontier?.activeMission, 4000)) reasons.push('north-star-and-mission-required');
  if (!initiatives || initiatives.some(item => !item.id || !item.name || !item.status)) reasons.push('bounded-relevant-initiatives-required');
  if (!history || history.some(item => !item.eventId || !item.kind || !item.summary || !item.truthClass || !item.observedAt)) reasons.push('bounded-cognitive-history-required');
  if (!blockers || blockers.some(v => !v) || !nextActions || nextActions.some(v => !v)) reasons.push('bounded-frontier-required');
  if (reasons.length) return fail(reasons);

  const projection = {
    schemaVersion: CONTEXT_PROJECTION_SCHEMA_VERSION,
    audience: normalizedAudience,
    sourceCommit: mount.sourceCommit,
    brainstateId: mount.brainstateId,
    contextMountId: mount.contextMountId,
    missionContextId: mount.missionContextId,
    terminalObjective: mount.brainstate.objective,
    economicNorthStar: mount.brainstate.economicNorthStar,
    mission: mount.mission,
    activeMission: mount.brainstate.frontier.activeMission,
    frontier: { blockers, nextActions },
    relevantInitiatives: initiatives,
    cognitiveHistory: history,
    laws: {
      zeroRetelling: mount.laws?.zeroRetelling || null,
      staleContext: mount.laws?.staleContext || null,
      capabilityNeverCreatesAuthority: true
    },
    consequenceAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  const shapeReasons = projectionShapeReasons(projection);
  if (shapeReasons.length) return fail(shapeReasons);
  projection.projectionId = digest(payload(projection));
  return {
    ok: true,
    policyVersion: CONTEXT_PROJECTION_POLICY_VERSION,
    status: 'CONTEXT_PROJECTION_READY',
    projection,
    externalEffectLedger: zeroEffects()
  };
}

export function verifyContextProjection(projection, { audience = null, sourceCommit = null } = {}) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return fail(['context-projection-object-required'], 'CONTEXT_PROJECTION_INVALID');
  if (projection.schemaVersion !== CONTEXT_PROJECTION_SCHEMA_VERSION) return fail(['context-projection-schema-mismatch'], 'CONTEXT_PROJECTION_INVALID');
  const shapeReasons = projectionShapeReasons(projection);
  if (shapeReasons.length) return fail(shapeReasons, 'CONTEXT_PROJECTION_INVALID');
  const observed = digest(payload(projection));
  if (!SHA64.test(String(projection.projectionId || '')) || projection.projectionId !== observed) return fail(['context-projection-digest-mismatch'], 'CONTEXT_PROJECTION_INVALID');
  if (audience && projection.audience !== audience) return fail(['context-projection-audience-mismatch'], 'CONTEXT_PROJECTION_INVALID');
  if (sourceCommit && projection.sourceCommit !== String(sourceCommit).toLowerCase()) return fail(['context-projection-source-mismatch'], 'CONTEXT_PROJECTION_INVALID');
  return {
    ok: true,
    policyVersion: CONTEXT_PROJECTION_POLICY_VERSION,
    status: 'CONTEXT_PROJECTION_VERIFIED',
    projectionId: projection.projectionId,
    sourceCommit: projection.sourceCommit,
    brainstateId: projection.brainstateId,
    contextMountId: projection.contextMountId,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
