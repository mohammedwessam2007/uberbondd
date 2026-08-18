// Evidence-gated self-improvement preparation.
//
// This module turns a real, referenced weakness or opportunity into a bounded
// engineering packet. It does not run an agent, edit a repository, promote a
// build, deploy, spend, or widen permissions. A proposal is a request for
// review, not an authorization. The same contract can later be consumed by
// Claude Code or another engineering worker through the existing task bus.

import crypto from 'node:crypto';

export const SELF_UPGRADE_POLICY_VERSION = 'self-upgrade-1.0.0';

export const UPGRADE_STATUSES = Object.freeze([
  'REVIEW_REQUIRED',
  'PREPARED',
  'SHADOW_READY',
  'REPAIR_REQUIRED',
  'PROMOTION_BLOCKED'
]);

export const SELF_UPGRADE_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const MAX_REFS = 100;
const MAX_SCOPE = 40;
const MAX_TESTS = 40;
const MAX_CRITICAL_FAILURES = 100;

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function uniqueStrings(values, max) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 240)).filter(Boolean))].slice(0, max);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value);
  return number != null && number >= 0 ? number : null;
}

function normalizedUnknown(value) {
  if (value == null || value === '') return { status: 'UNKNOWN', value: null };
  if (typeof value === 'object') return { status: 'SUPPLIED', value: structuredClone(value) };
  return { status: 'SUPPLIED', value: text(value, 500) };
}

function failed(reasonCodes, timestamp, extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_UPGRADE_POLICY_VERSION,
    status: 'PROMOTION_BLOCKED',
    timestamp,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...SELF_UPGRADE_EXTERNAL_EFFECTS },
    ...extra
  };
}

function requiredEvidenceRefs(value) {
  return uniqueStrings(value, MAX_REFS).filter(ref => /^(signal|evidence|outcome|audit|doc|test|capability|opportunity|experiment|issue|receipt):/i.test(ref));
}

function normalizeEconomicEffect(value) {
  const effect = value && typeof value === 'object' ? value : {};
  return {
    status: value && typeof value === 'object' ? 'SUPPLIED_WITH_UNKNOWN_FIELDS_ALLOWED' : 'UNKNOWN',
    expectedContributionMarginCents: nonNegativeNumber(effect.expectedContributionMarginCents),
    expectedOwnerMinutesSaved: nonNegativeNumber(effect.expectedOwnerMinutesSaved),
    expectedTimeToCashDays: nonNegativeNumber(effect.expectedTimeToCashDays),
    confidence: finiteNumber(effect.confidence),
    assumptions: uniqueStrings(effect.assumptions, 20)
  };
}

function normalizeBuildCost(value) {
  const cost = value && typeof value === 'object' ? value : {};
  return {
    status: value && typeof value === 'object' ? 'SUPPLIED_WITH_UNKNOWN_FIELDS_ALLOWED' : 'UNKNOWN',
    ownerMinutes: nonNegativeNumber(cost.ownerMinutes),
    engineeringMinutes: nonNegativeNumber(cost.engineeringMinutes),
    computeCents: nonNegativeNumber(cost.computeCents),
    assumptions: uniqueStrings(cost.assumptions, 20)
  };
}

function normalizeRisk(value) {
  const risk = value && typeof value === 'object' ? value : {};
  return {
    status: value && typeof value === 'object' ? 'SUPPLIED_WITH_UNKNOWN_FIELDS_ALLOWED' : 'UNKNOWN',
    level: ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'].includes(String(risk.level || '').toUpperCase())
      ? String(risk.level).toUpperCase() : 'UNKNOWN',
    categories: uniqueStrings(risk.categories, 20),
    mitigations: uniqueStrings(risk.mitigations, 20),
    unknowns: uniqueStrings(risk.unknowns, 20)
  };
}

// BUILD/BUY/PARTNER/ADAPT/DEFER/REJECT router, folded in from the reconciled
// src/upgrade-proposal.mjs (see docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md
// -- Pair 6). Deliberately conservative: DEFER is the fallback, not BUILD, so
// a weak or ambiguous case can never accidentally look like a green light to
// write code. Pure routing logic, isolated so hostile tests can drive it
// directly without a full opportunity/build-distance object.
export const UPGRADE_DECISIONS = Object.freeze(['BUILD', 'BUY', 'PARTNER', 'ADAPT', 'DEFER', 'REJECT']);

