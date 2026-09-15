import crypto from 'node:crypto';

export const APOTHEOSIS_FINAL_ORCHESTRATOR_VERSION = 'uberbond.apotheosis-final-orchestrator.v1';

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TIERS = Object.freeze(['D0', 'M1', 'M2', 'M3', 'M4', 'A5']);
const TIER_RANK = Object.freeze(Object.fromEntries(TIERS.map((tier, index) => [tier, index])));
const DEFAULT_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ZERO_AUTHORITY = Object.freeze({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' });

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function finite(value, min = -Infinity, max = Infinity) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function timestampMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}
function nowMs(value) {
  const parsed = timestampMs(value ?? Date.now());
  return parsed ?? Date.now();
}
function fail(status, reasonCodes, extra = {}) {
  return {
    ok: false,
    version: APOTHEOSIS_FINAL_ORCHESTRATOR_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...ZERO_AUTHORITY,
    ...extra
  };
}
function pass(status, extra = {}) {
  return { ok: true, version: APOTHEOSIS_FINAL_ORCHESTRATOR_VERSION, status, ...ZERO_AUTHORITY, ...extra };
}

export function verifyFreshIndependentApotheosisEvidence(receipt, {
  sourceCommit = null,
  now = Date.now(),
  maxAgeMs = DEFAULT_EVIDENCE_AGE_MS,
  purpose = 'evidence'
} = {}) {
  const reasons = [];
  const current = nowMs(now);
  const maxAge = finite(maxAgeMs, 1, 365 * 24 * 60 * 60 * 1000);
  const observed = timestampMs(receipt?.observedAt);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) reasons.push(`${purpose}-object-required`);
  if (receipt?.ok !== true || receipt?.observed !== true) reasons.push(`${purpose}-observed-success-required`);
  if (receipt?.independentVerifier !== true) reasons.push(`${purpose}-independent-verifier-required`);
  if (!text(receipt?.evidenceRef, 2000)) reasons.push(`${purpose}-evidence-ref-required`);
  if (!text(receipt?.verifierRef, 1000)) reasons.push(`${purpose}-verifier-ref-required`);
  if (receipt?.builderRef && receipt?.builderRef === receipt?.verifierRef) reasons.push(`${purpose}-builder-verifier-separation-required`);
  if (observed == null) reasons.push(`${purpose}-observed-at-required`);
  if (maxAge == null) reasons.push(`${purpose}-valid-max-age-required`);
  if (observed != null && observed > current) reasons.push(`${purpose}-future-evidence-refused`);
  if (observed != null && maxAge != null && current - observed > maxAge) reasons.push(`${purpose}-stale-evidence-refused`);
  if (sourceCommit != null) {
    const expected = String(sourceCommit).toLowerCase();
    if (!SHA40.test(expected)) reasons.push('exact-source-commit-required');
    if (String(receipt?.sourceCommit || '').toLowerCase() !== expected) reasons.push(`${purpose}-source-commit-mismatch`);
  }
  if (receipt?.businessEffectAuthority != null && receipt.businessEffectAuthority !== 'NONE') reasons.push(`${purpose}-business-authority-expansion-prohibited`);
  if (receipt?.externalEffectAuthority != null && receipt.externalEffectAuthority !== 'NONE') reasons.push(`${purpose}-external-authority-expansion-prohibited`);
  if (reasons.length) return fail('APOTHEOSIS_EVIDENCE_REFUSED', reasons);
  return pass('APOTHEOSIS_EVIDENCE_VERIFIED', {
    evidenceRef: receipt.evidenceRef,
    verifierRef: receipt.verifierRef,
    observedAt: new Date(observed).toISOString(),
    sourceCommit: sourceCommit ? String(sourceCommit).toLowerCase() : (receipt.sourceCommit ?? null),
    ageMs: Math.max(0, current - observed)
  });
}

export function sealApotheosisPopulation({ sourceCommit, protocolVersion, taskIds = [] } = {}) {
  const source = String(sourceCommit || '').toLowerCase();
  const version = text(protocolVersion, 200);
  const ids = Array.isArray(taskIds) ? taskIds.map(id => text(id, 300)).filter(Boolean) : [];
  const uniqueIds = [...new Set(ids)].sort();
  const reasons = [];
  if (!SHA40.test(source)) reasons.push('exact-source-commit-required');
  if (!version) reasons.push('protocol-version-required');
  if (!Array.isArray(taskIds) || taskIds.length < 3 || taskIds.length > 10000) reasons.push('bounded-task-population-required');
  if (ids.length !== taskIds.length) reasons.push('valid-task-id-required');
  if (uniqueIds.length !== ids.length) reasons.push('duplicate-task-id-refused');
  if (reasons.length) return fail('APOTHEOSIS_POPULATION_SEAL_REFUSED', reasons);
  const core = { sourceCommit: source, protocolVersion: version, taskIds: uniqueIds };
  return pass('APOTHEOSIS_POPULATION_SEALED', {
    populationSeal: { ...core, populationDigest: digest(core) }
  });
}

