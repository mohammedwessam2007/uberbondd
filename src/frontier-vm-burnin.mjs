import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { qualityInvariantAttestation } from './absolute-frontier-quality-invariant.mjs';
import { certifyCanonicalZeroLoss, validateCanonicalZeroLossCertificate } from './canonical-zero-loss-certificate.mjs';
import { validateCompiledSealedArchitectureTrial } from './apex-sealed-tournament.mjs';

export const FRONTIER_VM_BURNIN_VERSION = 'uberbond.frontier-vm-burnin.v1';

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : (!value || typeof value !== 'object')
    ? value
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const unique = values => [...new Set(values.filter(Boolean))];

function envelope(extra = {}) {
  return {
    burnInVersion: FRONTIER_VM_BURNIN_VERSION,
    absoluteQualityInvariant: qualityInvariantAttestation(),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function fail(status, reasonCodes, extra = {}) {
  return envelope({
    ok: false,
    status,
    reasonCodes: unique(reasonCodes),
    ...extra
  });
}

export function compileFrontierVmBurnInCampaign({
  campaignId,
  taskClass,
  crownArchitecture,
  candidateArchitecture,
  compilerPasses = [],
  minimumTaskCount = 100,
  monthlyBudgetUsd = 30,
  ablationBudgetFraction = 0.25,
  requireEconomicsImprovement = true
} = {}) {
  const id = text(campaignId, 240);
  const klass = text(taskClass, 160).toLowerCase();
  const crownId = text(crownArchitecture?.architectureId, 240).toLowerCase();
  const crownDigest = text(crownArchitecture?.architectureDigest, 128).toLowerCase();
  const candidateId = text(candidateArchitecture?.architectureId, 240).toLowerCase();
  const candidateDigest = text(candidateArchitecture?.architectureDigest, 128).toLowerCase();
  const passes = unique(compilerPasses.map(v => text(v, 160).toUpperCase()));
  const minTasks = integer(minimumTaskCount, 20, 100000);
  const budget = finite(monthlyBudgetUsd, 1, 1_000_000);
  const ablationFraction = finite(ablationBudgetFraction, 0, 0.8);
  const reasons = [];

  if (!id || !klass) reasons.push('campaign-id-and-task-class-required');
  if (!crownId || !/^[a-f0-9]{64}$/.test(crownDigest)) reasons.push('frozen-crown-architecture-required');
  if (!candidateId || !/^[a-f0-9]{64}$/.test(candidateDigest)) reasons.push('frozen-candidate-architecture-required');
  if (crownId === candidateId) reasons.push('baseline-and-candidate-must-differ');
  if (!passes.length) reasons.push('at-least-one-compiler-pass-required');
  if (minTasks == null || budget == null || ablationFraction == null) reasons.push('valid-bounds-required');
  if (reasons.length) return fail('FRONTIER_VM_BURNIN_REFUSED', reasons);

  const ablationBudgetUsd = budget * ablationFraction;
  const primaryBudgetUsd = budget - ablationBudgetUsd;
  const variants = [
    {
      variantId: crownId,
      role: 'DIRECT_CROWN_BASELINE',
      architectureDigest: crownDigest,
      enabledPasses: [],
      disabledPasses: passes,
      qualityAuthority: 'FRONTIER_BASELINE'
    },
    {
      variantId: candidateId,
      role: 'FULL_COMPILED_CANDIDATE',
      architectureDigest: candidateDigest,
      enabledPasses: passes,
      disabledPasses: [],
      qualityAuthority: 'NONE_BEFORE_CERTIFICATION'
    },
    ...passes.map(pass => ({
      variantId: `${candidateId}::ablate::${pass.toLowerCase()}`,
      role: 'ABLATION_CHALLENGER',
      parentArchitectureId: candidateId,
      enabledPasses: passes.filter(x => x !== pass),
      disabledPasses: [pass],
      qualityAuthority: 'NONE'
    }))
  ];

  const body = {
    campaignId: id,
    taskClass: klass,
    minimumTaskCount: minTasks,
    monthlyBudgetUsd: budget,
    requireEconomicsImprovement: requireEconomicsImprovement === true,
    primaryBudgetUsd,
    ablationBudgetUsd,
    variants,
    experimentOrder: [
      'FREEZE_ARCHITECTURES_AND_HOLDOUT_COMMITMENT',
      'RUN_DIRECT_CROWN_BASELINE',
      'RUN_FULL_COMPILED_CANDIDATE_ON_IDENTICAL_SEALED_TASKS',
      'ATTEMPT_CANONICAL_ZERO_LOSS_CERTIFICATION',
      'RUN_ABLATIONS_ONLY_WITHIN_RESERVED_ABLATION_BUDGET',
      'MEASURE_PASS_CONTRIBUTION_AND_ROUTING_REGRET',
      'PROMOTE_NOTHING_AUTOMATICALLY',
      'KEEP_SHADOW_AUDITS_AFTER_ANY_GOVERNED_PROMOTION'
    ]
  };

  return envelope({
    ok: true,
    status: 'FRONTIER_VM_BURNIN_CAMPAIGN_COMPILED',
    campaign: {
      ...body,
      campaignDigest: `sha256:${digest(body)}`
    },
    rawHoldoutsAuthorizedInRepository: false,
    optimizerMaySeeHoldoutAnswersBeforeEvaluation: false,
    promotionAuthority: 'NONE',
    law: 'THE_THEORY_MUST_SURVIVE_IDENTICAL_SEALED_TASKS_AGAINST_THE_DIRECT_CURRENT_CROWN_BEFORE_COST_COMPRESSION_COUNTS'
  });
}

export function certifyBurnInPair({
  baselineTrial,
  candidateTrial,
  requireEconomicsImprovement = true,
  minimumTaskCount = 100
} = {}) {
  const baseline = validateCompiledSealedArchitectureTrial(baselineTrial);
  const candidate = validateCompiledSealedArchitectureTrial(candidateTrial);
  const minTasks = integer(minimumTaskCount, 1, 1_000_000);
  const reasons = [];
  if (!baseline.ok) reasons.push('canonical-sealed-baseline-required');
  if (!candidate.ok) reasons.push('canonical-sealed-candidate-required');
  if (minTasks == null) reasons.push('valid-minimum-task-count-required');
  if (reasons.length) return fail('FRONTIER_VM_BURNIN_PAIR_REFUSED', reasons);

  const certification = certifyCanonicalZeroLoss({
    baselineTrial,
    candidateTrial,
    requireEconomicsImprovement: requireEconomicsImprovement === true
  });
  if (!certification.ok) {
    return fail('FRONTIER_VM_BURNIN_ZERO_LOSS_NOT_PROVEN', certification.reasonCodes, {
      comparison: certification.comparison ?? null
    });
  }

  const validation = validateCanonicalZeroLossCertificate(certification.certificate, {
    expectedCandidateArchitectureId: candidateTrial.architectureId,
    minimumTaskCount: minTasks
  });
  if (!validation.ok) {
    return fail('FRONTIER_VM_BURNIN_ZERO_LOSS_NOT_PROVEN', validation.reasonCodes);
  }

  return envelope({
    ok: true,
    status: 'FRONTIER_VM_BURNIN_ZERO_LOSS_EVIDENCE_READY',
    certificate: certification.certificate,
    certificationDigest: validation.certificationDigest,
    baselineArchitectureId: baselineTrial.architectureId,
    candidateArchitectureId: candidateTrial.architectureId,
    taskCount: validation.taskCount,
    economicsImproved: certification.certificate.economicsImproved,
    promotionAuthority: 'NONE',
    truthBoundary: 'THIS PROVES NO REGRESSION ONLY ON THE EXACT CANONICAL SEALED TASK PAIR. FUTURE DISTRIBUTIONS, NEW CROWN REVISIONS, AND INVALIDATED APPLICABILITY DOMAINS STILL PAGE FAULT BACK TO FRONTIER.'
  });
}

export function assessAblationContribution({
  fullCandidateTrial,
  ablationTrial,
  passName
} = {}) {
  const full = validateCompiledSealedArchitectureTrial(fullCandidateTrial);
  const ablation = validateCompiledSealedArchitectureTrial(ablationTrial);
  const pass = text(passName, 160).toUpperCase();
  const reasons = [];
  if (!full.ok) reasons.push('canonical-full-candidate-trial-required');
  if (!ablation.ok) reasons.push('canonical-ablation-trial-required');
  if (!pass) reasons.push('pass-name-required');
  if (reasons.length) return fail('FRONTIER_VM_ABLATION_REFUSED', reasons);

  for (const key of ['suiteVersion', 'corpusDigest', 'manifestDigest', 'taskClass']) {
    if (fullCandidateTrial[key] !== ablationTrial[key]) reasons.push(`paired-${key}-mismatch`);
  }
  if (reasons.length) return fail('FRONTIER_VM_ABLATION_REFUSED', reasons);

  const fullByTask = new Map((fullCandidateTrial.pairedTaskOutcomes || []).map(row => [row.taskId, row.outcome]));
  const rank = { INCORRECT: 0, ABSTAINED: 1, CORRECT: 2 };
  const regressions = [];
  for (const row of ablationTrial.pairedTaskOutcomes || []) {
    const fullOutcome = fullByTask.get(row.taskId);
    if (!(fullOutcome in rank) || !(row.outcome in rank) || rank[row.outcome] < rank[fullOutcome]) {
      regressions.push({ taskId: row.taskId, full: fullOutcome ?? 'MISSING', ablation: row.outcome });
    }
  }

  const fullCost = Number(fullCandidateTrial?.economics?.meanCostUsd);
  const ablationCost = Number(ablationTrial?.economics?.meanCostUsd);
  const costDeltaUsd = Number.isFinite(fullCost) && Number.isFinite(ablationCost)
    ? ablationCost - fullCost
    : null;
  const qualityRegression = regressions.length > 0 ||
    ablationTrial.statistics.verifiedSuccessRate < fullCandidateTrial.statistics.verifiedSuccessRate ||
    ablationTrial.statistics.falsePositiveRate > fullCandidateTrial.statistics.falsePositiveRate ||
    ablationTrial.arenaTrial.processScore < fullCandidateTrial.arenaTrial.processScore;

  let interpretation = 'INCONCLUSIVE';
  if (qualityRegression) interpretation = 'PASS_MAY_BE_QUALITY_CRITICAL_OR_INTERACT_WITH_OTHER_PASSES';
  else if (costDeltaUsd != null && costDeltaUsd > 0) interpretation = 'PASS_CONTRIBUTES_MEASURED_COST_COMPRESSION_WITHOUT_OBSERVED_QUALITY_GAIN_NEEDED';
  else if (costDeltaUsd != null && costDeltaUsd < 0) interpretation = 'PASS_CURRENTLY_COSTS_MORE_THAN_IT_SAVES_ON_THIS_SEALED_SET';
  else if (costDeltaUsd === 0) interpretation = 'PASS_HAS_NO_MEASURED_COST_EFFECT_ON_THIS_SEALED_SET';

  return envelope({
    ok: true,
    status: 'FRONTIER_VM_ABLATION_ASSESSED',
    passName: pass,
    qualityRegression,
    regressions,
    fullCandidateMeanCostUsd: Number.isFinite(fullCost) ? fullCost : null,
    ablationMeanCostUsd: Number.isFinite(ablationCost) ? ablationCost : null,
    costDeltaUsd,
    interpretation,
    promotionAuthority: 'NONE'
  });
}

export function compileFalsificationChecklist({
  maxAllowedPairedRegressions = 0,
  maxAllowedQualityDelta = 0
} = {}) {
  if (maxAllowedPairedRegressions !== 0 || maxAllowedQualityDelta !== 0) {
    return fail('FRONTIER_VM_FALSIFICATION_POLICY_REFUSED', ['quality-regression-tolerance-must-remain-zero']);
  }
  return envelope({
    ok: true,
    status: 'FRONTIER_VM_FALSIFICATION_CHECKLIST_READY',
    killConditions: [
      'ANY_PAIRED_REQUIRED_QUALITY_REGRESSION',
      'CHEAP_PREWORK_COSTS_MORE_THAN_DIRECT_CROWN_WITHOUT_REUSABLE_VALUE',
      'JEV_CERTIFICATION_COST_EXCEEDS_REALIZED_AMORTIZATION',
      'CONTEXT_COMPRESSION_HIDES_DECISIVE_INFORMATION',
      'ROUTING_OVERHEAD_DOMINATES_SAVINGS',
      'COMPILED_CIRCUITS_FAIL_CROWN_SUCCESSION_REVALIDATION_AT_UNACCEPTABLE_RATE',
      'ERROR_CORRELATION_DESTROYS_SWARM_INFORMATION_VALUE',
      'QUALITY_EVALUATOR_CANNOT_DETECT_KNOWN_INJECTED_REGRESSIONS',
      'FOUNDER_OR_OPERATOR_COMPLEXITY_ERASES_ECONOMIC_GAIN'
    ],
    surviveConditions: [
      'ZERO_PAIRED_REGRESSIONS_ON_FRESH_SEALED_TASKS',
      'STRICT_ALL_IN_COST_IMPROVEMENT',
      'DIRECT_FRONTIER_SHARE_FALLS_ON_RECURRING_WORK',
      'DEOPTIMIZATION_CORRECTLY_FIRES_ON_DRIFT',
      'NEW_CROWN_RAISES_QUALITY_FLOOR_WITHOUT_REWRITE',
      'REALIZED_FRONTIER_THOUGHT_ROI_GROWS'
    ],
    law: 'A_REVOLUTIONARY_CLAIM_MUST_BE_EASIER_TO_FALSIFY_THAN_TO_MARKET'
  });
}
