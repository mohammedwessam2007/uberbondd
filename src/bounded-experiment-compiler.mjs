import { compileIntent, externalityMap, REVERSIBILITY } from './intent-compiler.mjs';

export const BOUNDED_EXPERIMENT_COMPILER_VERSION = 'uberbond.bounded-experiment-compiler.v1';

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

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});

const integer = (value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const uniqueText = (values, maxItems = 80) => [...new Set(
  (Array.isArray(values) ? values : [])
    .map(value => text(value, 500))
    .filter(Boolean)
)].slice(0, maxItems);

const observationSignature = values => uniqueText(values)
  .map(value => value.toLowerCase().replace(/\s+/g, ' ').trim())
  .sort()
  .join('|');

function normalizeBudget(input = {}) {
  const maxCostCents = integer(input.maxCostCents, { min: 0, max: 1_000_000_000 });
  const maxTimeMinutes = integer(input.maxTimeMinutes, { min: 0, max: 60 * 24 * 365 });
  const maxDeclaredEffects = integer(input.maxDeclaredEffects, { min: 0, max: 100 });
  if (maxCostCents === null || maxTimeMinutes === null || maxDeclaredEffects === null) return null;
  return { maxCostCents, maxTimeMinutes, maxDeclaredEffects };
}

function normalizeHypotheses(input = []) {
  const rows = [];
  for (const row of Array.isArray(input) ? input : []) {
    const id = text(row?.id, 160);
    const predictedObservations = uniqueText(row?.predictedObservations);
    if (!id || !predictedObservations.length) return null;
    rows.push({ id, predictedObservations, signature: observationSignature(predictedObservations) });
  }
  const ids = rows.map(row => row.id);
  if (rows.length < 2 || new Set(ids).size !== ids.length) return null;
  return rows;
}

function validateEffects(effects = []) {
  const declared = Array.isArray(effects) ? effects : [];
  const malformed = declared.filter(row =>
    !text(row?.party, 80) ||
    !text(row?.effect, 500) ||
    !REVERSIBILITY.includes(row?.reversibility)
  );
  if (malformed.length) return { ok: false, reasonCodes: ['declared-effect-contract-invalid'] };
  const mapped = externalityMap({ decision: 'bounded experiment probe', effects: declared });
  if (!mapped.ok || mapped.effects.length !== declared.length) {
    return { ok: false, reasonCodes: ['declared-effect-contract-invalid'] };
  }
  const irreversible = mapped.effects.filter(row =>
    row.reversibility === 'PRACTICALLY_IRREVERSIBLE' ||
    row.reversibility === 'PHYSICALLY_IRREVERSIBLE'
  );
  const withoutConsent = mapped.effects.filter(row => row.party !== 'FOUNDER' && row.consented !== true);
  return { ok: true, mapped, irreversible, withoutConsent };
}

/**
 * Compile whether a proposed experiment deserves execution consideration.
 *
 * This module does not execute anything and never creates authority. Budget,
 * discrimination and reversibility are feasibility questions. Permission is
 * delegated to the existing Intent Compiler so descriptive fields cannot turn
 * into execution authority by accident.
 */
export function compileBoundedExperiment({
  mission = null,
  hypotheses = [],
  probe = null,
  budget = null,
  capabilities = [],
  resources = [],
  authority = null
} = {}) {
  const wanted = text(mission, 1200);
  const description = text(probe?.description, 2000);
  if (!wanted || !description) return fail('EXPERIMENT_INVALID', ['mission-and-probe-description-required']);

  const bounds = normalizeBudget(budget || {});
  if (!bounds) return fail('EXPERIMENT_INVALID', ['valid-budget-contract-required']);

  const rivals = normalizeHypotheses(hypotheses);
  if (!rivals) return fail('EXPERIMENT_INVALID', ['two-unique-hypotheses-with-predictions-required']);

  const costCents = integer(probe?.costCents, { min: 0, max: 1_000_000_000 });
  const timeMinutes = integer(probe?.timeMinutes, { min: 0, max: 60 * 24 * 365 });
  const reversibility = REVERSIBILITY.includes(probe?.reversibility) ? probe.reversibility : null;
  if (costCents === null || timeMinutes === null || !reversibility) {
    return fail('EXPERIMENT_INVALID', ['valid-probe-cost-time-and-reversibility-required']);
  }

  const declaredEffects = Array.isArray(probe?.effects) ? probe.effects : [];
  const declaredEffectCount = probe?.declaredEffectCount === undefined
    ? declaredEffects.length
    : integer(probe.declaredEffectCount, { min: 0, max: 100 });
  if (declaredEffectCount === null || declaredEffectCount !== declaredEffects.length) {
    return fail('EXPERIMENT_REFUSED', ['declared-effect-count-mismatch']);
  }

  const effectCheck = validateEffects(declaredEffects);
  if (!effectCheck.ok) return fail('EXPERIMENT_REFUSED', effectCheck.reasonCodes);

  const budgetReasons = [];
  if (costCents > bounds.maxCostCents) budgetReasons.push('probe-cost-exceeds-ceiling');
  if (timeMinutes > bounds.maxTimeMinutes) budgetReasons.push('probe-time-exceeds-ceiling');
  if (declaredEffects.length > bounds.maxDeclaredEffects) budgetReasons.push('probe-effects-exceed-ceiling');
  if (budgetReasons.length) {
    return fail('EXPERIMENT_BUDGET_EXCEEDED', budgetReasons, {
      observed: { costCents, timeMinutes, declaredEffectCount: declaredEffects.length },
      budget: bounds
    });
  }

  const uniqueOutcomeSignatures = new Set(rivals.map(row => row.signature));
  if (uniqueOutcomeSignatures.size < 2) {
    return fail('EXPERIMENT_NOT_DISCRIMINATING', ['rival-hypotheses-predict-identical-observations'], {
      hypothesisIds: rivals.map(row => row.id)
    });
  }

  const irreversibleProbe = reversibility === 'PRACTICALLY_IRREVERSIBLE' || reversibility === 'PHYSICALLY_IRREVERSIBLE';
  if (irreversibleProbe || effectCheck.irreversible.length) {
    return fail('EXPERIMENT_REFUSED', ['irreversible-probe-not-admissible'], {
      irreversibleEffects: effectCheck.irreversible
    });
  }
  if (effectCheck.withoutConsent.length) {
    return fail('EXPERIMENT_REFUSED', ['effects-on-others-require-recorded-consent'], {
      effectsWithoutConsent: effectCheck.withoutConsent
    });
  }

  const effectful = costCents > 0 || declaredEffects.length > 0;
  let permissionCompilation = null;
  if (effectful) {
    permissionCompilation = compileIntent({
      will: wanted,
      constraints: [
        `maxCostCents=${bounds.maxCostCents}`,
        `maxTimeMinutes=${bounds.maxTimeMinutes}`,
        `maxDeclaredEffects=${bounds.maxDeclaredEffects}`
      ],
      plan: description,
      capabilities,
      resources,
      authority
    });
    if (permissionCompilation.status !== 'READY_FOR_ACTION') {
      return fail('EXPERIMENT_AUTHORITY_REQUIRED', ['existing-intent-compiler-did-not-reach-permissions'], {
        permissionCompilation
      });
    }
  }

  return {
    ok: true,
    status: effectful ? 'BOUNDED_EXPERIMENT_FEASIBLE__SEPARATE_EXECUTOR_REQUIRED' : 'BOUNDED_ZERO_EFFECT_EXPERIMENT_FEASIBLE',
    mission: wanted,
    hypotheses: rivals.map(({ id, predictedObservations }) => ({ id, predictedObservations })),
    probe: {
      description,
      costCents,
      timeMinutes,
      reversibility,
      declaredEffectCount: declaredEffects.length,
      effects: effectCheck.mapped.effects
    },
    budget: bounds,
    discrimination: {
      uniquePredictionSignatures: uniqueOutcomeSignatures.size,
      discriminating: true
    },
    permissionCompilation,
    authorityBoundary: 'FEASIBILITY_DOES_NOT_CREATE_EXECUTION_AUTHORITY__DESCRIPTIVE_FIELDS_ARE_NEVER_PERMISSION',
    executionAdmission: effectful
      ? 'AUTHORITY_WAS_PRESENTED_TO_INTENT_COMPILER__A_SEPARATE_EXECUTOR_MUST_STILL_DECIDE_AND_RECONCILE_EFFECTS'
      : 'ZERO_EFFECT_FEASIBILITY_ONLY__NO_EXTERNAL_ACTION_COMPILED',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