export function verifyApotheosisPopulationSeal(seal, { sourceCommit = null, protocolVersion = null } = {}) {
  const reasons = [];
  if (!seal || typeof seal !== 'object' || Array.isArray(seal)) reasons.push('population-seal-object-required');
  const taskIds = Array.isArray(seal?.taskIds) ? seal.taskIds.map(id => text(id, 300)).filter(Boolean) : [];
  const uniqueIds = [...new Set(taskIds)].sort();
  if (!SHA40.test(String(seal?.sourceCommit || ''))) reasons.push('population-seal-source-required');
  if (!text(seal?.protocolVersion, 200)) reasons.push('population-seal-version-required');
  if (taskIds.length < 3 || taskIds.length !== uniqueIds.length) reasons.push('population-seal-distinct-task-population-required');
  const core = { sourceCommit: seal?.sourceCommit, protocolVersion: seal?.protocolVersion, taskIds: uniqueIds };
  if (!SHA256.test(String(seal?.populationDigest || '')) || seal.populationDigest !== digest(core)) reasons.push('population-seal-digest-mismatch');
  if (sourceCommit && seal?.sourceCommit !== String(sourceCommit).toLowerCase()) reasons.push('population-seal-source-mismatch');
  if (protocolVersion && seal?.protocolVersion !== String(protocolVersion)) reasons.push('population-seal-version-mismatch');
  if (reasons.length) return fail('APOTHEOSIS_POPULATION_SEAL_REFUSED', reasons);
  return pass('APOTHEOSIS_POPULATION_SEAL_VERIFIED', { populationSeal: { ...core, populationDigest: seal.populationDigest } });
}

function exactPopulation(outcomes) {
  if (!Array.isArray(outcomes)) return null;
  const ids = outcomes.map(item => text(item?.taskId, 300));
  if (ids.some(id => !id)) return null;
  const uniqueIds = [...new Set(ids)].sort();
  return uniqueIds.length === ids.length ? uniqueIds : null;
}

function normalizeFreshOutcome(raw, { routeId = null, taskClass = null, policyVersion = null, sourceCommit, now, maxAgeMs, purpose }) {
  const evidence = verifyFreshIndependentApotheosisEvidence(raw, { sourceCommit, now, maxAgeMs, purpose });
  if (!evidence.ok) return evidence;
  const reasons = [];
  const taskId = text(raw?.taskId, 300);
  const quality = finite(raw?.quality, 0, 1);
  const costUsd = finite(raw?.costUsd, 0, Number.MAX_SAFE_INTEGER);
  const latencyMs = finite(raw?.latencyMs, 0, Number.MAX_SAFE_INTEGER);
  const attemptCount = finite(raw?.attemptCount, 1, 1000);
  if (!taskId) reasons.push(`${purpose}-task-id-required`);
  if (quality == null) reasons.push(`${purpose}-quality-required`);
  if (costUsd == null) reasons.push(`${purpose}-cost-required`);
  if (latencyMs == null) reasons.push(`${purpose}-latency-required`);
  if (attemptCount == null) reasons.push(`${purpose}-attempt-count-required`);
  if (routeId && raw?.routeId !== routeId) reasons.push(`${purpose}-route-id-mismatch`);
  if (taskClass && raw?.taskClass !== taskClass) reasons.push(`${purpose}-task-class-mismatch`);
  if (policyVersion && raw?.policyVersion !== policyVersion) reasons.push(`${purpose}-policy-version-mismatch`);
  if (reasons.length) return fail('APOTHEOSIS_OUTCOME_REFUSED', reasons);
  return pass('APOTHEOSIS_OUTCOME_VERIFIED', {
    outcome: {
      ...raw,
      taskId,
      quality,
      costUsd,
      latencyMs,
      attemptCount,
      sourceCommit: String(sourceCommit).toLowerCase()
    }
  });
}

