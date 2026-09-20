import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_REALITY_COMPILER_VERSION = 'uberbond.moonshot-reality-compiler.v1';

export const CLAIM_TYPES = Object.freeze([
  'MATHEMATICAL','COMPUTATIONAL','PHYSICAL','BIOLOGICAL','COGNITIVE',
  'INSTITUTIONAL','ECONOMIC','INFRASTRUCTURE','PERSONAL_LIFE','META_RESEARCH','HYBRID'
]);

export const REALITY_STATES = Object.freeze([
  'IMAGINED','FORMALIZED','CONSTRAINT_MAPPED','PLAUSIBILITY_BOUNDED',
  'SIMULATION_READY','SOFTWARE_DEMONSTRATED','EXPERIMENT_READY','EXPERIMENTED',
  'REPRODUCED','ENGINEERABLE','DEPLOYABLE','FIELD_PROVEN','PLATFORM_PRIMITIVE','EPOCH_CANDIDATE'
]);

export const HOLDING_OR_TERMINAL_STATES = Object.freeze([
  'UNKNOWN','EXTERNALLY_BLOCKED','FORMALLY_INCONSISTENT',
  'PHYSICALLY_PROHIBITED_UNDER_CURRENT_EVIDENCE','FALSIFIED',
  'ETHICALLY_OR_LEGALLY_INADMISSIBLE','ARCHIVED_WITH_RESURRECTION_CONDITION'
]);

export const FEASIBILITY_CLASSES = Object.freeze([
  'KNOWN_POSSIBLE',
  'KNOWN_POSSIBLE_BUT_NOT_CURRENTLY_ENGINEERABLE',
  'UNKNOWN_NOT_CURRENTLY_FORBIDDEN',
  'FORMAL_OR_SIMULATED_ONLY',
  'CONFLICTS_WITH_CURRENT_EVIDENCE_OR_LAW',
  'INSUFFICIENT_INFORMATION'
]);

export const CONSTRAINT_CLASSES = Object.freeze([
  'PHYSICS','MATHEMATICS','INFORMATION','COMPUTATION','ENERGY','MATERIAL',
  'MEASUREMENT','FABRICATION','BIOLOGY','SAFETY','RIGHTS','LAW','COST',
  'TIME','DATA','COORDINATION','ADOPTION','AUTHORITY'
]);

const text = (value, max = 2400) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const strings = (value, max = 256, itemMax = 1200) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const item = text(raw, itemMax);
    if (!item) return null;
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
};

const evidenceRefs = value => {
  const refs = strings(value || [], 256, 2000);
  if (!refs) return null;
  return refs.filter(ref => /^(evidence|signal|receipt|test|doc|outcome|experiment|audit|proof|paper|dataset|instrument|replication|synthetic):/i.test(ref));
};

