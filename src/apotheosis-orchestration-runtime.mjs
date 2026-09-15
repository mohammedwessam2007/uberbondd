import crypto from 'node:crypto';

export const APOTHEOSIS_ORCHESTRATION_RUNTIME_VERSION = 'uberbond.apotheosis-orchestration-runtime.v1';

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ZERO_AUTHORITY = Object.freeze({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' });
const COGNITION_TIERS = Object.freeze(['D0', 'M1', 'M2', 'M3', 'M4', 'A5']);
const TIER_RANK = Object.freeze(Object.fromEntries(COGNITION_TIERS.map((tier, index) => [tier, index])));

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
};
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const finite = (value, min = -Infinity, max = Infinity) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const unique = (value, max = 128, itemMax = 1000) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const item = text(raw, itemMax);
    if (!item) return null;
    if (!seen.has(item)) { seen.add(item); out.push(item); }
  }
  return out;
};
const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  version: APOTHEOSIS_ORCHESTRATION_RUNTIME_VERSION,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...ZERO_AUTHORITY,
  ...extra
});
const pass = (status, extra = {}) => ({
  ok: true,
  version: APOTHEOSIS_ORCHESTRATION_RUNTIME_VERSION,
  status,
  ...ZERO_AUTHORITY,
  ...extra
});
const observedReceipt = receipt => Boolean(
  receipt && typeof receipt === 'object' && receipt.ok === true && receipt.observed === true
  && text(receipt.evidenceRef, 2000) && text(receipt.verifierRef, 1000)
  && receipt.independentVerifier === true
);

export function compileApotheosisWorkerPacket({
  packetId,
  parentMissionId,
  objective,
  currentTruth,
  sourceCommit,
  taskBinding,
  dependencies = [],
  sourcePointers = [],
  fileOwnership = [],
  inputRefs = [],
  outputContract,
  interfaceContract,
  invariants = [],
  forbiddenChanges = [],
  acceptanceCriteria = [],
  hostileTests = [],
  authorityCeiling = 'NONE',
  maxAttempts = 2,
  returnFields = [],
  escalationTriggers = [],
  rollbackRequirement,
  workerClass = 'M2'
} = {}) {
  const reasons = [];
  const id = text(packetId, 160);
  const mission = text(parentMissionId, 200);
  const goal = text(objective, 4000);
  const truth = text(currentTruth, 8000);
  const source = text(sourceCommit, 40)?.toLowerCase();
  const outContract = text(outputContract, 4000);
  const iface = text(interfaceContract, 4000);
  const rollback = text(rollbackRequirement, 4000);
  const deps = unique(dependencies, 64, 200);
  const pointers = unique(sourcePointers, 128, 1000);
  const owned = unique(fileOwnership, 128, 1000);
  const inputs = unique(inputRefs, 128, 1000);
  const inv = unique(invariants, 128, 1000);
  const forbidden = unique(forbiddenChanges, 128, 1000);
  const acceptance = unique(acceptanceCriteria, 128, 1000);
  const hostile = unique(hostileTests, 128, 1000);
  const returns = unique(returnFields, 128, 300);
  const escalation = unique(escalationTriggers, 128, 1000);
  const attempts = finite(maxAttempts, 1, 8);
  const tier = text(workerClass, 8)?.toUpperCase();

  if (!id) reasons.push('packet-id-required');
  if (!mission) reasons.push('parent-mission-id-required');
  if (!goal) reasons.push('objective-required');
  if (!truth) reasons.push('current-truth-required');
  if (!source || !SHA40.test(source)) reasons.push('source-commit-sha40-required');
  if (!taskBinding?.ok || !['CONTEXT_TASK_BINDING_READY', 'CONTEXT_TASK_BINDING_VERIFIED'].includes(taskBinding.status)) reasons.push('verified-task-binding-required');
  if (taskBinding?.sourceCommit && taskBinding.sourceCommit !== source) reasons.push('task-binding-source-mismatch');
  if (!deps) reasons.push('bounded-dependencies-required');
  if (!pointers || !pointers.length) reasons.push('source-pointers-required');
  if (!owned || !owned.length) reasons.push('file-ownership-required');
  if (!inputs) reasons.push('bounded-input-refs-required');
  if (!outContract) reasons.push('output-contract-required');
  if (!iface) reasons.push('interface-contract-required');
  if (!inv || !inv.length) reasons.push('invariants-required');
  if (!forbidden) reasons.push('bounded-forbidden-changes-required');
  if (!acceptance || !acceptance.length) reasons.push('acceptance-criteria-required');
  if (!hostile || !hostile.length) reasons.push('hostile-tests-required');
  if (String(authorityCeiling).toUpperCase() !== 'NONE') reasons.push('apotheosis-packet-authority-must-be-none');
  if (!attempts) reasons.push('bounded-max-attempts-required');
  if (!returns || !returns.length) reasons.push('return-fields-required');
  if (!escalation) reasons.push('bounded-escalation-triggers-required');
  if (!rollback) reasons.push('rollback-requirement-required');
  if (!(tier in TIER_RANK) || tier === 'A5') reasons.push('downstream-worker-tier-required');
  if (reasons.length) return fail('APOTHEOSIS_WORKER_PACKET_REFUSED', reasons);

  const packet = {
    schemaVersion: 'uberbond.apotheosis-worker-packet.v1', packetId: id, parentMissionId: mission,
    objective: goal, objectiveDigest: digest(goal), currentTruth: truth, sourceCommit: source,
    taskBindingId: taskBinding.bindingId ?? taskBinding.boundProjection?.bindingId ?? null,
    dependencies: deps, sourcePointers: pointers, fileOwnership: owned, inputRefs: inputs,
    outputContract: outContract, interfaceContract: iface, invariants: inv,
    forbiddenChanges: forbidden, acceptanceCriteria: acceptance, hostileTests: hostile,
    authorityCeiling: 'NONE', maxAttempts: attempts, returnFields: returns,
    escalationTriggers: escalation, rollbackRequirement: rollback, workerClass: tier
  };
  packet.packetDigest = digest(packet);
  return pass('APOTHEOSIS_WORKER_PACKET_READY', { packet });
}

