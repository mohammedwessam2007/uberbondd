import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  PERSONAL_CIVILIZATION_KERNEL_VERSION,
  PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
  PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
  LIFE_DIMENSIONS
} from './personal-civilization-kernel.mjs';

export const PERSONAL_CIVILIZATION_ORGANS_VERSION = 'uberbond.personal-civilization-organs.v1';
const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = (items) => [...new Set(items)];
const text = (value, max = 500) => {
  const result = String(value ?? '').trim();
  return result && result.length <= max ? result : null;
};
const list = (value, max = 100, itemMax = 500) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const normalized = value.map((item) => text(item, itemMax));
  return normalized.some((item) => item === null) ? null : unique(normalized);
};
const bounded = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const deny = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'PERSONAL_CIVILIZATION_ORGAN_DENIED',
  reasonCodes: unique(reasonCodes.filter(Boolean)),
  decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
  externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
  externalEffectLedger: zero(),
  ...extra
});
const authority = () => ({
  decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
  externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
  externalEffectLedger: zero()
});
const validSnapshot = (snapshot) => Boolean(snapshot && snapshot.schemaVersion === PERSONAL_CIVILIZATION_KERNEL_VERSION && Array.isArray(snapshot.futurePaths) && Array.isArray(snapshot.capabilityInventory));

export function compilePersonalCounterfactualUniverse({ snapshot, variants = [] } = {}) {
  if (!validSnapshot(snapshot)) return deny(['compiled-life-snapshot-required']);
  if (!Array.isArray(variants) || variants.length < 2 || variants.length > 500) return deny(['two-to-five-hundred-counterfactuals-required']);
  const normalized = variants.map((variant) => {
    if (!variant || typeof variant !== 'object' || Array.isArray(variant)) return null;
    const id = text(variant.id, 120);
    const label = text(variant.label ?? variant.id, 300);
    const capabilityIds = list(variant.capabilityIds ?? [], 200, 120);
    const commitments = list(variant.commitments ?? [], 100, 300);
    const failureModes = list(variant.failureModes ?? [], 100, 500);
    const evidenceRefs = list(variant.evidenceRefs ?? [], 100, 1000);
    const uncertainty = variant.uncertainty ?? 0.5;
    if (!id || !label || !capabilityIds || !commitments || !failureModes || !evidenceRefs || !bounded(uncertainty, 0, 1)) return null;
    return { id, label, capabilityIds, commitments, failureModes, evidenceRefs, uncertainty, truthClass: 'HYPOTHESIS' };
  });
  if (normalized.some((item) => !item)) return deny(['counterfactual-invalid']);
  if (unique(normalized.map((item) => item.id)).length !== normalized.length) return deny(['duplicate-counterfactual-id']);
  const knownCapabilityIds = new Set(snapshot.capabilityInventory.map((item) => item.id));
  const inventedCapabilities = unique(normalized.flatMap((variant) => variant.capabilityIds).filter((id) => !knownCapabilityIds.has(id))).sort();
  const counts = new Map();
  for (const variant of normalized) for (const capabilityId of variant.capabilityIds) counts.set(capabilityId, (counts.get(capabilityId) ?? 0) + 1);
  const ancestralCapabilities = [...counts.entries()]
    .map(([capabilityId, variantCount]) => ({ capabilityId, variantCount, coverage: variantCount / normalized.length, missingFromCurrentGenome: !knownCapabilityIds.has(capabilityId) }))
    .sort((a, b) => b.variantCount - a.variantCount || a.capabilityId.localeCompare(b.capabilityId));
  const commonFailureModes = [...new Set(normalized.flatMap((variant) => variant.failureModes))]
    .map((failureMode) => ({ failureMode, variantCount: normalized.filter((variant) => variant.failureModes.includes(failureMode)).length }))
    .sort((a, b) => b.variantCount - a.variantCount || a.failureMode.localeCompare(b.failureMode));
  const universe = {
    schemaVersion: PERSONAL_CIVILIZATION_ORGANS_VERSION,
    sourceSnapshotId: snapshot.snapshotId,
    variants: normalized,
    ancestralCapabilities,
    inventedCapabilities,
    commonFailureModes,
    extractionLaw: 'INVARIANTS_OVER_FANTASY_RANKING',
    automaticPathSelection: false,
    ...authority()
  };
  return { ok: true, status: 'PERSONAL_COUNTERFACTUAL_UNIVERSE_COMPILED', universe, universeDigest: digest(universe), ...authority() };
}

