import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PERSONAL_CIVILIZATION_KERNEL_VERSION = 'uberbond.personal-civilization-kernel.v1.1';
export const PERSONAL_CIVILIZATION_DECISION_AUTHORITY = 'FOUNDER_ONLY';
export const PERSONAL_CIVILIZATION_EFFECT_AUTHORITY = 'NONE';
export const PERSONAL_CIVILIZATION_STORAGE_CLASS = 'PRIVATE_RUNTIME_ONLY';

export const LIFE_DIMENSIONS = Object.freeze([
  'agency', 'capability', 'understanding', 'meaningfulExperience', 'relationships',
  'freedom', 'healthSupport', 'creativity', 'economicResilience', 'timeSovereignty', 'meaning'
]);

const HIGH_STAKES_DOMAINS = new Set(['MEDICAL', 'MENTAL_HEALTH', 'LEGAL', 'FINANCIAL', 'SAFETY_CRITICAL']);
const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, min, max) => finite(value) && value >= min && value <= max;
const unique = (items) => [...new Set(items)];
const text = (value, max = 400) => {
  const normalized = String(value ?? '').trim();
  return normalized && normalized.length <= max ? normalized : null;
};
const list = (value, max = 100, itemMax = 400) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const normalized = value.map((item) => text(item, itemMax));
  if (normalized.some((item) => item === null)) return null;
  return unique(normalized);
};
const deny = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'PERSONAL_CIVILIZATION_DENIED',
  reasonCodes: unique(reasonCodes.filter(Boolean)),
  decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
  externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
  storageClass: PERSONAL_CIVILIZATION_STORAGE_CLASS,
  externalEffectLedger: zero(),
  ...extra
});
const duplicates = (items) => {
  const seen = new Set();
  const dupes = new Set();
  for (const item of items) seen.has(item) ? dupes.add(item) : seen.add(item);
  return [...dupes].sort();
};
const overlap = (a, b) => a.filter((item) => b.includes(item));

function normalizeEvidenceRefs(value, max = 100) {
  return list(value ?? [], max, 1000);
}

function normalizeEffects(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalized = {};
  for (const dimension of LIFE_DIMENSIONS) {
    const raw = value[dimension] ?? 0;
    if (!bounded(raw, -5, 5)) return null;
    normalized[dimension] = raw;
  }
  return normalized;
}

function normalizeFuturePath(path) {
  if (!path || typeof path !== 'object' || Array.isArray(path)) return null;
  const id = text(path.id, 120);
  const label = text(path.label ?? path.id, 300);
  const domain = text(path.domain ?? 'GENERAL', 80)?.toUpperCase();
  const requiredCapabilities = list(path.requiredCapabilities ?? [], 100, 160);
  const evidenceRefs = normalizeEvidenceRefs(path.evidenceRefs ?? []);
  const status = text(path.status ?? 'HYPOTHETICAL', 40)?.toUpperCase();
  const uncertainty = path.uncertainty ?? 0.5;
  const lead = path.preparationLeadTimeDays ?? null;
  if (!id || !label || !domain || !requiredCapabilities || !evidenceRefs || !status) return null;
  if (!bounded(uncertainty, 0, 1)) return null;
  if (lead !== null && (!finite(lead) || lead < 0)) return null;
  return {
    id,
    label,
    domain,
    requiredCapabilities,
    evidenceRefs,
    reversibility: path.reversibility === true ? 'REVERSIBLE' : path.reversibility === false ? 'PATH_DEPENDENT' : 'UNKNOWN',
    preparationLeadTimeDays: lead,
    uncertainty,
    status
  };
}

function normalizeCapability(capability) {
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) return null;
  const id = text(capability.id, 120);
  const label = text(capability.label ?? capability.id, 300);
  const prerequisites = list(capability.prerequisites ?? [], 100, 160);
  const evidenceRefs = normalizeEvidenceRefs(capability.evidenceRefs ?? []);
  const currentLevel = capability.currentLevel ?? null;
  const transferBreadth = capability.transferBreadth ?? null;
  if (!id || !label || !prerequisites || !evidenceRefs) return null;
  if (currentLevel !== null && !bounded(currentLevel, 0, 1)) return null;
  if (transferBreadth !== null && (!finite(transferBreadth) || transferBreadth < 0)) return null;
  return { id, label, prerequisites, currentLevel, evidenceRefs, transferBreadth };
}