export async function selectApotheosisContextArmAssured({
  sourceCommit,
  arms = [],
  now = Date.now(),
  maxEvidenceAgeMs = DEFAULT_EVIDENCE_AGE_MS,
  minimumQuality = 0.8,
  maxQualityRegression = 0.02,
  dependencies = {}
} = {}) {
  if (!SHA40.test(String(sourceCommit || '').toLowerCase())) return fail('APOTHEOSIS_CONTEXT_ASSURANCE_REFUSED', ['exact-source-commit-required']);
  if (!Array.isArray(arms) || arms.length < 2 || arms.length > 16) return fail('APOTHEOSIS_CONTEXT_ASSURANCE_REFUSED', ['bounded-multiple-context-arms-required']);
  const normalized = [];
  const reasons = [];
  for (const arm of arms) {
    const evidence = verifyFreshIndependentApotheosisEvidence(arm, { sourceCommit, now, maxAgeMs: maxEvidenceAgeMs, purpose: `context-arm-${arm?.id || 'unknown'}` });
    if (!evidence.ok) { reasons.push(...evidence.reasonCodes); continue; }
    if (!SHA256.test(String(arm?.contextDigest || ''))) { reasons.push(`context-digest-required:${arm?.id || 'unknown'}`); continue; }
    normalized.push(arm);
  }
  if (reasons.length || normalized.length !== arms.length) return fail('APOTHEOSIS_CONTEXT_ASSURANCE_REFUSED', reasons);
  const selector = dependencies.selectApotheosisContextPolicy || (await import('./apotheosis-orchestration-runtime.mjs')).selectApotheosisContextPolicy;
  const selected = selector({ arms: normalized, minimumQuality, maxQualityRegression });
  if (!selected?.ok) return fail('APOTHEOSIS_CONTEXT_ASSURANCE_REFUSED', selected?.reasonCodes || ['context-selector-refused']);
  const core = { sourceCommit: String(sourceCommit).toLowerCase(), selected: selected.selected, alternatives: selected.alternatives };
  return pass('APOTHEOSIS_CONTEXT_ARM_ASSURED', { ...selected, selectionDigest: digest(core) });
}