export function compileOsteogenesisPlan({ snapshot, targetFutureIds = [], masteryThreshold = 0.7, maxAtoms = 100 } = {}) {
  if (!validSnapshot(snapshot)) return deny(['compiled-life-snapshot-required']);
  const targets = list(targetFutureIds, 100, 120);
  if (!targets?.length) return deny(['target-future-required']);
  if (!bounded(masteryThreshold, 0, 1) || !Number.isInteger(maxAtoms) || maxAtoms < 1 || maxAtoms > 500) return deny(['osteogenesis-bound-invalid']);
  const pathById = new Map(snapshot.futurePaths.map((path) => [path.id, path]));
  const unknownTargets = targets.filter((id) => !pathById.has(id));
  if (unknownTargets.length) return deny(['unknown-target-future'], { unknownTargetFutureIds: unknownTargets });
  const capabilityById = new Map(snapshot.capabilityInventory.map((item) => [item.id, item]));
  const required = new Set();
  const unresolved = new Set();
  function addCapability(id, stack = []) {
    if (required.has(id)) return;
    if (stack.includes(id)) return;
    required.add(id);
    const capability = capabilityById.get(id);
    if (!capability) { unresolved.add(id); return; }
    for (const prerequisite of capability.prerequisites ?? []) addCapability(prerequisite, [...stack, id]);
  }
  for (const targetId of targets) for (const capabilityId of pathById.get(targetId).requiredCapabilities) addCapability(capabilityId);
  const atoms = [...required].map((capabilityId) => {
    const capability = capabilityById.get(capabilityId) ?? null;
    const currentLevel = capability?.currentLevel;
    const gap = currentLevel === null || currentLevel === undefined ? null : Math.max(0, masteryThreshold - currentLevel);
    return {
      capabilityId,
      label: capability?.label ?? capabilityId,
      currentLevel: currentLevel ?? null,
      targetLevel: masteryThreshold,
      gap,
      prerequisites: capability?.prerequisites ?? [],
      evidenceRefs: capability?.evidenceRefs ?? [],
      status: capability === null ? 'MISSING_CAPABILITY_DEFINITION' : gap === 0 ? 'SUFFICIENT_FOR_THRESHOLD' : 'GROWTH_REQUIRED'
    };
  }).sort((a, b) => {
    if (a.status === 'MISSING_CAPABILITY_DEFINITION' && b.status !== a.status) return -1;
    if (b.status === 'MISSING_CAPABILITY_DEFINITION' && a.status !== b.status) return 1;
    return (b.gap ?? 1) - (a.gap ?? 1) || a.capabilityId.localeCompare(b.capabilityId);
  }).slice(0, maxAtoms);
  const plan = {
    schemaVersion: PERSONAL_CIVILIZATION_ORGANS_VERSION,
    sourceSnapshotId: snapshot.snapshotId,
    targetFutureIds: targets,
    masteryThreshold,
    atoms,
    unresolvedCapabilityIds: [...unresolved].sort(),
    highTransferFirst: true,
    trainingAuthority: 'PROPOSE_ONLY',
    humanChangeAuthority: 'NONE',
    ...authority()
  };
  return { ok: true, status: 'OSTEOGENESIS_PLAN_COMPILED', plan, planDigest: digest(plan), ...authority() };
}