function capabilityGraphIntegrity(capabilities) {
  const ids = new Set(capabilities.map((item) => item.id));
  const missing = unique(capabilities.flatMap((item) => item.prerequisites).filter((id) => !ids.has(id))).sort();
  const selfCycles = capabilities.filter((item) => item.prerequisites.includes(item.id)).map((item) => item.id).sort();
  const adjacency = new Map(capabilities.map((item) => [item.id, item.prerequisites]));
  const visiting = new Set();
  const visited = new Set();
  let cycle = null;
  function walk(node, path) {
    if (cycle || visited.has(node)) return;
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      cycle = [...path.slice(start), node];
      return;
    }
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) if (ids.has(next)) walk(next, [...path, next]);
    visiting.delete(node);
    visited.add(node);
  }
  for (const id of ids) walk(id, [id]);
  return { missingPrerequisites: missing, selfCycles, cycle };
}

function normalizeIntervention(intervention) {
  if (!intervention || typeof intervention !== 'object' || Array.isArray(intervention)) return null;
  const id = text(intervention.id, 120);
  const label = text(intervention.label ?? intervention.id, 300);
  const domain = text(intervention.domain ?? 'GENERAL', 80)?.toUpperCase();
  const effects = normalizeEffects(intervention.effects);
  const evidenceRefs = normalizeEvidenceRefs(intervention.evidenceRefs ?? []);
  const opensFutureIds = list(intervention.opensFutureIds ?? [], 200, 120);
  const preservesFutureIds = list(intervention.preservesFutureIds ?? [], 200, 120);
  const closesFutureIds = list(intervention.closesFutureIds ?? [], 200, 120);
  const capabilityIds = list(intervention.capabilityIds ?? [], 200, 120);
  const uncertainty = intervention.uncertainty ?? 0.5;
  const founderMinutes = intervention.founderMinutes ?? 0;
  const costCents = intervention.costCents ?? 0;
  const risk = intervention.risk ?? 0;
  if (!id || !label || !domain || !effects || !evidenceRefs || !opensFutureIds || !preservesFutureIds || !closesFutureIds || !capabilityIds) return null;
  if (!bounded(uncertainty, 0, 1) || !finite(founderMinutes) || founderMinutes < 0 || !finite(costCents) || costCents < 0 || !bounded(risk, 0, 10)) return null;
  if (overlap(opensFutureIds, closesFutureIds).length || overlap(preservesFutureIds, closesFutureIds).length) return null;
  return {
    id, label, domain, effects, evidenceRefs, opensFutureIds, preservesFutureIds, closesFutureIds, capabilityIds,
    uncertainty, founderMinutes, costCents, risk,
    reversible: intervention.reversible === true,
    requiresProfessionalReview: HIGH_STAKES_DOMAINS.has(domain),
    requestedExternalEffect: intervention.requestedExternalEffect === true
  };
}

function dominates(a, b) {
  const dimensionsNoWorse = LIFE_DIMENSIONS.every((dimension) => a.effects[dimension] >= b.effects[dimension]);
  const dimensionsBetter = LIFE_DIMENSIONS.some((dimension) => a.effects[dimension] > b.effects[dimension]);
  const resourceNoWorse = a.founderMinutes <= b.founderMinutes && a.costCents <= b.costCents && a.risk <= b.risk && a.uncertainty <= b.uncertainty;
  const resourceBetter = a.founderMinutes < b.founderMinutes || a.costCents < b.costCents || a.risk < b.risk || a.uncertainty < b.uncertainty;
  const optionalityA = a.opensFutureIds.length + a.preservesFutureIds.length - a.closesFutureIds.length;
  const optionalityB = b.opensFutureIds.length + b.preservesFutureIds.length - b.closesFutureIds.length;
  return dimensionsNoWorse && resourceNoWorse && optionalityA >= optionalityB && (dimensionsBetter || resourceBetter || optionalityA > optionalityB);
}