export function routeUpgradeDecision({ buildDistance, confidence, compositeScore, isCommodity = false } = {}) {
  const distance = Number.isFinite(buildDistance) ? buildDistance : 1;
  const conf = Number.isFinite(confidence) ? confidence : 0;
  const score = Number.isFinite(compositeScore) ? compositeScore : 0;

  if (score < 30) return 'REJECT'; // no economic value signal strong enough to justify any action
  if (isCommodity) return distance <= 0.2 ? 'BUY' : 'PARTNER'; // never BUILD a commodity regardless of distance
  if (conf < 0.3) return 'DEFER'; // insufficient evidence to commit engineering time, however cheap it looks
  if (distance <= 0.3) return 'BUILD'; // genuinely cheap AND evidenced AND non-commodity
  if (distance <= 0.7) return 'ADAPT';
  return 'DEFER';
}

// Compile a proposal without granting authority. Evidence is represented by
// references only; raw source payloads and secrets never enter this record.
// opportunityScore/buildDistanceResult are optional: when a caller supplies
// both a real scoreOpportunity() result and a real incrementalBuildDistance()
// result, this also runs the BUILD/BUY router and records its decision on
// the proposal, blocking outright (never REVIEW_REQUIRED) when the router
// says REJECT -- there is no economic case worth a reviewable proposal.
// Every other routed decision (BUY/PARTNER/ADAPT/DEFER/BUILD) still requires
// full owner review like any other proposal; the router never itself
// authorizes anything.
export function compileUpgradeProposal({
  proposalId,
  problem,
  evidenceRefs = [],
  expectedEconomicEffect,
  buildCost,
  risk,
  affectedCapabilities = [],
  acceptanceCriteria = [],
  rollbackPlan,
  requiredAuthorization = 'OWNER_REQUIRED',
  proposedAgent = 'CLAUDE_CODE',
  opportunityScore = null,
  buildDistanceResult = null,
  isCommodity = false,
  date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const cleanProblem = text(problem, 1000);
  const refs = requiredEvidenceRefs(evidenceRefs);
  const criteria = uniqueStrings(acceptanceCriteria, 20);
  const rollback = text(rollbackPlan, 1000);
  const reasons = [];
  if (!cleanProblem) reasons.push('problem-required');
  if (!refs.length) reasons.push('evidence-references-required');
  if (refs.length !== uniqueStrings(evidenceRefs, MAX_REFS).length) reasons.push('evidence-reference-format-invalid');
  if (!criteria.length) reasons.push('acceptance-criteria-required');
  if (!rollback) reasons.push('rollback-plan-required');
  if (String(requiredAuthorization).toUpperCase() !== 'OWNER_REQUIRED') reasons.push('owner-authorization-required');

  const decisionInput = opportunityScore?.ok === true && buildDistanceResult && typeof buildDistanceResult === 'object';
  const decision = decisionInput
    ? routeUpgradeDecision({
      buildDistance: buildDistanceResult.distance,
      confidence: opportunityScore.confidence,
      compositeScore: opportunityScore.compositeScore,
      isCommodity: Boolean(isCommodity)
    })
    : 'NOT_EVALUATED';
  if (decision === 'REJECT') reasons.push('rejected-insufficient-economic-value');
  if (reasons.length) return failed(reasons, timestamp, { decision });

  const economicEffect = normalizeEconomicEffect(expectedEconomicEffect);
  const cost = normalizeBuildCost(buildCost);
  const normalizedRisk = normalizeRisk(risk);
  const capabilities = uniqueStrings(affectedCapabilities, MAX_REFS);
  const identity = {
    policyVersion: SELF_UPGRADE_POLICY_VERSION,
    problem: cleanProblem,
    evidenceRefs: refs,
    economicEffect,
    buildCost: cost,
    risk: normalizedRisk,
    affectedCapabilities: capabilities,
    acceptanceCriteria: criteria,
    rollbackPlan: rollback,
    requiredAuthorization: 'OWNER_REQUIRED',
    proposedAgent: text(proposedAgent, 120) || 'CLAUDE_CODE',
    decision
  };

  return {
    ok: true,
    policyVersion: SELF_UPGRADE_POLICY_VERSION,
    proposalId: text(proposalId, 120) || `upgrade_${digest(identity).slice(0, 24)}`,
    status: 'REVIEW_REQUIRED',
    createdAt: timestamp,
    problem: cleanProblem,
    evidenceRefs: refs,
    expectedEconomicEffect: economicEffect,
    buildCost: cost,
    risk: normalizedRisk,
    affectedCapabilities: capabilities,
    acceptanceCriteria: criteria,
    rollbackPlan: rollback,
    requiredAuthorization: 'OWNER_REQUIRED',
    proposedAgent: text(proposedAgent, 120) || 'CLAUDE_CODE',
    decision,
    execution: {
      status: 'NOT_RUN',
      agentReceipt: null,
      repositoryMutation: false,
      externalAction: false
    },
    externalEffectLedger: { ...SELF_UPGRADE_EXTERNAL_EFFECTS }
  };
}

const MANDATORY_FORBIDDEN_ACTIONS = Object.freeze([
  'deploy', 'push', 'merge', 'send', 'spend', 'purchase', 'change-credentials',
  'change-dns', 'contact-anyone', 'use-production-data', 'mutate-production'
]);

// Prepare an isolated engineering handoff. The packet is actionable by a
// worker but deliberately contains no execution authority or live secrets.
export function compileEngineeringMissionPacket({
  proposal,
  repositoryScope = ['src/', 'tests/', 'docs/'],
  forbiddenActions = [],
  requiredTests = [],
  acceptanceGate,
  rollbackPlan,
  targetAgent,
  date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!proposal || proposal.ok !== true || proposal.status !== 'REVIEW_REQUIRED' || !proposal.proposalId) {
    return failed(['review-required-proposal-must-be-supplied'], timestamp);
  }
  const scope = uniqueStrings(repositoryScope, MAX_SCOPE).filter(path => !/^lite(?:\/|$)/i.test(path));
  const tests = uniqueStrings(requiredTests, MAX_TESTS);
  const gate = uniqueStrings(acceptanceGate, 20);
  const rollback = text(rollbackPlan || proposal.rollbackPlan, 1000);
  const forbidden = [...new Set([...MANDATORY_FORBIDDEN_ACTIONS, ...uniqueStrings(forbiddenActions, 40)])];
  const reasons = [];
  if (!scope.length) reasons.push('non-protected-repository-scope-required');
  if (!tests.length) reasons.push('required-tests-needed');
  if (!gate.length) reasons.push('acceptance-gate-required');
  if (!rollback) reasons.push('rollback-plan-required');
  if (reasons.length) return failed(reasons, timestamp);

  const packetIdentity = {
    policyVersion: SELF_UPGRADE_POLICY_VERSION,
    proposalId: proposal.proposalId,
    scope,
    tests,
    gate,
    rollback,
    targetAgent: text(targetAgent || proposal.proposedAgent, 120)
  };
  return {
    ok: true,
    policyVersion: SELF_UPGRADE_POLICY_VERSION,
    missionId: `mission_${digest(packetIdentity).slice(0, 24)}`,
    proposalId: proposal.proposalId,
    status: 'PREPARED',
    createdAt: timestamp,
    targetAgent: packetIdentity.targetAgent || 'CLAUDE_CODE',
    objective: proposal.problem,
    evidenceRefs: proposal.evidenceRefs.slice(0, MAX_REFS),
    affectedCapabilities: proposal.affectedCapabilities.slice(0, MAX_REFS),
    repositoryScope: scope,
    forbiddenActions: forbidden,
    requiredTests: tests,
    acceptanceGate: gate,
    rollbackPlan: rollback,
    authority: 'OWNER_REQUIRED',
    execution: {
      status: 'NOT_RUN',
      agentReceipt: null,
      providerCalls: 0,
      repositoryMutation: false,
      externalAction: false
    },
    externalEffectLedger: { ...SELF_UPGRADE_EXTERNAL_EFFECTS }
  };
}

function testSummary(testResults) {
  const input = testResults && typeof testResults === 'object' ? testResults : {};
  const total = Number.isInteger(input.total) ? Math.max(0, input.total) : null;
  const passed = Number.isInteger(input.passed) ? Math.max(0, input.passed) : null;
  const failedCount = Number.isInteger(input.failed) ? Math.max(0, input.failed) : null;
  const criticalFailures = uniqueStrings(input.criticalFailures, MAX_CRITICAL_FAILURES);
  const complete = total != null && passed != null && failedCount != null;
  return {
    complete,
    total,
    passed,
    failed: failedCount,
    criticalFailures,
    allPassing: complete && total === passed && failedCount === 0 && criticalFailures.length === 0
  };
}

function metricStatus(baseline, candidate, { lowerIsBetter = false } = {}) {
  const baselineValue = finiteNumber(baseline);
  const candidateValue = finiteNumber(candidate);
  if (baselineValue == null || candidateValue == null) return { status: 'UNKNOWN', baseline: baselineValue, candidate: candidateValue };
  const nonRegressing = lowerIsBetter ? candidateValue <= baselineValue : candidateValue >= baselineValue;
  return { status: nonRegressing ? 'NON_REGRESSING' : 'REGRESSION', baseline: baselineValue, candidate: candidateValue };
}

// Evaluate only local evidence. Passing tests may make a candidate eligible
// for shadow review, never for automatic promotion or deployment.
export function evaluateUpgradeGate({
  proposal,
  testResults,
  baseline,
  candidate,
  ownerRepairCountBaseline,
  ownerRepairCountCandidate,
  externalProof = false,
  date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!proposal || proposal.ok !== true || !proposal.proposalId) return failed(['valid-proposal-required'], timestamp);
  const tests = testSummary(testResults);
  const quality = metricStatus(baseline, candidate);
  const repairs = metricStatus(ownerRepairCountBaseline, ownerRepairCountCandidate, { lowerIsBetter: true });
  const reasons = [];
  if (!tests.complete) reasons.push('complete-test-receipt-required');
  if (tests.complete && !tests.allPassing) reasons.push('tests-not-passing');
  if (quality.status === 'REGRESSION') reasons.push('candidate-regresses-baseline');
  if (repairs.status === 'REGRESSION') reasons.push('owner-repairs-increased');
  if (externalProof) reasons.push('external-proof-cannot-be-inferred-locally');
  const shadowReady = reasons.length === 0 && tests.allPassing;
  return {
    ok: true,
    policyVersion: SELF_UPGRADE_POLICY_VERSION,
    evaluationId: `gate_${digest({ proposalId: proposal.proposalId, timestamp, tests, quality, repairs, externalProof: Boolean(externalProof) }).slice(0, 24)}`,
    proposalId: proposal.proposalId,
    timestamp,
    status: shadowReady ? 'SHADOW_READY' : 'REPAIR_REQUIRED',
    reasonCodes: reasons,
    testSummary: tests,
    baselineComparison: quality,
    ownerRepairComparison: repairs,
    externalProof: Boolean(externalProof),
    promotion: {
      status: 'PROMOTION_BLOCKED',
      authority: 'OWNER_REQUIRED',
      reason: 'Local verification can prepare shadow evidence but cannot authorize production promotion.'
    },
    execution: {
      status: 'NOT_RUN',
      deployment: false,
      providerCalls: 0,
      externalAction: false
    },
    externalEffectLedger: { ...SELF_UPGRADE_EXTERNAL_EFFECTS }
  };
}

export async function logSelfUpgradeReceipt(store, type, detail) {
  if (!store || typeof store.log !== 'function' || !detail?.ok) return null;
  return store.log(type, {
    policyVersion: detail.policyVersion,
    proposalId: detail.proposalId || null,
    missionId: detail.missionId || null,
    evaluationId: detail.evaluationId || null,
    status: detail.status,
    reasonCodes: detail.reasonCodes || [],
    evidenceRefs: detail.evidenceRefs || [],
    affectedCapabilities: detail.affectedCapabilities || [],
    repositoryScope: detail.repositoryScope || [],
    requiredTests: detail.requiredTests || [],
    acceptanceGate: detail.acceptanceGate || [],
    execution: detail.execution || null,
    promotion: detail.promotion || null,
    externalProof: detail.externalProof ?? null,
    timestamp: detail.timestamp || detail.createdAt || null,
    externalEffectLedger: detail.externalEffectLedger
  });
}