export async function compileApotheosisFinalDispatch({
  sourceCommit,
  boundProjection,
  task,
  candidateEvidence = [],
  workers = [],
  packetContract,
  contextArms = [],
  now = Date.now(),
  maxEvidenceAgeMs = DEFAULT_EVIDENCE_AGE_MS,
  dependencies = {}
} = {}) {
  const source = String(sourceCommit || '').toLowerCase();
  const reasons = [];
  if (!SHA40.test(source)) reasons.push('exact-source-commit-required');
  const taskId = text(task?.id, 300);
  const taskClass = text(task?.taskClass, 160);
  const objective = text(task?.objective ?? packetContract?.objective, 4000);
  const availableBudgetUsd = finite(task?.availableBudgetUsd, 0, Number.MAX_SAFE_INTEGER);
  if (!taskId || !taskClass || !objective) reasons.push('complete-task-identity-required');
  if (availableBudgetUsd == null) reasons.push('task-global-budget-required');
  if (!Array.isArray(candidateEvidence) || !candidateEvidence.length || candidateEvidence.length > 128) reasons.push('bounded-candidate-evidence-required');
  if (reasons.length) return fail('APOTHEOSIS_FINAL_DISPATCH_REFUSED', reasons);

  const verifyBinding = dependencies.verifyTaskBoundContextProjection || (await import('./context-task-binding.mjs')).verifyTaskBoundContextProjection;
  const binding = verifyBinding(boundProjection, { taskId, taskClass, objective, audience: 'isolated-worker', sourceCommit: source });
  if (!binding?.ok) return fail('APOTHEOSIS_FINAL_DISPATCH_REFUSED', ['cryptographically-recomputed-task-binding-required', ...(binding?.reasonCodes || [])]);

  const context = await selectApotheosisContextArmAssured({
    sourceCommit: source,
    arms: contextArms,
    now,
    maxEvidenceAgeMs,
    dependencies
  });
  if (!context.ok) return fail('APOTHEOSIS_FINAL_DISPATCH_REFUSED', context.reasonCodes || ['context-assurance-required']);

  const normalizedCandidates = [];
  for (const raw of candidateEvidence) {
    const evidence = verifyFreshIndependentApotheosisEvidence(raw, { sourceCommit: source, now, maxAgeMs: maxEvidenceAgeMs, purpose: `candidate-${raw?.id || 'unknown'}` });
    if (!evidence.ok) return fail('APOTHEOSIS_FINAL_DISPATCH_REFUSED', evidence.reasonCodes);
    const id = text(raw?.id, 160);
    const tier = text(raw?.tier, 8)?.toUpperCase();
    const quality = finite(raw?.quality, 0, 1);
    const reliability = finite(raw?.reliability, 0, 1);
    const totalCostUsd = finite(raw?.totalCostUsd, 0, Number.MAX_SAFE_INTEGER);
    const latencyMs = finite(raw?.latencyMs, 0, Number.MAX_SAFE_INTEGER);
    if (!id || !(tier in TIER_RANK) || quality == null || reliability == null || totalCostUsd == null || latencyMs == null) return fail('APOTHEOSIS_FINAL_DISPATCH_REFUSED', [`complete-candidate-contract-required:${id || 'unknown'}`]);
    if (raw?.taskClass !== taskClass) return fail('APOTHEOSIS_FINAL_DISPATCH_REFUSED', [`candidate-task-class-mismatch:${id}`]);
    normalizedCandidates.push({
      ...raw,
      id,
      tier,
      quality,
      reliability,
      totalCostUsd,
      latencyMs,
      availableBudgetUsd,
      evidenceBacked: true,
      callable: raw.callable === true,
      permitted: raw.permitted === true
    });
  }

  const compileNative = dependencies.compileApotheosisNativeDispatch || (await import('./apotheosis-agent-mesh-runtime.mjs')).compileApotheosisNativeDispatch;
  const inputRefs = [...new Set([...(Array.isArray(packetContract?.inputRefs) ? packetContract.inputRefs : []), `context:${context.selected.contextDigest}`, context.selected.evidenceRef].filter(Boolean))];
  const native = compileNative({
    sourceCommit: source,
    taskBindingVerification: binding,
    task: { ...task, id: taskId, taskClass, availableBudgetUsd },
    candidateEvidence: normalizedCandidates,
    workers,
    packetContract: { ...packetContract, inputRefs }
  });
  if (!native?.ok) return fail('APOTHEOSIS_FINAL_DISPATCH_REFUSED', native?.reasonCodes || ['native-dispatch-refused']);
  const core = {
    sourceCommit: source,
    bindingId: binding.bindingId,
    taskId,
    taskClass,
    contextSelectionDigest: context.selectionDigest,
    allocation: native.allocation,
    packetDigest: native.packet?.packetDigest ?? null,
    status: native.status
  };
  return pass(native.status === 'APOTHEOSIS_FRONTIER_ESCALATION_REQUIRED' ? 'APOTHEOSIS_FINAL_FRONTIER_ESCALATION_REQUIRED' : 'APOTHEOSIS_FINAL_DISPATCH_READY', {
    taskBindingVerification: binding,
    contextSelection: context,
    nativeDispatch: native,
    finalDispatchDigest: digest(core),
    dispatchPerformed: false,
    providerCalls: 0
  });
}