export function compilePersonalTimeTelescope({
  behavior,
  occurrencesPerWeek,
  effectPerOccurrence,
  horizonsDays = [7, 30, 365, 1825, 7300],
  confidence = 0.5,
  decayPerYear = 0.15
} = {}) {
  const normalizedBehavior = text(behavior, 1000);
  if (!normalizedBehavior) return deny(['behavior-required']);
  if (!bounded(occurrencesPerWeek, 0, 168) || !bounded(effectPerOccurrence, -1000, 1000) || !bounded(confidence, 0, 1) || !bounded(decayPerYear, 0, 1)) return deny(['time-telescope-parameter-invalid']);
  if (!Array.isArray(horizonsDays) || horizonsDays.length < 1 || horizonsDays.length > 20 || horizonsDays.some((days) => !Number.isInteger(days) || days < 1 || days > 36500)) return deny(['time-horizon-invalid']);
  const horizons = unique(horizonsDays).sort((a, b) => a - b).map((days) => {
    const occurrences = occurrencesPerWeek * days / 7;
    const years = days / 365;
    const persistence = Math.pow(1 - decayPerYear, years);
    const central = occurrences * effectPerOccurrence * persistence;
    const uncertaintyWidth = Math.abs(central) * (1 - confidence) * Math.min(2, 0.5 + years / 5);
    return {
      days,
      estimatedOccurrences: Number(occurrences.toFixed(3)),
      centralProjection: Number(central.toFixed(3)),
      plausibleRange: [Number((central - uncertaintyWidth).toFixed(3)), Number((central + uncertaintyWidth).toFixed(3))],
      confidence,
      interpretation: 'SCENARIO_NOT_FORECAST'
    };
  });
  return {
    ok: true,
    status: 'PERSONAL_TIME_TELESCOPE_COMPILED',
    telescope: { behavior: normalizedBehavior, occurrencesPerWeek, effectPerOccurrence, horizons, exactPredictionClaimed: false, compoundingVisibilityOnly: true },
    ...authority()
  };
}

export function compileIdentityEvolutionHypothesis({ statement, evidenceRefs = [], candidateExplanations = [], lowCostTests = [] } = {}) {
  const normalizedStatement = text(statement, 1000);
  const refs = list(evidenceRefs, 100, 1000);
  if (!normalizedStatement || !refs?.length) return deny(['identity-statement-and-evidence-required']);
  if (!Array.isArray(candidateExplanations) || candidateExplanations.length < 2 || candidateExplanations.length > 50) return deny(['multiple-identity-explanations-required']);
  const allowedClasses = new Set(['TRAIT', 'SKILL', 'HABIT', 'ENVIRONMENT', 'TEMPORARY_STATE', 'SELF_STORY', 'PREFERENCE', 'VALUE']);
  const explanations = candidateExplanations.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const id = text(item.id, 120);
    const kind = text(item.kind, 80)?.toUpperCase();
    const explanation = text(item.explanation, 800);
    const evidence = list(item.evidenceRefs ?? [], 50, 1000);
    const confidence = item.confidence ?? 0.5;
    return id && allowedClasses.has(kind) && explanation && evidence && bounded(confidence, 0, 1) ? { id, kind, explanation, evidenceRefs: evidence, confidence } : null;
  });
  if (explanations.some((item) => !item)) return deny(['identity-explanation-invalid']);
  if (unique(explanations.map((item) => item.id)).length !== explanations.length) return deny(['duplicate-identity-explanation-id']);
  const tests = Array.isArray(lowCostTests) && lowCostTests.length <= 50 ? lowCostTests.map((item) => ({
    id: text(item?.id, 120),
    description: text(item?.description, 800),
    reversible: item?.reversible === true,
    founderMinutes: item?.founderMinutes ?? null,
    evidenceRefs: list(item?.evidenceRefs ?? [], 50, 1000)
  })) : null;
  if (!tests || tests.some((item) => !item.id || !item.description || !item.evidenceRefs || !Number.isFinite(item.founderMinutes) || item.founderMinutes < 0)) return deny(['identity-test-invalid']);
  return {
    ok: true,
    status: 'IDENTITY_EVOLUTION_HYPOTHESIS_COMPILED',
    hypothesis: {
      statement: normalizedStatement,
      evidenceRefs: refs,
      candidateExplanations: explanations.sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)),
      lowCostTests: tests,
      identityVerdict: 'UNRESOLVED',
      antiCompressionLaw: 'DO_NOT_TURN_LIMITED_EVIDENCE_INTO_IDENTITY',
      ...authority()
    },
    ...authority()
  };
}