export function evaluateWorkerPacketOutcome({ packet, outcome } = {}) {
  const reasons = [];
  if (!packet || !SHA256.test(String(packet.packetDigest || ''))) reasons.push('valid-packet-digest-required');
  else {
    const { packetDigest: _ignored, ...core } = packet;
    if (digest(core) !== packet.packetDigest) reasons.push('worker-packet-digest-mismatch');
  }
  if (!outcome || typeof outcome !== 'object') reasons.push('worker-outcome-required');
  if (outcome?.packetDigest !== packet?.packetDigest) reasons.push('worker-outcome-packet-mismatch');
  if (!observedReceipt(outcome)) reasons.push('independently-observed-worker-outcome-required');
  const changedFiles = unique(outcome?.changedFiles ?? [], 256, 1000);
  const testRefs = unique(outcome?.testRefs ?? [], 256, 2000);
  if (!changedFiles) reasons.push('bounded-changed-files-required');
  if (!testRefs || !testRefs.length) reasons.push('test-references-required');
  const allowed = new Set(packet?.fileOwnership || []);
  for (const path of changedFiles || []) if (!allowed.has(path)) reasons.push(`worker-file-outside-ownership:${path}`);
  if (outcome?.selfApproved === true) reasons.push('worker-self-approval-prohibited');
  if (reasons.length) return fail('APOTHEOSIS_WORKER_OUTCOME_REFUSED', reasons);
  return pass('APOTHEOSIS_WORKER_OUTCOME_ACCEPTED', {
    outcomeDigest: digest({ packetDigest: packet.packetDigest, evidenceRef: outcome.evidenceRef, changedFiles, testRefs, verifierRef: outcome.verifierRef })
  });
}