export async function evaluateApotheosisDownrouteAssured({
  sourceCommit,
  policyVersion,
  populationSeal,
  baseline,
  challenger,
  now = Date.now(),
  maxEvidenceAgeMs = DEFAULT_EVIDENCE_AGE_MS,
  qualityTolerance = 0.02,
  minimumCostSavingFraction = 0.1,
  dependencies = {}
} = {}) {
  const source = String(sourceCommit || '').toLowerCase();
  const policy = text(policyVersion, 200);
  const seal = verifyApotheosisPopulationSeal(populationSeal, { sourceCommit: source, protocolVersion: policy });
  if (!seal.ok) return fail('APOTHEOSIS_DOWNROUTE_ASSURANCE_REFUSED', seal.reasonCodes);
  const reasons = [];
  if (!baseline?.preregistered || !challenger?.preregistered) reasons.push('preregistered-route-comparison-required');
  if (!text(baseline?.routeId, 200) || !text(challenger?.routeId, 200) || baseline.routeId === challenger.routeId) reasons.push('distinct-route-identities-required');
  if (!text(baseline?.taskClass, 160) || baseline.taskClass !== challenger?.taskClass) reasons.push('same-task-class-required');
  if (baseline?.sourceCommit !== source || challenger?.sourceCommit !== source) reasons.push('route-source-version-binding-required');
  if (baseline?.policyVersion !== policy || challenger?.policyVersion !== policy) reasons.push('route-policy-version-binding-required');
  const bTier = text(baseline?.tier, 8)?.toUpperCase();
  const cTier = text(challenger?.tier, 8)?.toUpperCase();
  if (!(bTier in TIER_RANK) || !(cTier in TIER_RANK) || TIER_RANK[cTier] >= TIER_RANK[bTier]) reasons.push('challenger-must-be-lower-cognition-tier');
  if (reasons.length) return fail('APOTHEOSIS_DOWNROUTE_ASSURANCE_REFUSED', reasons);

  const normalizeSeries = (route, label) => {
    const out = [];
    for (const raw of Array.isArray(route.outcomes) ? route.outcomes : []) {
      const checked = normalizeFreshOutcome(raw, { routeId: route.routeId, taskClass: route.taskClass, policyVersion: policy, sourceCommit: source, now, maxAgeMs: maxEvidenceAgeMs, purpose: `${label}-${raw?.taskId || 'unknown'}` });
      if (!checked.ok) return checked;
      out.push(checked.outcome);
    }
    const population = exactPopulation(out);
    if (!population || population.join('\0') !== seal.populationSeal.taskIds.join('\0')) return fail('APOTHEOSIS_DOWNROUTE_ASSURANCE_REFUSED', [`${label}-sealed-population-mismatch`]);
    return pass('APOTHEOSIS_ROUTE_SERIES_VERIFIED', { outcomes: out });
  };
  const b = normalizeSeries(baseline, 'baseline');
  if (!b.ok) return b;
  const c = normalizeSeries(challenger, 'challenger');
  if (!c.ok) return c;

  const evaluator = dependencies.evaluateDownroutingPromotion || (await import('./apotheosis-orchestration-runtime.mjs')).evaluateDownroutingPromotion;
  const rawDecision = evaluator({
    baseline: { ...baseline, outcomes: b.outcomes },
    challenger: { ...challenger, outcomes: c.outcomes },
    qualityTolerance,
    minimumCostSavingFraction
  });
  if (!rawDecision?.ok) return fail('APOTHEOSIS_DOWNROUTE_ASSURANCE_REFUSED', rawDecision?.reasonCodes || ['native-downroute-refused']);
  const core = {
    sourceCommit: source,
    policyVersion: policy,
    populationDigest: seal.populationSeal.populationDigest,
    baselineRouteId: baseline.routeId,
    challengerRouteId: challenger.routeId,
    promotionEligible: rawDecision.promotionEligible,
    qualityDelta: rawDecision.qualityDelta,
    costSavingFraction: rawDecision.costSavingFraction
  };
  return pass(rawDecision.promotionEligible ? 'APOTHEOSIS_DOWNROUTE_ASSURED_PROMOTION_ELIGIBLE' : 'APOTHEOSIS_DOWNROUTE_ASSURED_KEEP_BASELINE', {
    nativeDecision: rawDecision,
    populationSeal: seal.populationSeal,
    downrouteDecisionDigest: digest(core),
    promotionEligible: rawDecision.promotionEligible === true
  });
}

export async function compareApotheosisArmsAssured({
  sourceCommit,
  protocol,
  arms = [],
  now = Date.now(),
  maxEvidenceAgeMs = DEFAULT_EVIDENCE_AGE_MS,
  dependencies = {}
} = {}) {
  const source = String(sourceCommit || '').toLowerCase();
  const protocolId = text(protocol?.protocolId, 200);
  const protocolVersion = text(protocol?.protocolVersion, 200);
  if (!protocol?.preregistered || !protocolId || !protocolVersion) return fail('APOTHEOSIS_COMPARISON_ASSURANCE_REFUSED', ['preregistered-versioned-protocol-required']);
  if (protocol?.sourceCommit !== source) return fail('APOTHEOSIS_COMPARISON_ASSURANCE_REFUSED', ['protocol-source-binding-required']);
  const seal = verifyApotheosisPopulationSeal(protocol?.populationSeal, { sourceCommit: source, protocolVersion });
  if (!seal.ok) return fail('APOTHEOSIS_COMPARISON_ASSURANCE_REFUSED', seal.reasonCodes);
  if (!Array.isArray(arms) || arms.length < 2 || arms.length > 8) return fail('APOTHEOSIS_COMPARISON_ASSURANCE_REFUSED', ['bounded-comparison-arms-required']);
  const normalizedArms = [];
  for (const arm of arms) {
    if (!text(arm?.id, 120) || arm?.completeAttemptAccounting !== true) return fail('APOTHEOSIS_COMPARISON_ASSURANCE_REFUSED', [`complete-arm-contract-required:${arm?.id || 'unknown'}`]);
    const normalizedOutcomes = [];
    for (const raw of Array.isArray(arm.outcomes) ? arm.outcomes : []) {
      const checked = normalizeFreshOutcome(raw, { policyVersion: protocolVersion, sourceCommit: source, now, maxAgeMs: maxEvidenceAgeMs, purpose: `arm-${arm.id}-${raw?.taskId || 'unknown'}` });
      if (!checked.ok) return fail('APOTHEOSIS_COMPARISON_ASSURANCE_REFUSED', checked.reasonCodes);
      normalizedOutcomes.push(checked.outcome);
    }
    const population = exactPopulation(normalizedOutcomes);
    if (!population || population.join('\0') !== seal.populationSeal.taskIds.join('\0')) return fail('APOTHEOSIS_COMPARISON_ASSURANCE_REFUSED', [`arm-sealed-population-mismatch:${arm.id}`]);
    normalizedArms.push({ ...arm, outcomes: normalizedOutcomes });
  }
  const comparator = dependencies.compareApotheosisOrchestrationArms || (await import('./apotheosis-orchestration-runtime.mjs')).compareApotheosisOrchestrationArms;
  const rawComparison = comparator({
    protocol: { preregistered: true, protocolId, populationDigest: seal.populationSeal.populationDigest },
    arms: normalizedArms
  });
  if (!rawComparison?.ok) return fail('APOTHEOSIS_COMPARISON_ASSURANCE_REFUSED', rawComparison?.reasonCodes || ['native-comparison-refused']);
  const core = {
    sourceCommit: source,
    protocolId,
    protocolVersion,
    populationDigest: seal.populationSeal.populationDigest,
    scored: rawComparison.scored,
    champion: rawComparison.champion
  };
  return pass('APOTHEOSIS_COMPARISON_ASSURED', {
    sourceCommit: source,
    protocolId,
    protocolVersion,
    populationSeal: seal.populationSeal,
    rawComparison,
    comparisonDigest: digest(core),
    champion: rawComparison.champion,
    asiInferenceAuthority: 'NONE'
  });
}