const envelope = extra => ({
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const fail = (status, reasonCodes, extra = {}) => envelope({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const bounded = (value, min = 0, max = 100) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

function normalizeClaim(raw, index) {
  const statement = text(raw?.statement, 2400);
  const type = text(raw?.type, 64)?.toUpperCase();
  const falsifier = text(raw?.falsifier, 1800);
  const refs = evidenceRefs(raw?.evidenceRefs || []);
  const feasibility = text(raw?.feasibility, 80)?.toUpperCase() || 'INSUFFICIENT_INFORMATION';
  const assumptions = strings(raw?.assumptions || [], 64, 800);
  const requiredEvidence = strings(raw?.requiredEvidence || [], 64, 800);
  const reasons = [];
  if (!statement) reasons.push(`claim-${index}-statement-required`);
  if (!CLAIM_TYPES.includes(type)) reasons.push(`claim-${index}-known-type-required`);
  if (!falsifier) reasons.push(`claim-${index}-falsifier-required`);
  if (!refs || refs.length !== (raw?.evidenceRefs || []).length) reasons.push(`claim-${index}-evidence-ref-format-invalid`);
  if (!FEASIBILITY_CLASSES.includes(feasibility)) reasons.push(`claim-${index}-feasibility-invalid`);
  if (!assumptions) reasons.push(`claim-${index}-assumptions-invalid`);
  if (!requiredEvidence) reasons.push(`claim-${index}-required-evidence-invalid`);
  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    claim: {
      claimId: text(raw?.claimId, 160) || `claim-${index + 1}`,
      statement,
      type,
      falsifier,
      feasibility,
      assumptions,
      requiredEvidence,
      evidenceRefs: refs
    }
  };
}

export function compileMoonshot(input = {}) {
  const id = text(input.id, 160)?.toLowerCase();
  const name = text(input.name, 500);
  const thesis = text(input.thesis, 4000);
  const source = text(input.source, 500);
  const aliases = strings(input.aliases || [], 128, 500);
  const domains = strings(input.domains || [], 64, 240);
  const dependencies = strings(input.dependencies || [], 512, 240);
  const unknowns = strings(input.unknowns || [], 256, 1200);
  const constraints = Array.isArray(input.constraints) ? input.constraints : null;
  const rawClaims = Array.isArray(input.claims) ? input.claims : null;
  const reasons = [];

  if (!id || !/^[a-z0-9][a-z0-9._:-]*$/.test(id)) reasons.push('stable-id-required');
  if (!name) reasons.push('literal-name-required');
  if (!thesis) reasons.push('thesis-required');
  if (!source) reasons.push('source-provenance-required');
  if (!aliases || !domains || !dependencies || !unknowns) reasons.push('bounded-list-contract-required');
  if (!rawClaims || rawClaims.length === 0 || rawClaims.length > 128) reasons.push('one-to-128-claims-required');
  if (!constraints || constraints.length > 128) reasons.push('bounded-constraints-required');

  const claims = [];
  if (rawClaims) {
    rawClaims.forEach((raw, index) => {
      const normalized = normalizeClaim(raw, index);
      if (!normalized.ok) reasons.push(...normalized.reasons);
      else claims.push(normalized.claim);
    });
  }

  const normalizedConstraints = [];
  if (constraints) {
    constraints.forEach((raw, index) => {
      const klass = text(raw?.class, 64)?.toUpperCase();
      const description = text(raw?.description, 1600);
      const refs = evidenceRefs(raw?.evidenceRefs || []);
      if (!CONSTRAINT_CLASSES.includes(klass)) reasons.push(`constraint-${index}-class-invalid`);
      if (!description) reasons.push(`constraint-${index}-description-required`);
      if (!refs || refs.length !== (raw?.evidenceRefs || []).length) reasons.push(`constraint-${index}-evidence-ref-format-invalid`);
      if (CONSTRAINT_CLASSES.includes(klass) && description && refs) {
        normalizedConstraints.push({ class: klass, description, evidenceRefs: refs });
      }
    });
  }

  if (reasons.length) return fail('MOONSHOT_INVALID', reasons);

  const moonshot = {
    id,
    name,
    aliases,
    source,
    thesis,
    domains,
    realityState: 'IMAGINED',
    claims,
    constraints: normalizedConstraints,
    dependencies,
    unknowns,
    resurrectionConditions: strings(input.resurrectionConditions || [], 128, 1200) || [],
    irreversibleRisks: strings(input.irreversibleRisks || [], 128, 1200) || [],
    authorityRequirements: strings(input.authorityRequirements || [], 128, 1200) || [],
    createdAt: text(input.createdAt, 80) || null
  };

  return envelope({
    ok: true,
    status: 'MOONSHOT_COMPILED',
    moonshot,
    moonshotDigest: digest(moonshot),
    claimBoundary: 'COMPILED_MOONSHOT_IS_A_RESEARCH_OBJECT__NOT_PROOF_OF_FEASIBILITY_OR_IMPLEMENTATION'
  });
}

export function mapConstraintGenome({ moonshot, addedConstraints = [] } = {}) {
  if (!moonshot?.id || !Array.isArray(moonshot.constraints)) {
    return fail('CONSTRAINT_GENOME_INVALID', ['compiled-moonshot-required']);
  }

  const constraints = [...moonshot.constraints];
  for (const [index, raw] of (Array.isArray(addedConstraints) ? addedConstraints : []).entries()) {
    const klass = text(raw?.class, 64)?.toUpperCase();
    const description = text(raw?.description, 1600);
    const refs = evidenceRefs(raw?.evidenceRefs || []);
    if (!CONSTRAINT_CLASSES.includes(klass) || !description || !refs || refs.length !== (raw?.evidenceRefs || []).length) {
      return fail('CONSTRAINT_GENOME_INVALID', [`added-constraint-${index}-invalid`]);
    }
    constraints.push({ class: klass, description, evidenceRefs: refs });
  }

  const byClass = {};
  for (const row of constraints) (byClass[row.class] ??= []).push(row);

  return envelope({
    ok: true,
    status: 'CONSTRAINT_GENOME_READY',
    moonshotId: moonshot.id,
    realityState: 'CONSTRAINT_MAPPED',
    constraints: byClass,
    unresolvedConstraintClasses: CONSTRAINT_CLASSES.filter(klass => !byClass[klass]?.length),
    claimBoundary: 'UNMAPPED_CONSTRAINT_CLASS_MEANS_UNKNOWN__NOT_ABSENCE_OF_CONSTRAINT'
  });
}

export function buildDependencyGraph({ nodes = [] } = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0 || nodes.length > 10000) {
    return fail('DEPENDENCY_GRAPH_INVALID', ['one-to-10000-nodes-required']);
  }

  const map = new Map();
  for (const raw of nodes) {
    const id = text(raw?.id, 160)?.toLowerCase();
    const requires = strings(raw?.requires || [], 512, 160);
    const state = text(raw?.state, 80)?.toUpperCase() || 'UNKNOWN';
    const experimentallyReachable = raw?.experimentallyReachable === true;
    if (!id || !requires || map.has(id)) return fail('DEPENDENCY_GRAPH_INVALID', ['unique-node-id-and-requires-required']);
    map.set(id, {
      id,
      name: text(raw?.name, 500) || id,
      requires: requires.map(x => x.toLowerCase()),
      state,
      experimentallyReachable,
      evidenceRefs: evidenceRefs(raw?.evidenceRefs || []) || []
    });
  }

  for (const node of map.values()) {
    for (const dep of node.requires) {
      if (!map.has(dep)) return fail('DEPENDENCY_GRAPH_INVALID', [`missing-dependency:${dep}`]);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const order = [];
  function visit(id) {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dep of map.get(id).requires) if (!visit(dep)) return false;
    visiting.delete(id);
    visited.add(id);
    order.push(id);
    return true;
  }
  for (const id of map.keys()) if (!visit(id)) return fail('DEPENDENCY_GRAPH_INVALID', ['dependency-cycle-prohibited']);

  const children = {};
  for (const node of map.values()) {
    for (const dep of node.requires) (children[dep] ??= []).push(node.id);
  }

  const frontier = [...map.values()]
    .filter(node => node.experimentallyReachable)
    .filter(node => node.requires.every(dep => {
      const state = map.get(dep).state;
      return ['SOFTWARE_DEMONSTRATED','EXPERIMENTED','REPRODUCED','ENGINEERABLE','DEPLOYABLE','FIELD_PROVEN','PLATFORM_PRIMITIVE'].includes(state);
    }))
    .map(node => node.id)
    .sort();

  return envelope({
    ok: true,
    status: 'DEPENDENCY_GRAPH_READY',
    nodes: order.map(id => map.get(id)),
    topologicalOrder: order,
    children,
    nearestExperimentFrontier: frontier,
    claimBoundary: 'GRAPH_REPRESENTS_DECLARED_DEPENDENCIES__NOT_PROOF_DEPENDENCIES_ARE_COMPLETE'
  });
}

export function classifyMoonshotFeasibility({ moonshot, assessments = [] } = {}) {
  if (!moonshot?.id || !Array.isArray(moonshot.claims)) {
    return fail('FEASIBILITY_ASSESSMENT_INVALID', ['compiled-moonshot-required']);
  }

  const byId = new Map((Array.isArray(assessments) ? assessments : []).map(row => [row?.claimId, row]));
  const results = moonshot.claims.map(claim => {
    const supplied = byId.get(claim.claimId);
    const feasibility = text(supplied?.feasibility, 80)?.toUpperCase() || claim.feasibility;
    const refs = evidenceRefs(supplied?.evidenceRefs || claim.evidenceRefs || []) || [];
    return {
      claimId: claim.claimId,
      feasibility: FEASIBILITY_CLASSES.includes(feasibility) ? feasibility : 'INSUFFICIENT_INFORMATION',
      evidenceRefs: refs,
      note: text(supplied?.note, 1200) || null
    };
  });

  const prohibited = results.filter(row => row.feasibility === 'CONFLICTS_WITH_CURRENT_EVIDENCE_OR_LAW');
  const unknown = results.filter(row => ['UNKNOWN_NOT_CURRENTLY_FORBIDDEN','INSUFFICIENT_INFORMATION'].includes(row.feasibility));

  return envelope({
    ok: true,
    status: 'FEASIBILITY_BOUNDED',
    moonshotId: moonshot.id,
    realityState: 'PLAUSIBILITY_BOUNDED',
    claimAssessments: results,
    prohibitedClaimIds: prohibited.map(row => row.claimId),
    unknownClaimIds: unknown.map(row => row.claimId),
    overall: prohibited.length ? 'PARTIALLY_OR_FULLY_CONFLICTED' : unknown.length ? 'UNCERTAIN' : 'CURRENTLY_SUPPORTED_AS_PLAUSIBLE',
    claimBoundary: 'PLAUSIBILITY_IS_NOT_IMPLEMENTATION__PHYSICAL_CLAIMS_REQUIRE_EXTERNAL_MEASUREMENT'
  });
}

export function chooseMinimumRealityProbe({ candidates = [] } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 256) {
    return fail('REALITY_PROBE_SELECTION_INVALID', ['one-to-256-candidates-required']);
  }

  const normalized = [];
  for (const [index, raw] of candidates.entries()) {
    const id = text(raw?.id, 160);
    const claimId = text(raw?.claimId, 160);
    const measurement = text(raw?.measurement, 1200);
    const falsifier = text(raw?.falsifier, 1200);
    const informationGain = bounded(raw?.informationGain);
    const cost = bounded(raw?.cost);
    const risk = bounded(raw?.risk);
    const irreversibility = bounded(raw?.irreversibility);
    const delay = bounded(raw?.delay);
    const authorityReady = raw?.authorityReady === true;
    if (!id || !claimId || !measurement || !falsifier || [informationGain,cost,risk,irreversibility,delay].some(v => v == null)) {
      return fail('REALITY_PROBE_SELECTION_INVALID', [`candidate-${index}-contract-invalid`]);
    }
    const denominator = 1 + cost + risk * 2 + irreversibility * 3 + delay;
    const score = Number((informationGain * (authorityReady ? 1 : 0.5) / denominator).toFixed(8));
    normalized.push({ id, claimId, measurement, falsifier, informationGain, cost, risk, irreversibility, delay, authorityReady, score });
  }

  normalized.sort((a,b) => b.score - a.score || a.id.localeCompare(b.id));
  return envelope({
    ok: true,
    status: 'MINIMUM_REALITY_PROBE_SELECTED',
    selected: normalized[0],
    ranked: normalized,
    scoreBoundary: 'SCORE_IS_INTERNAL_VALUE_OF_INFORMATION_HEURISTIC__NOT_TRUTH_OR_SAFETY_CERTIFICATION'
  });
}

export function admitExperiment({
  probe,
  measurableOutcome,
  stopConditions = [],
  authority = 'NONE',
  externalEffects = false,
  legalEthicsReady = false,
  rollbackOrContainment = null
} = {}) {
  const reasons = [];
  if (!probe?.id || !probe?.claimId) reasons.push('probe-required');
  if (!text(measurableOutcome, 1600)) reasons.push('measurable-outcome-required');
  const stops = strings(stopConditions, 64, 1200);
  if (!stops || stops.length === 0) reasons.push('stop-condition-required');
  if (externalEffects && authority !== 'OWNER_AUTHORIZED') reasons.push('owner-authority-required-for-external-effects');
  if (externalEffects && legalEthicsReady !== true) reasons.push('legal-ethics-readiness-required-for-external-effects');
  if (externalEffects && !text(rollbackOrContainment, 1600)) reasons.push('rollback-or-containment-required');
  if (reasons.length) return fail('EXPERIMENT_NOT_ADMITTED', reasons);

  return envelope({
    ok: true,
    status: 'EXPERIMENT_ADMITTED',
    realityState: 'EXPERIMENT_READY',
    probeId: probe.id,
    claimId: probe.claimId,
    measurableOutcome: text(measurableOutcome, 1600),
    stopConditions: stops,
    authority,
    externalEffects,
    legalEthicsReady,
    rollbackOrContainment: text(rollbackOrContainment, 1600),
    executionBoundary: externalEffects ? 'EXPLICIT_EFFECT_AUTHORITY_REQUIRED_AT_EXECUTION' : 'NO_EXTERNAL_EFFECT_AUTHORITY_GRANTED_BY_THIS_OBJECT'
  });
}

const promotionRequirements = Object.freeze({
  FORMALIZED: ['FORMAL_SPEC'],
  CONSTRAINT_MAPPED: ['CONSTRAINT_MAP'],
  PLAUSIBILITY_BOUNDED: ['FEASIBILITY_ASSESSMENT'],
  SIMULATION_READY: ['SIMULATION_PROTOCOL'],
  SOFTWARE_DEMONSTRATED: ['SOFTWARE_RECEIPT'],
  EXPERIMENT_READY: ['PREREGISTERED_PROTOCOL'],
  EXPERIMENTED: ['OBSERVED_OUTCOME'],
  REPRODUCED: ['INDEPENDENT_REPLICATION'],
  ENGINEERABLE: ['ENGINEERING_SPEC_AND_RELIABILITY'],
  DEPLOYABLE: ['DEPLOYMENT_READINESS'],
  FIELD_PROVEN: ['REAL_WORLD_OUTCOME'],
  PLATFORM_PRIMITIVE: ['CROSS_DOMAIN_REUSE'],
  EPOCH_CANDIDATE: ['BROAD_DESCENDANT_EVIDENCE']
});

export function evaluatePromotion({ currentState = 'IMAGINED', targetState, evidenceKinds = [], evidenceRefs: suppliedRefs = [] } = {}) {
  const from = text(currentState, 80)?.toUpperCase();
  const to = text(targetState, 80)?.toUpperCase();
  const kinds = strings(evidenceKinds, 128, 160);
  const refs = evidenceRefs(suppliedRefs);
  if (!REALITY_STATES.includes(from) || !REALITY_STATES.includes(to) || !kinds || !refs) {
    return fail('PROMOTION_INVALID', ['valid-states-evidence-contract-required']);
  }
  if (REALITY_STATES.indexOf(to) <= REALITY_STATES.indexOf(from)) {
    return fail('PROMOTION_INVALID', ['target-must-be-later-reality-state']);
  }

  const required = promotionRequirements[to] || [];
  const missing = required.filter(req => !kinds.includes(req));
  const contiguous = REALITY_STATES.indexOf(to) === REALITY_STATES.indexOf(from) + 1;

  return envelope({
    ok: true,
    status: missing.length || !contiguous ? 'PROMOTION_DENIED' : 'PROMOTION_ELIGIBLE_FOR_EXTERNAL_REVIEW',
    from,
    to,
    contiguous,
    requiredEvidenceKinds: required,
    missingEvidenceKinds: missing,
    evidenceKinds: kinds,
    evidenceRefs: refs,
    promotionAuthority: 'REVIEW_REQUIRED__NO_SELF_PROMOTION',
    claimBoundary: 'ELIGIBILITY_IS_NOT_PROMOTION__EXACT_EVIDENCE_MUST_BE_REVIEWED'
  });
}

export function scoreRealityLeverage(input = {}) {
  const fields = [
    'informationGain','prerequisiteCentrality','expectedBranchFactor','transferBreadth',
    'optionValue','reversibility','evidenceQuality','computeCost','capitalCost',
    'founderMinutes','timeDelay','safetyRisk','irreversibility','dependencyFragility'
  ];
  const values = {};
  for (const field of fields) {
    values[field] = bounded(input[field]);
    if (values[field] == null) return fail('REALITY_LEVERAGE_INVALID', [`${field}-must-be-0-to-100`]);
  }

  const numerator =
    (1 + values.informationGain) *
    (1 + values.prerequisiteCentrality) *
    (1 + values.expectedBranchFactor) *
    (1 + values.transferBreadth) *
    (1 + values.optionValue) *
    (1 + values.reversibility) *
    (1 + values.evidenceQuality);

  const denominator = 1 +
    values.computeCost +
    values.capitalCost +
    values.founderMinutes +
    values.timeDelay +
    values.safetyRisk * 2 +
    values.irreversibility * 3 +
    values.dependencyFragility;

  const logScore = Number((Math.log10(numerator / denominator)).toFixed(6));
  return envelope({
    ok: true,
    status: 'REALITY_LEVERAGE_SCORED',
    logScore,
    dimensions: values,
    scoreBoundary: 'INTERNAL_PORTFOLIO_HEURISTIC__NOT_FEASIBILITY_PROOF__NOT_CIVILIZATION_IMPACT_PROOF'
  });
}

export function preserveUsefulDescendantsAfterFailure({ moonshotId, failedClaimId, descendants = [], resurrectionCondition = null } = {}) {
  const id = text(moonshotId, 160);
  const claimId = text(failedClaimId, 160);
  if (!id || !claimId || !Array.isArray(descendants) || descendants.length > 512) {
    return fail('FAILURE_PRESERVATION_INVALID', ['moonshot-claim-and-bounded-descendants-required']);
  }

  const preserved = descendants
    .map(row => ({
      id: text(row?.id, 160),
      thesis: text(row?.thesis, 2000),
      independentOfFailedClaim: row?.independentOfFailedClaim === true,
      evidenceRefs: evidenceRefs(row?.evidenceRefs || []) || []
    }))
    .filter(row => row.id && row.thesis);

  return envelope({
    ok: true,
    status: 'FAILURE_PRESERVED_WITHOUT_AMPUTATION',
    moonshotId: id,
    failedClaimId: claimId,
    preservedDescendants: preserved,
    independentlyContinuable: preserved.filter(row => row.independentOfFailedClaim).map(row => row.id),
    resurrectionCondition: text(resurrectionCondition, 1600),
    law: 'PARENT_FAILURE_DOES_NOT_DELETE_DESCENDANT_VALUE__FAILED_CLAIM_DOES_NOT_COUNT_AS_ACHIEVED'
  });
}