export function selectApotheosisContextPolicy({ arms = [], minimumQuality = 0.8, maxQualityRegression = 0.02 } = {}) {
  if (!Array.isArray(arms) || arms.length < 2 || arms.length > 16) return fail('APOTHEOSIS_CONTEXT_SELECTION_REFUSED', ['bounded-multiple-context-arms-required']);
  const minQuality = finite(minimumQuality, 0, 1);
  const tolerance = finite(maxQualityRegression, 0, 0.2);
  if (minQuality == null || tolerance == null) return fail('APOTHEOSIS_CONTEXT_SELECTION_REFUSED', ['valid-quality-policy-required']);
  const reasons = [];
  const normalized = [];
  for (const raw of arms) {
    const id = text(raw?.id, 100);
    const quality = finite(raw?.quality, 0, 1);
    const tokens = finite(raw?.tokens, 0, Number.MAX_SAFE_INTEGER);
    const latencyMs = finite(raw?.latencyMs, 0, Number.MAX_SAFE_INTEGER);
    const retrievalMissRate = finite(raw?.retrievalMissRate, 0, 1);
    const privacyScope = finite(raw?.privacyScope, 0, 1);
    if (!id || quality == null || tokens == null || latencyMs == null || retrievalMissRate == null || privacyScope == null || !observedReceipt(raw)) {
      reasons.push(`complete-observed-context-arm-required:${id || 'unknown'}`); continue;
    }
    if (!SHA256.test(String(raw.contextDigest || ''))) reasons.push(`context-digest-required:${id}`);
    normalized.push({ id, quality, tokens, latencyMs, retrievalMissRate, privacyScope, contextDigest: raw.contextDigest, evidenceRef: raw.evidenceRef });
  }
  if (reasons.length || normalized.length !== arms.length) return fail('APOTHEOSIS_CONTEXT_SELECTION_REFUSED', reasons);
  const bestQuality = Math.max(...normalized.map(a => a.quality));
  const eligible = normalized.filter(a => a.quality >= minQuality && a.quality >= bestQuality - tolerance);
  if (!eligible.length) return fail('APOTHEOSIS_CONTEXT_SELECTION_REFUSED', ['no-context-arm-meets-quality-floor']);
  eligible.sort((a, b) => (a.tokens - b.tokens) || (a.latencyMs - b.latencyMs) || (a.retrievalMissRate - b.retrievalMissRate) || (a.privacyScope - b.privacyScope) || a.id.localeCompare(b.id));
  return pass('APOTHEOSIS_CONTEXT_POLICY_SELECTED', {
    selected: eligible[0], alternatives: normalized.filter(a => a.id !== eligible[0].id),
    selectionLaw: 'QUALITY_NONINFERIOR_FIRST__THEN_MINIMIZE_TOKENS_LATENCY_MISSES_PRIVACY_SCOPE'
  });
}

