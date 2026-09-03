import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_ABSORPTION_VERSION = 'uberbond.frontier-absorption-engine-1.0.0';

export const ABSORPTION_STATES = Object.freeze([
  'DISCOVERED',
  'SPECIFIED',
  'IMPLEMENTED_UNVERIFIED',
  'PARITY_UNPROVEN',
  'PARITY_PROVEN',
  'SUPERIORITY_PROVEN',
  'REJECTED',
  'REVOKED'
]);

function text(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function list(value, max = 128, itemMax = 1200) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}
function finite(value, min = 0, max = 1_000_000_000) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function iso(value) {
  const normalized = text(value, 80);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function envelope(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

export function normalizeAbsorptionCandidate(input = {}) {
  const id = text(input.id, 220)?.toLowerCase();
  const sourceId = text(input.sourceId, 260);
  const featureName = text(input.featureName, 400);
  const sourceBoundary = text(input.sourceBoundary, 1600);
  const observableBehaviors = list(input.observableBehaviors || [], 128, 1600);
  const nonFunctionalRequirements = list(input.nonFunctionalRequirements || [], 128, 1600);
  const forbiddenShortcuts = list(input.forbiddenShortcuts || [], 128, 1600);
  const providerNeutralTarget = text(input.providerNeutralTarget, 500);
  const reasonCodes = [];

  if (!id) reasonCodes.push('candidate-id-required');
  if (!sourceId) reasonCodes.push('source-id-required');
  if (!featureName) reasonCodes.push('feature-name-required');
  if (!sourceBoundary) reasonCodes.push('source-boundary-required');
  if (!observableBehaviors || observableBehaviors.length === 0) reasonCodes.push('observable-behavior-contract-required');
  if (!nonFunctionalRequirements) reasonCodes.push('nonfunctional-requirements-required');
  if (!forbiddenShortcuts) reasonCodes.push('forbidden-shortcuts-required');
  if (!providerNeutralTarget) reasonCodes.push('provider-neutral-target-required');

  if (reasonCodes.length) return envelope({ ok: false, status: 'ABSORPTION_CANDIDATE_INVALID', reasonCodes });
  return envelope({
    ok: true,
    status: 'ABSORPTION_CANDIDATE_SPECIFIED',
    candidate: {
      schemaVersion: 'uberbond.frontier-absorption-candidate.v1',
      id,
      sourceId,
      featureName,
      sourceBoundary,
      observableBehaviors,
      nonFunctionalRequirements,
      forbiddenShortcuts,
      providerNeutralTarget
    }
  });
}

export function evaluateAbsorptionParity({ candidate, implementation = {}, referenceEvidence = [], implementationEvidence = [] } = {}) {
  const normalized = normalizeAbsorptionCandidate(candidate);
  if (!normalized.ok) return normalized;
  const implementationId = text(implementation.id, 240);
  const sourceRevision = text(implementation.sourceRevision, 240);
  const implementedBehaviors = list(implementation.implementedBehaviors || [], 256, 1600);
  const implementationState = text(implementation.state || 'IMPLEMENTED_UNVERIFIED', 80)?.toUpperCase();
  const reasonCodes = [];
  if (!implementationId || !sourceRevision || !implementedBehaviors) reasonCodes.push('implementation-identity-revision-and-behaviors-required');
  if (!['IMPLEMENTED_UNVERIFIED', 'ACTIVE', 'DEGRADED'].includes(implementationState)) reasonCodes.push('recognized-implementation-state-required');
  if (!Array.isArray(referenceEvidence) || referenceEvidence.length > 512) reasonCodes.push('bounded-reference-evidence-required');
  if (!Array.isArray(implementationEvidence) || implementationEvidence.length > 512) reasonCodes.push('bounded-implementation-evidence-required');
  if (reasonCodes.length) return envelope({ ok: false, status: 'ABSORPTION_PARITY_INVALID', reasonCodes });

  const required = normalized.candidate.observableBehaviors;
  const implementedSet = new Set(implementedBehaviors);
  const missingBehaviors = required.filter(item => !implementedSet.has(item));

  function normalizeEvidence(items, sourceType) {
    return items.map(item => ({
      behavior: text(item?.behavior, 1600),
      status: text(item?.status, 40)?.toUpperCase(),
      observedAt: iso(item?.observedAt),
      evidenceRef: text(item?.evidenceRef, 2000),
      qualityScore: finite(item?.qualityScore, 0, 100),
      sourceType
    })).filter(item => item.behavior && ['PASS', 'FAIL', 'UNCERTAIN'].includes(item.status) && item.observedAt && item.evidenceRef && item.qualityScore != null);
  }

  const reference = normalizeEvidence(referenceEvidence, 'REFERENCE');
  const implementationProof = normalizeEvidence(implementationEvidence, 'IMPLEMENTATION');
  const referenceByBehavior = new Map(reference.map(item => [item.behavior, item]));
  const implementationByBehavior = new Map(implementationProof.map(item => [item.behavior, item]));
  const missingReferenceProof = required.filter(item => !referenceByBehavior.has(item));
  const missingImplementationProof = required.filter(item => !implementationByBehavior.has(item));
  const failingImplementation = required.filter(item => implementationByBehavior.get(item)?.status !== 'PASS');
  const failingReference = required.filter(item => referenceByBehavior.get(item)?.status !== 'PASS');

  let state = 'IMPLEMENTED_UNVERIFIED';
  if (implementationState === 'DEGRADED') state = 'PARITY_UNPROVEN';
  else if (missingBehaviors.length || missingImplementationProof.length || failingImplementation.length) state = 'PARITY_UNPROVEN';
  else if (missingReferenceProof.length || failingReference.length) state = 'PARITY_UNPROVEN';
  else {
    const comparisons = required.map(behavior => ({
      behavior,
      reference: referenceByBehavior.get(behavior).qualityScore,
      implementation: implementationByBehavior.get(behavior).qualityScore
    }));
    const belowReference = comparisons.filter(item => item.implementation < item.reference);
    const aboveReference = comparisons.filter(item => item.implementation > item.reference);
    state = belowReference.length === 0
      ? (aboveReference.length === comparisons.length && comparisons.length > 0 ? 'SUPERIORITY_PROVEN' : 'PARITY_PROVEN')
      : 'PARITY_UNPROVEN';
  }

  return envelope({
    ok: true,
    status: state,
    parityState: state,
    candidateId: normalized.candidate.id,
    implementationId,
    sourceRevision,
    missingBehaviors,
    missingReferenceProof,
    missingImplementationProof,
    failingImplementation,
    failingReference,
    claimBoundary: state === 'PARITY_PROVEN' || state === 'SUPERIORITY_PROVEN'
      ? 'QUALITY_CLAIM_SUPPORTED_BY_CURRENT_OBSERVABLE_BEHAVIOR_EVIDENCE'
      : 'NO_PARITY_OR_SUPERIORITY_CLAIM_AUTHORIZED'
  });
}

export function buildAbsorptionWorkPacket({ candidate, currentCapabilities = [], substitutes = [] } = {}) {
  const normalized = normalizeAbsorptionCandidate(candidate);
  if (!normalized.ok) return normalized;
  const capabilities = list(currentCapabilities, 512, 500);
  const alternatives = list(substitutes, 512, 500);
  if (!capabilities || !alternatives) return envelope({ ok: false, status: 'ABSORPTION_WORK_PACKET_INVALID', reasonCodes: ['bounded-capability-and-substitute-lists-required'] });
  return envelope({
    ok: true,
    status: 'ABSORPTION_WORK_PACKET_READY',
    packet: {
      candidate: normalized.candidate,
      currentCapabilities: capabilities,
      substitutes: alternatives,
      requiredStages: [
        'DECOMPOSE_SOURCE_BEHAVIOR',
        'DEDUPE_WITH_EXISTING_CAPABILITIES',
        'DESIGN_PROVIDER_NEUTRAL_CONTRACT',
        'IMPLEMENT_MINIMUM_COMPLETE_BEHAVIOR',
        'VERIFY_OBSERVABLE_BEHAVIOR',
        'BENCHMARK_REFERENCE_IF_LAWFULLY_OBSERVABLE',
        'HOSTILE_REVIEW',
        'REGISTER_IN_CAPABILITY_GENOME',
        'PROMOTE_ONLY_WITH_EVIDENCE'
      ],
      prohibitedClaims: ['CLONED', 'PARITY', 'SUPERIOR']
    }
  });
}
