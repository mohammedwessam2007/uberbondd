import crypto from 'node:crypto';
import { compileBoundedExperiment as compileCanonicalBoundedExperiment } from './bounded-experiment-compiler.mjs';
import {
  REVERSIBILITY_CLASSES,
  BLAST_RADII
} from './genesis-boundary-experiment.mjs';

export const GENESIS_EXPERIMENT_FEASIBILITY_VERSION = 'uberbond.genesis-experiment-feasibility.v2';
export const GENESIS_EXPERIMENT_POLICY_CORE = 'uberbond.bounded-experiment-compiler.v1';

const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const count = (value, max) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : null;
};

const canonical = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);

const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'EXPERIMENT_FEASIBILITY_INVALID',
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});

function normalizeProbe(raw, defaults) {
  const description = text(raw?.description, 2000);
  const costCents = count(raw?.costCents, 1e12);
  const timeMinutes = count(raw?.timeMinutes, 1e9);
  const measure = text(raw?.measure, 1200);
  const decisionRule = text(raw?.decisionRule, 2000);
  const supportsHypothesis = text(raw?.supportsHypothesis, 2000);
  const falsifiesHypothesis = text(raw?.falsifiesHypothesis, 2000);
  const reversibility = raw?.reversibility === undefined || raw?.reversibility === null
    ? defaults.reversibility
    : String(raw.reversibility);

  const reasons = [];
  if (!description) reasons.push('probe-description-required');
  if (costCents === null) reasons.push('probe-non-negative-cost-required');
  if (timeMinutes === null) reasons.push('probe-non-negative-time-required');
  if (!measure) reasons.push('probe-measure-required');
  if (!decisionRule) reasons.push('probe-decision-rule-required');
  if (!supportsHypothesis) reasons.push('probe-supporting-observation-required');
  if (!falsifiesHypothesis) reasons.push('probe-falsifying-observation-required');
  if (!REVERSIBILITY_CLASSES.includes(reversibility)) reasons.push('probe-recognized-reversibility-required');
  if (supportsHypothesis && falsifiesHypothesis && canonical(supportsHypothesis) === canonical(falsifiesHypothesis)) {
    reasons.push('probe-competing-observations-must-differ');
  }
  if (reasons.length) return { ok: false, reasons };

  return {
    ok: true,
    probe: {
      description,
      costCents,
      timeMinutes,
      reversibility,
      measure,
      decisionRule,
      supportsHypothesis,
      falsifiesHypothesis,
      structuralDiscrimination: 'EXPLICIT_MEASURE_RULE_AND_COMPETING_OBSERVATIONS_NOT_EMPIRICALLY_VALIDATED'
    }
  };
}

function normalizeEffects(effects = {}) {
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) {
    return fail(['effects-object-required']);
  }
  const normalized = {
    spendCents: 0,
    providerCalls: 0,
    customerContact: false,
    deployment: false,
    credentialChange: false,
    dnsChange: false,
    productionMutation: false
  };
  for (const [field, max] of [['spendCents', 1e12], ['providerCalls', 1e9]]) {
    if (effects[field] === undefined || effects[field] === null) continue;
    const value = count(effects[field], max);
    if (value === null) return fail([`${field}-must-be-a-non-negative-safe-integer`]);
    normalized[field] = value;
  }
  for (const field of ['customerContact', 'deployment', 'credentialChange', 'dnsChange', 'productionMutation']) {
    if (effects[field] === undefined || effects[field] === null) continue;
    if (typeof effects[field] !== 'boolean') return fail([`${field}-must-be-boolean`]);
    normalized[field] = effects[field];
  }
  return { ok: true, effects: normalized };
}

function authorityFor(effects, reversibility, blastRadius) {
  const scopes = [];
  if (effects.spendCents > 0) scopes.push('SPEND');
  if (effects.customerContact) scopes.push('CUSTOMER_CONTACT');
  if (effects.providerCalls > 0) scopes.push('PROVIDER_CALL');
  if (effects.deployment) scopes.push('DEPLOYMENT');
  if (effects.credentialChange) scopes.push('CREDENTIAL_CHANGE');
  if (effects.dnsChange) scopes.push('DNS_CHANGE');
  if (effects.productionMutation) scopes.push('PRODUCTION_MUTATION');
  if (reversibility !== 'REVERSIBLE') scopes.push('IRREVERSIBLE_ACTION');
  if (blastRadius !== 'LOCAL_ONLY' && blastRadius !== 'REPOSITORY') scopes.push('BLAST_RADIUS_BEYOND_LOCAL');
  return [...new Set(scopes)];
}