export function allocateScarceReasoning({ task, candidates = [], frontierTier = 'A5', reserveFraction = 0.2 } = {}) {
  const reasons = [];
  const taskId = text(task?.id, 200);
  const taskClass = text(task?.taskClass, 120);
  const stakes = finite(task?.stakes, 0, 1);
  const uncertainty = finite(task?.uncertainty, 0, 1);
  const failureCost = finite(task?.failureCost, 0, 1);
  const frontier = text(frontierTier, 8)?.toUpperCase();
  const reserve = finite(reserveFraction, 0, 0.9);
  if (!taskId || !taskClass || stakes == null || uncertainty == null || failureCost == null) reasons.push('complete-task-value-contract-required');
  if (!(frontier in TIER_RANK)) reasons.push('recognized-frontier-tier-required');
  if (reserve == null) reasons.push('valid-reserve-fraction-required');
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 128) reasons.push('bounded-candidates-required');
  if (reasons.length) return fail('APOTHEOSIS_SCARCE_REASONING_REFUSED', reasons);

  const normalized = [];
  for (const raw of candidates) {
    const id = text(raw?.id, 160);
    const tier = text(raw?.tier, 8)?.toUpperCase();
    const quality = finite(raw?.quality, 0, 1);
    const reliability = finite(raw?.reliability, 0, 1);
    const totalCostUsd = finite(raw?.totalCostUsd, 0, Number.MAX_SAFE_INTEGER);
    const latencyMs = finite(raw?.latencyMs, 0, Number.MAX_SAFE_INTEGER);
    const availableBudgetUsd = finite(raw?.availableBudgetUsd, 0, Number.MAX_SAFE_INTEGER);
    const callable = raw?.callable === true;
    const permitted = raw?.permitted === true;
    const evidenceBacked = raw?.evidenceBacked === true;
    if (!id || !(tier in TIER_RANK) || quality == null || reliability == null || totalCostUsd == null || latencyMs == null || availableBudgetUsd == null) continue;
    const budgetAfterReserve = availableBudgetUsd * (1 - reserve);
    const withinBudget = totalCostUsd <= budgetAfterReserve;
    const expectedLoss = (1 - quality * reliability) * failureCost;
    const cognitionCost = totalCostUsd + latencyMs / 3_600_000;
    const utility = (quality * 0.45 + reliability * 0.25 + (1 - expectedLoss) * 0.3) / Math.max(0.000001, 1 + cognitionCost);
    normalized.push({ id, tier, quality, reliability, totalCostUsd, latencyMs, availableBudgetUsd, callable, permitted, evidenceBacked, withinBudget, expectedLoss, utility });
  }
  const eligible = normalized.filter(c => c.callable && c.permitted && c.evidenceBacked && c.withinBudget);
  if (!eligible.length) return fail('APOTHEOSIS_SCARCE_REASONING_REFUSED', ['no-evidence-backed-callable-permitted-candidate']);
  const lower = eligible.filter(c => TIER_RANK[c.tier] < TIER_RANK[frontier]).sort((a, b) => b.utility - a.utility || a.totalCostUsd - b.totalCostUsd);
  const front = eligible.filter(c => c.tier === frontier).sort((a, b) => b.utility - a.utility || a.totalCostUsd - b.totalCostUsd);
  const highNeed = stakes * uncertainty * failureCost >= 0.45;
  let selected = lower[0] || front[0];
  let mode = 'DOWNROUTED';
  if (highNeed && front[0] && (!lower[0] || front[0].quality - lower[0].quality >= 0.08 || front[0].reliability - lower[0].reliability >= 0.08)) {
    selected = front[0]; mode = 'FRONTIER_JUSTIFIED';
  }
  return pass('APOTHEOSIS_SCARCE_REASONING_ALLOCATED', {
    taskId, taskClass, selected, mode,
    alternatives: eligible.filter(c => c.id !== selected.id).sort((a, b) => b.utility - a.utility),
    frontierReserved: mode !== 'FRONTIER_JUSTIFIED',
    marginalValueBasis: { stakes, uncertainty, failureCost, highNeed }
  });
}

function validateOutcomeSeries(series, label) {
  if (!Array.isArray(series) || series.length < 3 || series.length > 10000) return { ok: false, reasons: [`bounded-${label}-outcomes-required`] };
  const reasons = [];
  const normalized = [];
  for (const raw of series) {
    const taskId = text(raw?.taskId, 200);
    const quality = finite(raw?.quality, 0, 1);
    const costUsd = finite(raw?.costUsd, 0, Number.MAX_SAFE_INTEGER);
    const latencyMs = finite(raw?.latencyMs, 0, Number.MAX_SAFE_INTEGER);
    const attemptCount = finite(raw?.attemptCount, 1, 100);
    if (!taskId || quality == null || costUsd == null || latencyMs == null || attemptCount == null || !observedReceipt(raw)) { reasons.push(`complete-observed-${label}-outcome-required:${taskId || 'unknown'}`); continue; }
    normalized.push({ taskId, quality, costUsd, latencyMs, attemptCount, evidenceRef: raw.evidenceRef });
  }
  return { ok: reasons.length === 0 && normalized.length === series.length, reasons, normalized };
}
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;

