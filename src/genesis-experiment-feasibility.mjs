import {
  compileBoundedExperiment,
  REVERSIBILITY_CLASSES
} from './genesis-boundary-experiment.mjs';

export const GENESIS_EXPERIMENT_FEASIBILITY_VERSION = 'uberbond.genesis-experiment-feasibility.v1.2';

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const count = (value, max) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : null;
};

const canonical = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'EXPERIMENT_FEASIBILITY_INVALID',
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
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

function validateEffects(effects = {}) {
  if (!effects || typeof effects !== 'object' || Array.isArray(effects)) {
    return fail(['effects-object-required']);
  }
  for (const [field, max] of [['spendCents', 1e12], ['providerCalls', 1e9]]) {
    if (effects[field] === undefined || effects[field] === null) continue;
    if (count(effects[field], max) === null) return fail([`${field}-must-be-a-non-negative-safe-integer`]);
  }
  for (const field of [
    'customerContact', 'deployment', 'credentialChange', 'dnsChange', 'productionMutation'
  ]) {
    if (effects[field] === undefined || effects[field] === null) continue;
    if (typeof effects[field] !== 'boolean') return fail([`${field}-must-be-boolean`]);
  }
  return { ok: true };
}

/**
 * Hardened feasibility adapter over the mature GENESIS boundary compiler.
 *
 * The mature core remains authority for reversibility, blast radius and effect
 * scopes. This adapter makes feasibility inspectable before core compilation:
 * an actual probe is required; cost/time must fit; a probe needs a measure,
 * decision rule and distinct competing outcomes; malformed effect fields and
 * reversibility typos fail closed. A caller-written `discriminating: true`
 * flag carries no evidence by itself.
 */
export function compileFeasibleBoundedExperiment(input = {}) {
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

  const effectCheck = validateEffects(input?.effects ?? {});
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

  const core = compileBoundedExperiment({
    ...input,
    reversibility,
    costCeilingCents: costCeiling,
    timeCeilingMinutes: timeCeiling,
    probes: feasible.map(probe => ({
      description: probe.description,
      costCents: probe.costCents,
      timeMinutes: probe.timeMinutes,
      reversibility: probe.reversibility,
      discriminating: true
    }))
  });
  if (!core?.ok) return { ...core, feasibilityAdapter: GENESIS_EXPERIMENT_FEASIBILITY_VERSION };

  const selected = feasible.find(probe =>
    probe.description === core.probe?.description
    && probe.costCents === core.probe?.costCents
    && probe.timeMinutes === core.probe?.timeMinutes
  );
  if (!selected) return fail(['core-selected-probe-could-not-be-bound-to-feasibility-evidence']);

  const declaredSpend = count(input?.effects?.spendCents ?? 0, 1e12) ?? 0;
  if (selected.costCents < declaredSpend) {
    return fail(['selected-probe-cost-understates-declared-spend'], {
      selectedProbeCostCents: selected.costCents,
      declaredSpendCents: declaredSpend
    });
  }

  return {
    ...core,
    status: core.runnable ? 'FEASIBLE_EXPERIMENT_COMPILED' : 'FEASIBLE_EXPERIMENT_REQUIRES_EXPLICIT_AUTHORITY',
    probe: {
      ...core.probe,
      measure: selected.measure,
      decisionRule: selected.decisionRule,
      supportsHypothesis: selected.supportsHypothesis,
      falsifiesHypothesis: selected.falsifiesHypothesis,
      structuralDiscrimination: selected.structuralDiscrimination
    },
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
    truthBoundary: 'STRUCTURAL_DISCRIMINATION_AND_BUDGET_FIT_DO_NOT_PROVE_THE_EXPERIMENT_WILL_BE_INFORMATIVE_IN_REALITY.',
    businessEffectAuthority: 'NONE'
  };
}