function chooseSmallestProbe(feasible) {
  return [...feasible].sort((a, b) => (
    (a.reversibility === 'REVERSIBLE' ? 0 : 1) - (b.reversibility === 'REVERSIBLE' ? 0 : 1)
    || a.costCents - b.costCents
    || a.timeMinutes - b.timeMinutes
    || a.description.localeCompare(b.description)
  ))[0];
}

/**
 * GENESIS-specific adapter over the single canonical bounded-experiment policy.
 *
 * Canonical core ownership:
 * - rival-hypothesis discrimination;
 * - budget and time bounds;
 * - probe reversibility;
 * - generic Intent Compiler permission boundary.
 *
 * GENESIS ownership here is intentionally narrower:
 * - measure / decision-rule evidence required before a probe counts as structurally discriminating;
 * - legacy blast-radius and effect-scope classification is retained as a STRICTER NON-GRANTING boundary;
 * - GENESIS never turns that classification into authority or execution.
 *
 * `genesis-boundary-experiment.mjs` still owns possibility/ontology/surprise semantics,
 * but its legacy experiment compiler is no longer the production feasibility policy path.
 */
export function compileFeasibleBoundedExperiment(input = {}) {
  const hypothesis = text(input?.hypothesis, 4000);
  const falsifier = text(input?.falsifier, 4000);
  if (!hypothesis) return fail(['hypothesis-required']);
  if (!falsifier) return fail(['falsifier-required']);

  const probes = input?.probes;
  if (!Array.isArray(probes) || probes.length === 0 || probes.length > 256) {
    return fail(['at-least-one-bounded-probe-required'], {
      why: 'A hypothesis and falsifier with no action is an experiment plan, not a runnable experiment.'
    });
  }

  const costCeiling = count(input?.costCeilingCents ?? 0, 1e12);
  const timeCeiling = count(input?.timeCeilingMinutes ?? 0, 1e9);
  if (costCeiling === null || timeCeiling === null) {
    return fail(['non-negative-cost-and-time-ceilings-required']);
  }

  const reversibility = input?.reversibility === undefined || input?.reversibility === null
    ? 'REVERSIBLE'
    : String(input.reversibility);
  if (!REVERSIBILITY_CLASSES.includes(reversibility)) {
    return fail(['recognized-reversibility-class-required']);
  }

  const blastRadius = input?.blastRadius === undefined || input?.blastRadius === null
    ? 'LOCAL_ONLY'
    : String(input.blastRadius);
  if (!BLAST_RADII.includes(blastRadius)) {
    return fail(['recognized-blast-radius-required']);
  }

  const effectCheck = normalizeEffects(input?.effects ?? {});
  if (!effectCheck.ok) return effectCheck;

  const normalized = [];
  const seenDescriptions = new Set();
  for (let index = 0; index < probes.length; index += 1) {
    const result = normalizeProbe(probes[index], { reversibility });
    if (!result.ok) return fail(result.reasons, { probeIndex: index });
    if (seenDescriptions.has(result.probe.description)) {
      return fail(['probe-descriptions-must-be-unique'], { probeIndex: index });
    }
    seenDescriptions.add(result.probe.description);
    normalized.push(result.probe);
  }

  const discardedProbes = [];
  const feasible = [];
  for (const probe of normalized) {
    const reasons = [];
    if (probe.costCents > costCeiling) reasons.push('probe-cost-exceeds-cost-ceiling');
    if (probe.timeMinutes > timeCeiling) reasons.push('probe-time-exceeds-time-ceiling');
    if (reasons.length) {
      discardedProbes.push({
        description: probe.description,
        discardReasons: reasons,
        costCents: probe.costCents,
        timeMinutes: probe.timeMinutes
      });
    } else {
      feasible.push(probe);
    }
  }

  if (!feasible.length) {
    return fail(['no-probe-fits-declared-cost-and-time-ceilings'], {
      costCeilingCents: costCeiling,
      timeCeilingMinutes: timeCeiling,
      discardedProbes
    });
  }

  const selected = chooseSmallestProbe(feasible);
  const declaredSpend = effectCheck.effects.spendCents;
  if (selected.costCents < declaredSpend) {
    return fail(['selected-probe-cost-understates-declared-spend'], {
      selectedProbeCostCents: selected.costCents,
      declaredSpendCents: declaredSpend
    });
  }

  const requiredAuthority = authorityFor(effectCheck.effects, selected.reversibility, blastRadius);
  const canonicalCore = compileCanonicalBoundedExperiment({
    mission: input?.mission || hypothesis,
    hypotheses: [
      { id: 'HYPOTHESIS_SUPPORTED', predictedObservations: [selected.supportsHypothesis] },
      { id: 'HYPOTHESIS_FALSIFIED', predictedObservations: [selected.falsifiesHypothesis] }
    ],
    probe: {
      description: selected.description,
      costCents: selected.costCents,
      timeMinutes: selected.timeMinutes,
      reversibility: selected.reversibility,
      effects: [],
      declaredEffectCount: 0
    },
    budget: {
      maxCostCents: Math.min(costCeiling, 1_000_000_000),
      maxTimeMinutes: Math.min(timeCeiling, 60 * 24 * 365),
      maxDeclaredEffects: 0
    },
    capabilities: selected.costCents > 0 ? ['genesis-bounded-probe'] : [],
    resources: selected.costCents > 0 ? ['declared-bounded-resources'] : [],
    authority: input?.authority ?? null
  });

  const canonicalAuthorityStop = canonicalCore?.status === 'EXPERIMENT_AUTHORITY_REQUIRED';
  if (!canonicalCore?.ok && !canonicalAuthorityStop) {
    return fail(canonicalCore?.reasonCodes || ['canonical-bounded-experiment-core-refused'], {
      canonicalBoundedExperiment: canonicalCore,
      policyCore: GENESIS_EXPERIMENT_POLICY_CORE
    });
  }

  const genericEffectBoundary = canonicalAuthorityStop
    || canonicalCore?.status === 'BOUNDED_EXPERIMENT_FEASIBLE__SEPARATE_EXECUTOR_REQUIRED';
  const runnable = requiredAuthority.length === 0
    && !genericEffectBoundary
    && canonicalCore?.status === 'BOUNDED_ZERO_EFFECT_EXPERIMENT_FEASIBLE';

  return {
    ok: true,
    status: runnable ? 'FEASIBLE_EXPERIMENT_COMPILED' : 'FEASIBLE_EXPERIMENT_REQUIRES_EXPLICIT_AUTHORITY',
    experimentId: `exp_genesis_${digest({ hypothesis, falsifier, selected, blastRadius })}`,
    hypothesis,
    falsifier,
    probe: {
      description: selected.description,
      costCents: selected.costCents,
      timeMinutes: selected.timeMinutes,
      reversibility: selected.reversibility,
      declaredEffectCount: 0,
      effects: [],
      measure: selected.measure,
      decisionRule: selected.decisionRule,
      supportsHypothesis: selected.supportsHypothesis,
      falsifiesHypothesis: selected.falsifiesHypothesis,
      structuralDiscrimination: selected.structuralDiscrimination
    },
    discardedProbes,
    costCeilingCents: costCeiling,
    timeCeilingMinutes: timeCeiling,
    reversibility: selected.reversibility,
    blastRadius,
    declaredEffects: effectCheck.effects,
    requiredAuthority,
    runnable,
    canonicalBoundedExperiment: canonicalCore,
    policyCore: GENESIS_EXPERIMENT_POLICY_CORE,
    policyComposition: 'GENERIC_BOUNDED_EXPERIMENT_CORE__GENESIS_MEASURE_EVIDENCE_AND_NON_GRANTING_BLAST_RADIUS_CLASSIFICATION',
    authorityRule: 'CAPABILITY_NEVER_CREATES_AUTHORITY__GENESIS_EFFECT_CLASSIFICATION_CAN_ONLY_ADD_BLOCKERS',
    feasibility: {
      adapterVersion: GENESIS_EXPERIMENT_FEASIBILITY_VERSION,
      costFits: selected.costCents <= costCeiling,
      timeFits: selected.timeMinutes <= timeCeiling,
      hasExecutableProbe: true,
      hasExplicitMeasure: true,
      hasExplicitDecisionRule: true,
      hasExplicitCompetingOutcomes: true,
      empiricallyValidatedDiscrimination: false,
      discardedProbes
    },
    truthBoundary: 'STRUCTURAL_DISCRIMINATION_AND_BUDGET_FIT_DO_NOT_PROVE_THE_EXPERIMENT_WILL_BE_INFORMATIVE_IN_REALITY. EFFECT_CLASSIFICATION_NEVER_GRANTS_AUTHORITY.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