export function evaluateDownroutingPromotion({ baseline, challenger, qualityTolerance = 0.02, minimumCostSavingFraction = 0.1 } = {}) {
  const b = validateOutcomeSeries(baseline?.outcomes, 'baseline');
  const c = validateOutcomeSeries(challenger?.outcomes, 'challenger');
  const reasons = [...b.reasons, ...c.reasons];
  const tolerance = finite(qualityTolerance, 0, 0.2);
  const savingFloor = finite(minimumCostSavingFraction, 0, 1);
  if (tolerance == null || savingFloor == null) reasons.push('valid-downrouting-policy-required');
  if (!text(baseline?.routeId, 200) || !text(challenger?.routeId, 200)) reasons.push('route-identities-required');
  if (baseline?.taskClass !== challenger?.taskClass || !text(baseline?.taskClass, 120)) reasons.push('same-task-class-required');
  if (baseline?.routeId === challenger?.routeId) reasons.push('distinct-routes-required');
  if (challenger?.tier && baseline?.tier && (!(String(challenger.tier).toUpperCase() in TIER_RANK) || !(String(baseline.tier).toUpperCase() in TIER_RANK) || TIER_RANK[String(challenger.tier).toUpperCase()] >= TIER_RANK[String(baseline.tier).toUpperCase()])) reasons.push('challenger-must-be-cheaper-cognition-tier');
  if (!baseline?.preregistered || !challenger?.preregistered) reasons.push('preregistered-comparison-required');
  if (reasons.length || !b.ok || !c.ok) return fail('APOTHEOSIS_DOWNROUTING_REFUSED', reasons);
  const bMap = new Map(b.normalized.map(x => [x.taskId, x]));
  const pairs = c.normalized.map(x => [bMap.get(x.taskId), x]).filter(([x]) => x);
  if (pairs.length !== b.normalized.length || pairs.length !== c.normalized.length) return fail('APOTHEOSIS_DOWNROUTING_REFUSED', ['paired-task-population-required']);
  const bQuality = mean(pairs.map(([x]) => x.quality));
  const cQuality = mean(pairs.map(([, x]) => x.quality));
  const bCost = pairs.reduce((s, [x]) => s + x.costUsd, 0);
  const cCost = pairs.reduce((s, [, x]) => s + x.costUsd, 0);
  const saving = bCost > 0 ? (bCost - cCost) / bCost : 0;
  const qualityDelta = cQuality - bQuality;
  const accepted = qualityDelta >= -tolerance && saving >= savingFloor;
  return pass(accepted ? 'APOTHEOSIS_DOWNROUTING_PROMOTION_ELIGIBLE' : 'APOTHEOSIS_DOWNROUTING_KEEP_BASELINE', {
    promotionEligible: accepted, baselineRouteId: baseline.routeId, challengerRouteId: challenger.routeId,
    pairedTaskCount: pairs.length, qualityDelta, costSavingFraction: saving,
    baselineQuality: bQuality, challengerQuality: cQuality, baselineCostUsd: bCost, challengerCostUsd: cCost,
    routeAuthorityCreated: false
  });
}