export function compileLifeKnowledgeSnapshot({
  snapshotId, goals = [], constraints = [], values = [], capabilityInventory = [], futurePaths = [], evidenceRefs = [], publicPersist = false
} = {}) {
  const reasons = [];
  const id = text(snapshotId, 120);
  const normalizedGoals = list(goals, 100, 500);
  const normalizedConstraints = list(constraints, 100, 500);
  const normalizedValues = list(values, 100, 300);
  const refs = normalizeEvidenceRefs(evidenceRefs);
  if (!id) reasons.push('snapshot-id-required');
  if (!normalizedGoals?.length) reasons.push('goal-required');
  if (!normalizedConstraints) reasons.push('constraints-invalid');
  if (!normalizedValues) reasons.push('values-invalid');
  if (!refs?.length) reasons.push('evidence-ref-required');
  if (publicPersist === true) reasons.push('public-persistence-forbidden');
  if (!Array.isArray(capabilityInventory) || capabilityInventory.length > 500) reasons.push('capability-inventory-invalid');
  if (!Array.isArray(futurePaths) || futurePaths.length > 500) reasons.push('future-paths-invalid');
  const capabilities = Array.isArray(capabilityInventory) ? capabilityInventory.map(normalizeCapability) : [];
  const paths = Array.isArray(futurePaths) ? futurePaths.map(normalizeFuturePath) : [];
  if (capabilities.some((item) => !item)) reasons.push('capability-invalid');
  if (paths.some((item) => !item)) reasons.push('future-path-invalid');
  const capabilityDuplicates = capabilities.every(Boolean) ? duplicates(capabilities.map((item) => item.id)) : [];
  const pathDuplicates = paths.every(Boolean) ? duplicates(paths.map((item) => item.id)) : [];
  if (capabilityDuplicates.length) reasons.push('duplicate-capability-id');
  if (pathDuplicates.length) reasons.push('duplicate-future-path-id');
  const integrity = capabilities.every(Boolean) ? capabilityGraphIntegrity(capabilities) : { missingPrerequisites: [], selfCycles: [], cycle: null };
  if (integrity.selfCycles.length || integrity.cycle) reasons.push('capability-prerequisite-cycle');
  if (reasons.length) return deny(reasons, { duplicateCapabilityIds: capabilityDuplicates, duplicateFuturePathIds: pathDuplicates, capabilityCycle: integrity.cycle });

  const capabilityIds = new Set(capabilities.map((item) => item.id));
  const danglingCapabilities = unique(paths.flatMap((path) => path.requiredCapabilities).filter((capabilityId) => !capabilityIds.has(capabilityId))).sort();
  const snapshot = {
    schemaVersion: PERSONAL_CIVILIZATION_KERNEL_VERSION,
    snapshotId: id,
    goals: normalizedGoals,
    constraints: normalizedConstraints,
    values: normalizedValues,
    capabilityInventory: capabilities,
    futurePaths: paths,
    danglingCapabilities,
    missingPrerequisiteCapabilities: integrity.missingPrerequisites,
    evidenceRefs: refs,
    privacy: { storageClass: PERSONAL_CIVILIZATION_STORAGE_CLASS, publicPersistenceAllowed: false, sensitiveDataMinimizationRequired: true },
    decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
    externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
    externalEffectLedger: zero()
  };
  return { ok: true, status: 'LIFE_KNOWLEDGE_SNAPSHOT_COMPILED', snapshot, snapshotDigest: digest(snapshot), decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY, externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY, externalEffectLedger: zero() };
}