function recomputeComparisonDigest(comparison) {
  const core = {
    sourceCommit: comparison?.sourceCommit,
    protocolId: comparison?.protocolId,
    protocolVersion: comparison?.protocolVersion,
    populationDigest: comparison?.populationSeal?.populationDigest,
    scored: comparison?.rawComparison?.scored,
    champion: comparison?.rawComparison?.champion
  };
  return digest(core);
}

export async function admitApotheosisPolicyAssured({
  sourceCommit,
  baselinePolicyId,
  candidatePolicyId,
  comparison,
  causalAdmission,
  rollbackReceipt,
  independentApproval,
  now = Date.now(),
  maxEvidenceAgeMs = DEFAULT_EVIDENCE_AGE_MS,
  dependencies = {}
} = {}) {
  const source = String(sourceCommit || '').toLowerCase();
  const baseline = text(baselinePolicyId, 200);
  const candidate = text(candidatePolicyId, 200);
  const reasons = [];
  if (!SHA40.test(source)) reasons.push('exact-source-commit-required');
  if (!baseline || !candidate || baseline === candidate) reasons.push('distinct-policy-identities-required');
  if (!comparison?.ok || comparison.status !== 'APOTHEOSIS_COMPARISON_ASSURED') reasons.push('assured-comparison-required');
  if (!SHA256.test(String(comparison?.comparisonDigest || '')) || comparison?.comparisonDigest !== recomputeComparisonDigest(comparison)) reasons.push('comparison-digest-mismatch');
  if (comparison?.sourceCommit !== source) reasons.push('comparison-source-mismatch');
  if (comparison?.champion?.id !== candidate) reasons.push('candidate-must-win-assured-comparison');
  if (reasons.length) return fail('APOTHEOSIS_POLICY_ASSURANCE_REFUSED', reasons);

  const checks = [
    ['causal-admission', causalAdmission],
    ['rollback', rollbackReceipt],
    ['approval', independentApproval]
  ];
  for (const [purpose, receipt] of checks) {
    const verified = verifyFreshIndependentApotheosisEvidence(receipt, { sourceCommit: source, now, maxAgeMs: maxEvidenceAgeMs, purpose });
    if (!verified.ok) return fail('APOTHEOSIS_POLICY_ASSURANCE_REFUSED', verified.reasonCodes);
    if (receipt?.comparisonDigest !== comparison.comparisonDigest) return fail('APOTHEOSIS_POLICY_ASSURANCE_REFUSED', [`${purpose}-comparison-binding-required`]);
  }
  if (causalAdmission?.candidateId !== candidate || causalAdmission?.baselineId !== baseline) return fail('APOTHEOSIS_POLICY_ASSURANCE_REFUSED', ['causal-admission-policy-identity-mismatch']);
  if (causalAdmission?.causalEffectObserved !== true || causalAdmission?.holdoutPassed !== true || causalAdmission?.leakageCheckPassed !== true) return fail('APOTHEOSIS_POLICY_ASSURANCE_REFUSED', ['causal-holdout-leakage-evidence-required']);
  if (rollbackReceipt?.candidateId !== candidate || rollbackReceipt?.rehearsed !== true) return fail('APOTHEOSIS_POLICY_ASSURANCE_REFUSED', ['exact-candidate-rollback-rehearsal-required']);
  if (independentApproval?.candidateId !== candidate || !text(independentApproval?.builderRef, 1000) || independentApproval.builderRef === independentApproval.verifierRef) return fail('APOTHEOSIS_POLICY_ASSURANCE_REFUSED', ['independent-exact-candidate-approval-required']);

  const admitter = dependencies.admitApotheosisOrchestrationPolicy || (await import('./apotheosis-orchestration-runtime.mjs')).admitApotheosisOrchestrationPolicy;
  const raw = admitter({
    baselinePolicyId: baseline,
    candidatePolicyId: candidate,
    comparison: comparison.rawComparison,
    causalAdmission,
    rollbackReceipt,
    independentApproval
  });
  if (!raw?.ok) return fail('APOTHEOSIS_POLICY_ASSURANCE_REFUSED', raw?.reasonCodes || ['native-policy-admission-refused']);
  const core = {
    sourceCommit: source,
    baselinePolicyId: baseline,
    candidatePolicyId: candidate,
    comparisonDigest: comparison.comparisonDigest,
    causalEvidenceRef: causalAdmission.evidenceRef,
    rollbackEvidenceRef: rollbackReceipt.evidenceRef,
    approvalEvidenceRef: independentApproval.evidenceRef
  };
  return pass('APOTHEOSIS_POLICY_ASSURED_PROMOTION_ELIGIBLE_PROPOSAL_ONLY', {
    nativeAdmission: raw,
    assuredProposal: { ...core, proposalDigest: digest(core), productionMutationPerformed: false, authorityExpansion: false }
  });
}