export function compileApotheosisContinuityHandoff({ sourceCommit, graphDigest, stateDigest, missionGraphRef, packets = [], workerRouting = [], fileOwnership = [], testRequirements = [], integrationOrder = [], knownFailures = [], unresolvedQuestions = [], rollbackRequirements = [], nextWakeTrigger } = {}) {
  const reasons = [];
  const source = text(sourceCommit, 40)?.toLowerCase();
  const graph = text(graphDigest, 64)?.toLowerCase();
  const state = text(stateDigest, 64)?.toLowerCase();
  const mission = text(missionGraphRef, 2000);
  const packetRefs = unique(packets, 256, 1000);
  const routing = unique(workerRouting, 256, 1000);
  const ownership = unique(fileOwnership, 256, 1000);
  const tests = unique(testRequirements, 256, 1000);
  const order = unique(integrationOrder, 256, 1000);
  const failures = unique(knownFailures, 256, 2000);
  const questions = unique(unresolvedQuestions, 256, 2000);
  const rollback = unique(rollbackRequirements, 256, 2000);
  const wake = text(nextWakeTrigger, 2000);
  if (!source || !SHA40.test(source)) reasons.push('source-commit-required');
  if (!graph || !SHA256.test(graph)) reasons.push('graph-digest-required');
  if (!state || !SHA256.test(state)) reasons.push('state-digest-required');
  if (!mission) reasons.push('mission-graph-reference-required');
  if (!packetRefs || !packetRefs.length) reasons.push('packet-references-required');
  if (!routing || !routing.length) reasons.push('worker-routing-required');
  if (!ownership || !ownership.length) reasons.push('file-ownership-required');
  if (!tests || !tests.length) reasons.push('test-requirements-required');
  if (!order || !order.length) reasons.push('integration-order-required');
  if (!failures || !questions || !rollback || !rollback.length) reasons.push('bounded-failure-question-rollback-lists-required');
  if (!wake) reasons.push('next-wake-trigger-required');
  if (reasons.length) return fail('APOTHEOSIS_CONTINUITY_HANDOFF_REFUSED', reasons);
  const handoff = { schemaVersion: 'uberbond.apotheosis-continuity-handoff.v1', sourceCommit: source, graphDigest: graph, stateDigest: state, missionGraphRef: mission, packets: packetRefs, workerRouting: routing, fileOwnership: ownership, testRequirements: tests, integrationOrder: order, knownFailures: failures, unresolvedQuestions: questions, rollbackRequirements: rollback, nextWakeTrigger: wake };
  handoff.handoffDigest = digest(handoff);
  return pass('APOTHEOSIS_HANDOFF_SAVED_READY', { handoff });
}

export function classifyApotheosisContinuityEvidence({ handoff, currentSourceCommit, workerReceipt = null, unattendedReceipt = null, now = Date.now() } = {}) {
  const reasons = [];
  if (!handoff || !SHA256.test(String(handoff.handoffDigest || ''))) reasons.push('valid-handoff-digest-required');
  else { const { handoffDigest: _ignored, ...core } = handoff; if (digest(core) !== handoff.handoffDigest) reasons.push('handoff-digest-mismatch'); }
  if (handoff?.sourceCommit !== String(currentSourceCommit || '')) reasons.push('source-revision-changed-reconciliation-required');
  if (reasons.length) return fail('APOTHEOSIS_CONTINUITY_EVIDENCE_REFUSED', reasons);
  let level = 'HANDOFF_SAVED';
  if (workerReceipt) {
    if (!observedReceipt(workerReceipt) || workerReceipt.frontierModelUsed === true || workerReceipt.handoffDigest !== handoff.handoffDigest) return fail('APOTHEOSIS_CONTINUITY_EVIDENCE_REFUSED', ['fresh-nonfrontier-worker-resume-receipt-required']);
    level = 'FLEET_RESUMED';
  }
  if (unattendedReceipt) {
    const start = Date.parse(String(unattendedReceipt.startedAt || ''));
    const end = Date.parse(String(unattendedReceipt.endedAt || ''));
    if (level !== 'FLEET_RESUMED' || !observedReceipt(unattendedReceipt) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > Number(now) || unattendedReceipt.handoffDigest !== handoff.handoffDigest) return fail('APOTHEOSIS_CONTINUITY_EVIDENCE_REFUSED', ['independently-dated-unattended-operation-receipt-required']);
    level = 'UNATTENDED_OBSERVED';
  }
  return pass('APOTHEOSIS_CONTINUITY_EVIDENCE_CLASSIFIED', { evidenceLevel: level, handoffDigest: handoff.handoffDigest });
}