export function deriveAncestralCapabilities({ snapshot } = {}) {
  if (!snapshot || snapshot.schemaVersion !== PERSONAL_CIVILIZATION_KERNEL_VERSION) return deny(['compiled-life-snapshot-required']);
  const counts = new Map();
  const pathIdsByCapability = new Map();
  for (const path of snapshot.futurePaths) for (const capabilityId of path.requiredCapabilities) {
    counts.set(capabilityId, (counts.get(capabilityId) ?? 0) + 1);
    pathIdsByCapability.set(capabilityId, [...(pathIdsByCapability.get(capabilityId) ?? []), path.id]);
  }
  const capabilityById = new Map(snapshot.capabilityInventory.map((capability) => [capability.id, capability]));
  const totalPaths = Math.max(snapshot.futurePaths.length, 1);
  const ancestralCapabilities = [...counts.entries()].map(([capabilityId, pathCount]) => {
    const capability = capabilityById.get(capabilityId) ?? null;
    return {
      capabilityId,
      label: capability?.label ?? capabilityId,
      pathCount,
      crossFutureCoverage: pathCount / totalPaths,
      pathIds: unique(pathIdsByCapability.get(capabilityId) ?? []),
      currentLevel: capability?.currentLevel ?? null,
      prerequisites: capability?.prerequisites ?? [],
      evidenceRefs: capability?.evidenceRefs ?? [],
      missingFromInventory: capability === null
    };
  }).sort((a, b) => b.pathCount - a.pathCount || a.capabilityId.localeCompare(b.capabilityId));
  return { ok: true, status: 'ANCESTRAL_CAPABILITIES_DERIVED', ancestralCapabilities, highestTransferCandidates: ancestralCapabilities.filter((item) => item.crossFutureCoverage >= 0.5), decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY, externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY, externalEffectLedger: zero() };
}

export function compileLifePossibilityPortfolio({ snapshot, interventions = [] } = {}) {
  if (!snapshot || snapshot.schemaVersion !== PERSONAL_CIVILIZATION_KERNEL_VERSION) return deny(['compiled-life-snapshot-required']);
  if (!Array.isArray(interventions) || interventions.length > 500) return deny(['interventions-invalid']);
  const normalized = interventions.map(normalizeIntervention);
  if (normalized.some((item) => !item)) return deny(['intervention-invalid']);
  const duplicateIds = duplicates(normalized.map((item) => item.id));
  if (duplicateIds.length) return deny(['duplicate-intervention-id'], { duplicateInterventionIds: duplicateIds });

  const knownFutureIds = new Set((snapshot.futurePaths ?? []).map((path) => path.id));
  const knownCapabilityIds = new Set((snapshot.capabilityInventory ?? []).map((capability) => capability.id));
  const referenceInvalid = normalized.filter((item) =>
    item.preservesFutureIds.some((id) => knownFutureIds.size && !knownFutureIds.has(id)) ||
    item.closesFutureIds.some((id) => knownFutureIds.size && !knownFutureIds.has(id)) ||
    item.capabilityIds.some((id) => knownCapabilityIds.size && !knownCapabilityIds.has(id))
  ).map((item) => item.id);
  if (referenceInvalid.length) return deny(['intervention-reference-invalid'], { interventionIds: referenceInvalid });

  const refused = normalized.filter((item) => item.requestedExternalEffect).map((item) => ({ id: item.id, reasonCodes: ['external-effect-not-authorized'] }));
  const eligible = normalized.filter((item) => !item.requestedExternalEffect).map((item) => ({
    ...item,
    optionality: { opened: item.opensFutureIds.length, preserved: item.preservesFutureIds.length, closed: item.closesFutureIds.length, delta: item.opensFutureIds.length + item.preservesFutureIds.length - item.closesFutureIds.length },
    reviewClass: item.requiresProfessionalReview ? 'FOUNDER_PLUS_QUALIFIED_PROFESSIONAL_REVIEW' : 'FOUNDER_REVIEW'
  }));
  const frontier = eligible.filter((candidate) => !eligible.some((other) => other.id !== candidate.id && dominates(other, candidate)));
  const dominated = eligible.filter((candidate) => !frontier.some((item) => item.id === candidate.id)).map((candidate) => ({ id: candidate.id, dominatedBy: eligible.filter((other) => other.id !== candidate.id && dominates(other, candidate)).map((other) => other.id) }));
  return {
    ok: true,
    status: 'LIFE_POSSIBILITY_PORTFOLIO_COMPILED',
    portfolio: { evaluationMode: 'MULTI_OBJECTIVE_PARETO_NOT_SINGLE_LIFE_SCORE', lifeDimensions: [...LIFE_DIMENSIONS], frontier, dominated, refused, noAutomaticWinner: true, founderMustChoose: true },
    decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
    externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
    externalEffectLedger: zero()
  };
}