export async function classifyApotheosisContinuityAssured({
  nativeContinuation,
  currentSourceCommit,
  workerReceipt = null,
  unattendedReceipt = null,
  now = Date.now(),
  maxEvidenceAgeMs = DEFAULT_EVIDENCE_AGE_MS,
  minUnattendedMs = 1,
  dependencies = {}
} = {}) {
  const source = String(currentSourceCommit || '').toLowerCase();
  if (!SHA40.test(source)) return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', ['exact-source-commit-required']);
  if (!nativeContinuation?.ok || nativeContinuation.status !== 'APOTHEOSIS_NATIVE_CONTINUATION_READY') return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', ['native-continuation-ready-required']);
  if (nativeContinuation?.handoff?.sourceCommit !== source) return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', ['native-continuation-source-mismatch']);
  if (workerReceipt) {
    const verified = verifyFreshIndependentApotheosisEvidence(workerReceipt, { sourceCommit: source, now, maxAgeMs: maxEvidenceAgeMs, purpose: 'worker-resume' });
    if (!verified.ok) return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', verified.reasonCodes);
    if (workerReceipt.handoffDigest !== nativeContinuation.handoff.handoffDigest || workerReceipt.frontierModelUsed !== false || workerReceipt.consumedHandoff !== true || workerReceipt.resumedWork !== true || workerReceipt.outcomeAccepted !== true) return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', ['exact-handoff-nonfrontier-resume-outcome-evidence-required']);
  }
  if (unattendedReceipt) {
    if (!workerReceipt) return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', ['worker-resume-evidence-required-before-unattended']);
    const verified = verifyFreshIndependentApotheosisEvidence(unattendedReceipt, { sourceCommit: source, now, maxAgeMs: maxEvidenceAgeMs, purpose: 'unattended' });
    if (!verified.ok) return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', verified.reasonCodes);
    const started = timestampMs(unattendedReceipt.startedAt);
    const ended = timestampMs(unattendedReceipt.endedAt);
    const minimum = finite(minUnattendedMs, 1, 30 * 24 * 60 * 60 * 1000);
    if (unattendedReceipt.handoffDigest !== nativeContinuation.handoff.handoffDigest || unattendedReceipt.preregistered !== true || unattendedReceipt.recoveryObserved !== true || unattendedReceipt.outcomeObserved !== true || started == null || ended == null || minimum == null || ended <= started || ended - started < minimum || ended > nowMs(now)) return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', ['preregistered-real-unattended-interval-required']);
  }
  const reconciler = dependencies.reconcileApotheosisWorkerResume || (await import('./apotheosis-agent-mesh-runtime.mjs')).reconcileApotheosisWorkerResume;
  const raw = reconciler({ nativeContinuation, currentSourceCommit: source, workerReceipt, unattendedReceipt, now });
  if (!raw?.ok) return fail('APOTHEOSIS_CONTINUITY_ASSURANCE_REFUSED', raw?.reasonCodes || ['native-continuity-reconciliation-refused']);
  return pass('APOTHEOSIS_CONTINUITY_ASSURED', {
    evidenceLevel: raw.evidenceLevel,
    handoffDigest: raw.handoffDigest,
    runtimeVersion: raw.runtimeVersion
  });
}