export function compileSerendipityPortfolio({ collisions = [] } = {}) {
  if (!Array.isArray(collisions) || collisions.length > 500) return deny(['collisions-invalid']);
  const normalized = collisions.map((collision) => {
    if (!collision || typeof collision !== 'object' || Array.isArray(collision)) return null;
    const id = text(collision.id, 120);
    const domains = list(collision.domains ?? [], 12, 120);
    const exposure = text(collision.exposure, 800);
    const evidenceRefs = list(collision.evidenceRefs ?? [], 100, 1000);
    const founderMinutes = collision.founderMinutes ?? 0;
    const costCents = collision.costCents ?? 0;
    const risk = collision.risk ?? 0;
    if (!id || !domains || domains.length < 2 || !exposure || !evidenceRefs || !Number.isFinite(founderMinutes) || founderMinutes < 0 || !Number.isFinite(costCents) || costCents < 0 || !bounded(risk, 0, 10)) return null;
    return { id, domains, exposure, evidenceRefs, founderMinutes, costCents, risk, reversible: collision.reversible === true, diversity: domains.length, requestedExternalEffect: collision.requestedExternalEffect === true };
  });
  if (normalized.some((item) => !item)) return deny(['serendipity-collision-invalid']);
  if (unique(normalized.map((item) => item.id)).length !== normalized.length) return deny(['duplicate-serendipity-id']);
  const refused = normalized.filter((item) => item.requestedExternalEffect).map((item) => ({ id: item.id, reasonCodes: ['external-effect-not-authorized'] }));
  const candidates = normalized.filter((item) => !item.requestedExternalEffect).sort((a, b) => b.diversity - a.diversity || a.risk - b.risk || a.founderMinutes - b.founderMinutes || a.id.localeCompare(b.id));
  return { ok: true, status: 'SERENDIPITY_PORTFOLIO_COMPILED', portfolio: { candidates, refused, purpose: 'INCREASE_SURFACE_AREA_FOR_VALUABLE_ACCIDENTS', automaticContactAuthority: 'NONE' }, ...authority() };
}

export function compileLifeGamechangerSignal({ id, observation, changedPrimitives = [], affectedFutureIds = [], evidenceRefs = [], observedAt, confidence = 0.5 } = {}) {
  const signalId = text(id, 120);
  const normalizedObservation = text(observation, 2000);
  const primitives = list(changedPrimitives, 100, 300);
  const futures = list(affectedFutureIds, 200, 120);
  const refs = list(evidenceRefs, 100, 1000);
  const timestamp = new Date(observedAt);
  if (!signalId || !normalizedObservation || !primitives?.length || !futures || !refs?.length || !Number.isFinite(timestamp.getTime()) || !bounded(confidence, 0, 1)) return deny(['life-gamechanger-signal-invalid']);
  const signal = {
    schemaVersion: PERSONAL_CIVILIZATION_ORGANS_VERSION,
    id: signalId,
    observation: normalizedObservation,
    changedPrimitives: primitives,
    affectedFutureIds: futures,
    evidenceRefs: refs,
    observedAt: timestamp.toISOString(),
    confidence,
    truthClass: 'EVIDENCE_BOUND_SIGNAL',
    promotionAuthority: 'NONE',
    actionAuthority: 'NONE',
    ...authority()
  };
  return { ok: true, status: 'LIFE_GAMECHANGER_SIGNAL_COMPILED', signal, signalDigest: digest(signal), ...authority() };
}