export function compareApotheosisOrchestrationArms({ protocol, arms = [] } = {}) {
  const reasons = [];
  if (!protocol?.preregistered || !text(protocol?.protocolId, 200) || !text(protocol?.populationDigest, 64) || !SHA256.test(String(protocol.populationDigest))) reasons.push('preregistered-protocol-with-population-digest-required');
  if (!Array.isArray(arms) || arms.length < 2 || arms.length > 8) reasons.push('bounded-comparison-arms-required');
  const normalized = [];
  for (const arm of arms || []) {
    const id = text(arm?.id, 120);
    const series = validateOutcomeSeries(arm?.outcomes, `arm-${id || 'unknown'}`);
    if (!id || !series.ok || !arm?.completeAttemptAccounting) { reasons.push(...series.reasons, `complete-attempt-accounting-required:${id || 'unknown'}`); continue; }
    normalized.push({ id, outcomes: series.normalized, frontierTokens: finite(arm.frontierTokens, 0, Number.MAX_SAFE_INTEGER), coordinationCostUsd: finite(arm.coordinationCostUsd, 0, Number.MAX_SAFE_INTEGER) });
  }
  if (reasons.length || normalized.length !== arms.length || normalized.some(a => a.frontierTokens == null || a.coordinationCostUsd == null)) return fail('APOTHEOSIS_ORCHESTRATION_COMPARISON_REFUSED', reasons.length ? reasons : ['complete-resource-accounting-required']);
  const population = normalized[0].outcomes.map(x => x.taskId).sort().join('\0');
  if (!normalized.every(a => a.outcomes.map(x => x.taskId).sort().join('\0') === population)) return fail('APOTHEOSIS_ORCHESTRATION_COMPARISON_REFUSED', ['matched-task-population-required']);
  const scored = normalized.map(a => ({
    id: a.id,
    quality: mean(a.outcomes.map(x => x.quality)),
    totalCostUsd: a.outcomes.reduce((s, x) => s + x.costUsd, 0) + a.coordinationCostUsd,
    wallTimeMs: Math.max(...a.outcomes.map(x => x.latencyMs)),
    frontierTokens: a.frontierTokens,
    attemptCount: a.outcomes.reduce((s, x) => s + x.attemptCount, 0)
  }));
  scored.sort((a, b) => b.quality - a.quality || a.totalCostUsd - b.totalCostUsd || a.wallTimeMs - b.wallTimeMs);
  return pass('APOTHEOSIS_ORCHESTRATION_COMPARISON_READY', { protocolId: protocol.protocolId, scored, champion: scored[0], asiInferenceAuthority: 'NONE' });
}

export function admitApotheosisOrchestrationPolicy({ baselinePolicyId, candidatePolicyId, comparison, causalAdmission, rollbackReceipt, independentApproval } = {}) {
  const reasons = [];
  const baseline = text(baselinePolicyId, 200);
  const candidate = text(candidatePolicyId, 200);
  if (!baseline || !candidate || baseline === candidate) reasons.push('distinct-policy-identities-required');
  if (!comparison?.ok || comparison.status !== 'APOTHEOSIS_ORCHESTRATION_COMPARISON_READY') reasons.push('verified-comparison-required');
  if (!causalAdmission?.ok || causalAdmission.candidateId !== candidate || causalAdmission.baselineId !== baseline || causalAdmission.independent === false) reasons.push('independent-causal-admission-for-exact-candidate-required');
  if (!observedReceipt(rollbackReceipt) || rollbackReceipt.rehearsed !== true) reasons.push('observed-rollback-rehearsal-required');
  if (!observedReceipt(independentApproval) || independentApproval.candidateId !== candidate || independentApproval.builderRef === independentApproval.verifierRef) reasons.push('independent-policy-approval-required');
  if (candidate && comparison?.champion?.id !== candidate) reasons.push('candidate-must-win-preregistered-comparison');
  if (reasons.length) return fail('APOTHEOSIS_POLICY_PROMOTION_REFUSED', reasons);
  const proposal = { schemaVersion: 'uberbond.apotheosis-policy-promotion-proposal.v1', baselinePolicyId: baseline, candidatePolicyId: candidate, comparisonProtocolId: comparison.protocolId, causalAdmissionRef: causalAdmission.evidenceRef ?? null, rollbackEvidenceRef: rollbackReceipt.evidenceRef, approvalEvidenceRef: independentApproval.evidenceRef, authorityExpansion: false, productionMutationPerformed: false };
  proposal.proposalDigest = digest(proposal);
  return pass('APOTHEOSIS_POLICY_PROMOTION_ELIGIBLE_PROPOSAL_ONLY', { proposal });
}