export async function verifyApotheosisGate4RelayReceipt({
  receipt,
  expectedSourceCommit,
  expectedTaskId,
  requiredCommand = 'npm run test:deterministic',
  dependencies = {}
} = {}) {
  const source = String(expectedSourceCommit || '').toLowerCase();
  const taskId = text(expectedTaskId, 300);
  const reasons = [];
  if (!SHA40.test(source)) reasons.push('exact-source-commit-required');
  if (!taskId) reasons.push('expected-task-id-required');
  const validate = dependencies.validateRelayReceipt || (await import('./github-relay.mjs')).validateRelayReceipt;
  const receiptReasons = validate(receipt) || [];
  reasons.push(...receiptReasons);
  if (receipt?.taskId !== taskId) reasons.push('relay-receipt-task-id-mismatch');
  if (String(receipt?.sourceCommit || '').toLowerCase() !== source) reasons.push('relay-receipt-exact-source-mismatch');
  if (receipt?.status !== 'COMPLETED') reasons.push('relay-receipt-completed-status-required');
  const commands = Array.isArray(receipt?.commands) ? receipt.commands.map(String) : [];
  if (!commands.includes(requiredCommand)) reasons.push('required-verification-command-not-run');
  const tests = Array.isArray(receipt?.tests) ? receipt.tests : [];
  const matchingTest = tests.find(entry => String(entry?.command || '') === requiredCommand);
  if (!matchingTest || matchingTest.result !== 'PASS') reasons.push('required-verification-test-pass-required');
  if (receipt?.result?.decision && receipt.result.decision !== 'PROCEED') reasons.push('relay-result-proceed-required');
  if (reasons.length) return fail('APOTHEOSIS_GATE4_RECEIPT_REFUSED', reasons);
  const core = { taskId, sourceCommit: source, workerId: receipt.workerId, submittedAt: receipt.submittedAt, command: requiredCommand, testResult: matchingTest.result };
  return pass('APOTHEOSIS_GATE4_EXACT_SOURCE_RUNTIME_VERIFIED', {
    gate4ReceiptDigest: digest(core),
    workerId: receipt.workerId,
    sourceCommit: source,
    taskId,
    runtimeEvidenceAuthority: 'EXACT_SOURCE_REPOSITORY_VERIFICATION_ONLY',
    asiInferenceAuthority: 'NONE'
  });
}

export function compileApotheosisImplementationStatus({
  sourceCommit,
  primitiveImplementation = true,
  nativeComposition = true,
  workerContinuationDriver = true,
  gate4Verification = null
} = {}) {
  const source = String(sourceCommit || '').toLowerCase();
  if (!SHA40.test(source)) return fail('APOTHEOSIS_IMPLEMENTATION_STATUS_REFUSED', ['exact-source-commit-required']);
  const gates = {
    primitives: primitiveImplementation === true,
    nativeComposition: nativeComposition === true,
    workerContinuationDriver: workerContinuationDriver === true,
    exactSourceRuntimeEvidence: gate4Verification?.ok === true && gate4Verification.status === 'APOTHEOSIS_GATE4_EXACT_SOURCE_RUNTIME_VERIFIED' && gate4Verification.sourceCommit === source
  };
  const completed = Object.values(gates).filter(Boolean).length;
  return pass('APOTHEOSIS_IMPLEMENTATION_STATUS_READY', {
    sourceCommit: source,
    gates,
    sourceImplementationPercent: gates.primitives && gates.nativeComposition && gates.workerContinuationDriver ? 100 : Number(((completed / 4) * 100).toFixed(2)),
    endToEndEvidencePercent: Number(((completed / 4) * 100).toFixed(2)),
    remainingExternalEvidenceGate: gates.exactSourceRuntimeEvidence ? null : 'fresh exact-source runtime receipt'
  });
}