export function compileExperiencePortfolio({ experiences = [] } = {}) {
  if (!Array.isArray(experiences) || experiences.length > 300) return deny(['experiences-invalid']);
  const normalized = experiences.map(normalizeIntervention);
  if (normalized.some((item) => !item)) return deny(['experience-invalid']);
  const duplicateIds = duplicates(normalized.map((item) => item.id));
  if (duplicateIds.length) return deny(['duplicate-experience-id'], { duplicateExperienceIds: duplicateIds });
  const withSynergy = normalized.map((experience) => {
    const positiveDimensions = LIFE_DIMENSIONS.filter((dimension) => experience.effects[dimension] > 0);
    return { ...experience, positiveDimensions, multiDomainSynergyCount: positiveDimensions.length, memoryValuePreserved: experience.effects.meaningfulExperience > 0 || experience.effects.meaning > 0, efficiencyIsNotSupreme: true };
  });
  const pareto = compileLifePossibilityPortfolio({ snapshot: { schemaVersion: PERSONAL_CIVILIZATION_KERNEL_VERSION }, interventions: withSynergy });
  if (!pareto.ok) return pareto;
  return { ok: true, status: 'EXPERIENCE_PORTFOLIO_COMPILED', experiences: withSynergy, frontier: pareto.portfolio.frontier, noJoylessEfficiencyObjective: true, decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY, externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY, externalEffectLedger: zero() };
}

export function compileFutureSelfCouncil({ decision, perspectives = [] } = {}) {
  const normalizedDecision = text(decision, 1000);
  if (!normalizedDecision) return deny(['decision-required']);
  if (!Array.isArray(perspectives) || perspectives.length < 2 || perspectives.length > 30) return deny(['two-to-thirty-perspectives-required']);
  const normalized = perspectives.map((perspective) => {
    if (!perspective || typeof perspective !== 'object' || Array.isArray(perspective)) return null;
    const id = text(perspective.id, 120);
    const horizon = text(perspective.horizon, 120);
    const priorities = list(perspective.priorities ?? [], 30, 300);
    const concerns = list(perspective.concerns ?? [], 30, 300);
    const evidenceRefs = normalizeEvidenceRefs(perspective.evidenceRefs ?? []);
    return id && horizon && priorities && concerns && evidenceRefs ? { id, horizon, priorities, concerns, evidenceRefs, authority: 'PERSPECTIVE_ONLY' } : null;
  });
  if (normalized.some((item) => !item)) return deny(['perspective-invalid']);
  const duplicateIds = duplicates(normalized.map((item) => item.id));
  if (duplicateIds.length) return deny(['duplicate-perspective-id'], { duplicatePerspectiveIds: duplicateIds });
  return { ok: true, status: 'FUTURE_SELF_COUNCIL_COMPILED', council: { decision: normalizedDecision, perspectives: normalized, disagreementIsSignal: true, votingAuthority: 'NONE', bindingAuthority: 'NONE', founderDecisionRequired: true }, decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY, externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY, externalEffectLedger: zero() };
}