export function compileLifeGenesisPopulation({ snapshot, signals = [], mutations = [], maxPopulation = 128 } = {}) {
  if (!validSnapshot(snapshot)) return deny(['compiled-life-snapshot-required']);
  if (!Array.isArray(signals) || !Array.isArray(mutations) || !Number.isInteger(maxPopulation) || maxPopulation < 1 || maxPopulation > 512) return deny(['genesis-population-bound-invalid']);
  const validSignals = signals.filter((item) => item?.schemaVersion === PERSONAL_CIVILIZATION_ORGANS_VERSION && item?.truthClass === 'EVIDENCE_BOUND_SIGNAL');
  if (validSignals.length !== signals.length) return deny(['compiled-life-gamechanger-signal-required']);
  const normalizedMutations = mutations.map((mutation) => {
    if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) return null;
    const id = text(mutation.id, 120);
    const premise = text(mutation.premise, 1000);
    const capabilityIds = list(mutation.capabilityIds ?? [], 100, 120);
    const preservesFutureIds = list(mutation.preservesFutureIds ?? [], 200, 120);
    const evidenceRefs = list(mutation.evidenceRefs ?? [], 100, 1000);
    const reversibility = mutation.reversible === true;
    return id && premise && capabilityIds && preservesFutureIds && evidenceRefs ? { id, premise, capabilityIds, preservesFutureIds, evidenceRefs, reversible: reversibility } : null;
  });
  if (normalizedMutations.some((item) => !item)) return deny(['life-genesis-mutation-invalid']);
  if (unique(normalizedMutations.map((item) => item.id)).length !== normalizedMutations.length) return deny(['duplicate-life-genesis-mutation-id']);
  const signalPrimitivePool = unique(validSignals.flatMap((signal) => signal.changedPrimitives));
  const population = normalizedMutations.slice(0, maxPopulation).map((mutation) => ({
    ...mutation,
    changedPrimitiveContext: signalPrimitivePool,
    sourceSignalIds: validSignals.map((signal) => signal.id),
    truthClass: 'HYPOTHESIS',
    commitmentAuthority: 'NONE',
    nextGate: 'LOW_COST_REVERSIBLE_EXPERIMENT_OR_EVIDENCE_ACQUISITION'
  }));
  return {
    ok: true,
    status: 'LIFE_GENESIS_POPULATION_COMPILED',
    population: {
      sourceSnapshotId: snapshot.snapshotId,
      candidates: population,
      generatedCount: population.length,
      imaginationIsNotEvidence: true,
      automaticCommitmentAuthority: 'NONE'
    },
    ...authority()
  };
}

export function compileLifeCompressionModel({ observations = [], principles = [] } = {}) {
  if (!Array.isArray(observations) || observations.length < 1 || observations.length > 5000 || !Array.isArray(principles) || principles.length < 1 || principles.length > 500) return deny(['bounded-observations-and-principles-required']);
  const observationIds = observations.map((item) => text(item?.id, 120));
  if (observationIds.some((id) => !id) || unique(observationIds).length !== observationIds.length) return deny(['observation-identity-invalid']);
  const known = new Set(observationIds);
  const normalizedPrinciples = principles.map((principle) => {
    if (!principle || typeof principle !== 'object' || Array.isArray(principle)) return null;
    const id = text(principle.id, 120);
    const statement = text(principle.statement, 1000);
    const explains = list(principle.explainsObservationIds ?? [], 1000, 120);
    const exceptions = list(principle.exceptionObservationIds ?? [], 1000, 120);
    const evidenceRefs = list(principle.evidenceRefs ?? [], 100, 1000);
    if (!id || !statement || !explains?.length || !exceptions || !evidenceRefs || [...explains, ...exceptions].some((item) => !known.has(item))) return null;
    return { id, statement, explainsObservationIds: explains, exceptionObservationIds: exceptions, evidenceRefs };
  });
  if (normalizedPrinciples.some((item) => !item)) return deny(['compression-principle-invalid']);
  const explained = new Set(normalizedPrinciples.flatMap((item) => item.explainsObservationIds));
  const exceptions = new Set(normalizedPrinciples.flatMap((item) => item.exceptionObservationIds));
  const model = {
    schemaVersion: PERSONAL_CIVILIZATION_ORGANS_VERSION,
    observationCount: observations.length,
    principleCount: normalizedPrinciples.length,
    principles: normalizedPrinciples,
    explainedObservationCount: explained.size,
    exceptionObservationCount: exceptions.size,
    unexplainedObservationIds: observationIds.filter((id) => !explained.has(id)),
    compressionRatio: Number((normalizedPrinciples.length / observations.length).toFixed(6)),
    truthLaw: 'COMPRESSION_MUST_PRESERVE_EXCEPTIONS_AND_UNCERTAINTY',
    ...authority()
  };
  return { ok: true, status: 'LIFE_COMPRESSION_MODEL_COMPILED', model, modelDigest: digest(model), ...authority() };
}
