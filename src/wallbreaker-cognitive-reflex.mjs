import { deriveCountermoves } from './wallbreaker.mjs';

export const WALLBREAKER_COGNITIVE_REFLEX_VERSION = 'wallbreaker-cognitive-reflex-1.0.0';

function failureInputForEvent(compiledEvent) {
  const event = compiledEvent?.event;
  if (!compiledEvent?.ok || !event) return null;
  const base = {
    candidateId: event.subjectId,
    evidenceRefs: Array.isArray(event.evidenceRefs) ? event.evidenceRefs : [],
    safeToRetrySameMechanism: false,
    outcomeUncertain: true
  };
  if (event.kind === 'CAPABILITY_GAP') return { ...base, failureClass: 'CAPABILITY_GAP', missingCapability: true };
  if (event.kind === 'CONTRADICTION') return { ...base, failureClass: 'WRONG_ASSUMPTION', assumptionFalsified: true };
  if (event.kind === 'BLOCKER' && event.sourceNodeId === 'self-maintainer') return { ...base, failureClass: 'IMPLEMENTATION_DEFECT', implementationError: true };
  if (event.kind === 'BLOCKER') return { ...base, failureClass: 'UNKNOWN' };
  return null;
}

export function compileWallbreakerReflex(compiledEvent) {
  const input = failureInputForEvent(compiledEvent);
  if (!input) return null;
  const countermoves = deriveCountermoves(input);
  if (!countermoves?.ok) return {
    ok: false,
    policyVersion: WALLBREAKER_COGNITIVE_REFLEX_VERSION,
    status: 'WALLBREAKER_REFLEX_BLOCKED',
    eventId: compiledEvent?.eventId || null,
    reasonCodes: countermoves?.reasonCodes || ['wallbreaker-countermove-derivation-failed'],
    businessEffectAuthority: 'NONE'
  };
  return {
    ok: true,
    policyVersion: WALLBREAKER_COGNITIVE_REFLEX_VERSION,
    status: 'WALLBREAKER_REFLEX_READY',
    eventId: compiledEvent.eventId,
    sourceNodeId: compiledEvent.event.sourceNodeId,
    subjectId: compiledEvent.event.subjectId,
    failureClass: countermoves.failure.failureClass,
    safeToRetrySameMechanism: countermoves.failure.safeToRetrySameMechanism,
    hardStop: countermoves.failure.hardStop,
    countermoveTypes: countermoves.actions.map(action => action.type),
    capabilityQueries: countermoves.capabilityQueries,
    forbidden: countermoves.forbidden,
    evidenceRefs: countermoves.failure.evidenceRefs,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: countermoves.externalEffectLedger,
    truthBoundary: 'WALLBREAKER_REFLEX_SELECTS_RECOVERY_FAMILIES_ONLY; IT DOES_NOT_EXECUTE_THEM_OR_WIDEN_AUTHORITY'
  };
}

export function compileWallbreakerReflexes(events = []) {
  if (!Array.isArray(events) || events.length > 1000) return {
    ok: false,
    policyVersion: WALLBREAKER_COGNITIVE_REFLEX_VERSION,
    status: 'WALLBREAKER_REFLEX_BATCH_INVALID',
    reasonCodes: ['bounded-cognitive-event-list-required'],
    businessEffectAuthority: 'NONE'
  };
  const reflexes = events.map(compileWallbreakerReflex).filter(Boolean);
  const invalid = reflexes.filter(reflex => !reflex.ok);
  return {
    ok: invalid.length === 0,
    policyVersion: WALLBREAKER_COGNITIVE_REFLEX_VERSION,
    status: invalid.length ? 'WALLBREAKER_REFLEX_BATCH_BLOCKED' : 'WALLBREAKER_REFLEX_BATCH_READY',
    reflexes,
    reflexCount: reflexes.length,
    failureClassCounts: reflexes.reduce((out, reflex) => {
      if (reflex.ok) out[reflex.failureClass] = (out[reflex.failureClass] || 0) + 1;
      return out;
    }, {}),
    countermoveCounts: reflexes.reduce((out, reflex) => {
      for (const type of reflex.ok ? reflex.countermoveTypes : []) out[type] = (out[type] || 0) + 1;
      return out;
    }, {}),
    businessEffectAuthority: 'NONE'
  };
}