export function compileAutopoiesisMap({ edges = [] } = {}) {
  if (!Array.isArray(edges) || edges.length > 1000) return deny(['edges-invalid']);
  const normalized = edges.map((edge) => {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) return null;
    const from = text(edge.from, 120);
    const to = text(edge.to, 120);
    const mechanism = text(edge.mechanism, 500);
    const evidenceRefs = normalizeEvidenceRefs(edge.evidenceRefs ?? []);
    const confidence = edge.confidence ?? 0.5;
    return from && to && mechanism && evidenceRefs && bounded(confidence, 0, 1) ? { from, to, mechanism, evidenceRefs, confidence } : null;
  });
  if (normalized.some((item) => !item)) return deny(['autopoiesis-edge-invalid']);
  const adjacency = new Map();
  for (const edge of normalized) adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  const cycles = [];
  const seenCycles = new Set();
  const dfs = (start, node, path, depth) => {
    if (depth > 8) return;
    for (const next of adjacency.get(node) ?? []) {
      if (next === start && path.length >= 2) {
        const cycle = [...path, next];
        const body = cycle.slice(0, -1);
        const key = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)].join('>')).sort()[0];
        if (!seenCycles.has(key)) { seenCycles.add(key); cycles.push(cycle); }
      } else if (!path.includes(next)) dfs(start, next, [...path, next], depth + 1);
    }
  };
  for (const node of adjacency.keys()) dfs(node, node, [node], 0);
  return { ok: true, status: 'LIFE_AUTOPOIESIS_MAP_COMPILED', edges: normalized, reinforcingLoops: cycles, loopCount: cycles.length, loopsAreHypothesesUntilObserved: true, decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY, externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY, externalEffectLedger: zero() };
}

export function compilePersonalCivilizationPlan({ snapshot, interventions = [], experiences = [], futureSelfDecision = null, futureSelfPerspectives = [], autopoiesisEdges = [] } = {}) {
  if (!snapshot || snapshot.schemaVersion !== PERSONAL_CIVILIZATION_KERNEL_VERSION) return deny(['compiled-life-snapshot-required']);
  const ancestral = deriveAncestralCapabilities({ snapshot });
  const possibilities = compileLifePossibilityPortfolio({ snapshot, interventions });
  const experiencePortfolio = compileExperiencePortfolio({ experiences });
  const autopoiesis = compileAutopoiesisMap({ edges: autopoiesisEdges });
  const council = futureSelfDecision === null ? { ok: true, status: 'FUTURE_SELF_COUNCIL_NOT_REQUESTED', council: null } : compileFutureSelfCouncil({ decision: futureSelfDecision, perspectives: futureSelfPerspectives });
  const failed = [ancestral, possibilities, experiencePortfolio, autopoiesis, council].filter((component) => component.ok !== true);
  if (failed.length) return deny(failed.flatMap((component) => component.reasonCodes ?? ['component-failed']));
  const plan = {
    schemaVersion: 'uberbond.personal-civilization-plan.v1.1',
    sourceSnapshotId: snapshot.snapshotId,
    sourceSnapshotDigest: digest(snapshot),
    ancestralCapabilities: ancestral.ancestralCapabilities,
    possibilityPortfolio: possibilities.portfolio,
    experiencePortfolio: { frontier: experiencePortfolio.frontier, noJoylessEfficiencyObjective: experiencePortfolio.noJoylessEfficiencyObjective },
    futureSelfCouncil: council.council,
    autopoiesis: { reinforcingLoops: autopoiesis.reinforcingLoops, loopsAreHypothesesUntilObserved: true },
    constitutionalRules: [
      'FOUNDER_RETAINS_FINAL_DECISION_AUTHORITY',
      'NO_SINGLE_SCALAR_LIFE_UTILITY',
      'NO_EXTERNAL_EFFECTS_FROM_THIS_KERNEL',
      'NO_PUBLIC_PERSISTENCE_OF_PRIVATE_LIFE_STATE',
      'HIGH_STAKES_DOMAINS_REQUIRE_QUALIFIED_REVIEW',
      'SIMULATION_IS_NOT_EVIDENCE',
      'UNCERTAINTY_MUST_REMAIN_VISIBLE'
    ],
    decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
    externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
    externalEffectLedger: zero()
  };
  return { ok: true, status: 'PERSONAL_CIVILIZATION_PLAN_COMPILED', plan, planDigest: digest(plan), decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY, externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY, externalEffectLedger: zero() };
}
