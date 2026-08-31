import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WALLBREAKER_POLICY_VERSION,
  compileWallProblem,
  scoreWallCandidate,
  classifyWallFailure,
  deriveCountermoves,
  resolveWallCapabilities,
  planWallbreakerCycle
} from '../src/wallbreaker.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const baseProblem = {
  objective: 'Clear the wall without violating authority or wasting founder time.',
  successCriteria: ['verified outcome', 'no forbidden external effect'],
  hardConstraints: ['authority:no-unauthorized-action', 'no-secret-exfiltration'],
  assumptions: ['provider-a-available'],
  unknowns: ['best-provider'],
  requiredCapabilities: ['provider-routing'],
  riskBudget: 6,
  maxSpendCents: 5000,
  maxFounderMinutes: 60,
  ownerReservedAuthority: ['move-money']
};

function candidate(overrides = {}) {
  return {
    id: 'a',
    family: 'provider-substitution',
    mechanism: 'Use an already-authorized alternate provider.',
    requiredCapabilities: ['provider-routing'],
    assumptions: [],
    constraintViolations: [],
    successProbability: 0.8,
    expectedContributionCents: 10000,
    costCents: 1000,
    founderMinutes: 5,
    risk: 2,
    evidenceStrength: 8,
    novelty: 6,
    robustness: 8,
    reversible: true,
    evidenceRefs: ['provider-status-receipt'],
    ...overrides
  };
}

test('problem compilation is deterministic and authority-free', () => {
  const first = compileWallProblem(baseProblem);
  const second = compileWallProblem(structuredClone(baseProblem));
  assert.equal(first.ok, true);
  assert.equal(first.problemId, second.problemId);
  assert.equal(first.policyVersion, WALLBREAKER_POLICY_VERSION);
  assert.equal(first.businessEffectAuthority, 'NONE');
  assert.deepEqual(first.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});

test('candidate scoring fails closed on authority, spend, founder-minute, risk, and mechanism gates', () => {
  const compiled = compileWallProblem(baseProblem);
  const authority = scoreWallCandidate(candidate({ constraintViolations: ['authority:no-unauthorized-action'] }), { problem: compiled.problem });
  const expensive = scoreWallCandidate(candidate({ costCents: 5001 }), { problem: compiled.problem });
  const founderHeavy = scoreWallCandidate(candidate({ founderMinutes: 61 }), { problem: compiled.problem });
  const risky = scoreWallCandidate(candidate({ risk: 7 }), { problem: compiled.problem });
  const mechanismless = scoreWallCandidate(candidate({ mechanism: '' }), { problem: compiled.problem });
  assert.equal(authority.eligible, false);
  assert.ok(authority.reasonCodes.includes('authority-boundary-violation'));
  assert.equal(expensive.eligible, false);
  assert.ok(expensive.reasonCodes.includes('spend-ceiling-violation'));
  assert.equal(founderHeavy.eligible, false);
  assert.ok(founderHeavy.reasonCodes.includes('founder-minute-ceiling-violation'));
  assert.equal(risky.eligible, false);
  assert.ok(risky.reasonCodes.includes('risk-budget-violation'));
  assert.equal(mechanismless.eligible, false);
  assert.ok(mechanismless.reasonCodes.includes('mechanism-unspecified'));
});

test('failure classification turns quota exhaustion into provider failure, not limit evasion', () => {
  const failure = classifyWallFailure({ quotaExhausted: true, candidateId: 'a', outcomeUncertain: false });
  assert.equal(failure.failureClass, 'PROVIDER_FAILURE');
  assert.equal(failure.safeToRetrySameMechanism, true);
  const counters = deriveCountermoves(failure);
  assert.ok(counters.actions.some(action => action.type === 'switch-provider'));
  assert.ok(!counters.actions.some(action => /bypass|evade/i.test(action.type)));
});

test('already-classified failures retain their diagnosis across replanning', () => {
  const first = classifyWallFailure({
    missingCapability: true,
    missingCapabilities: ['js-rendering'],
    missingCapabilityAtomIds: ['web.render-js'],
    evidenceRefs: ['gap-proof']
  });
  const second = classifyWallFailure(first);
  assert.equal(second.failureClass, 'CAPABILITY_GAP');
  assert.deepEqual(second.missingCapabilities, ['js-rendering']);
  assert.deepEqual(second.missingCapabilityAtomIds, ['web.render-js']);
  assert.deepEqual(second.evidenceRefs, ['gap-proof']);
});

test('authority block produces lawful substitutes and explicit anti-circumvention guardrails', () => {
  const counters = deriveCountermoves({ authorityDenied: true, candidateId: 'blocked', evidenceRefs: ['policy-denial'] });
  assert.equal(counters.failure.failureClass, 'AUTHORITY_BLOCK');
  assert.ok(counters.actions.some(action => action.type === 'find-lawful-substitute'));
  assert.ok(counters.forbidden.includes('circumvent-permission'));
  assert.ok(counters.forbidden.includes('bypass-terms'));
});

test('capability gaps create focused Capability Genome queries', () => {
  const counters = deriveCountermoves({
    missingCapability: true,
    missingCapabilities: ['js-rendering', 'invoice-reconciliation'],
    missingCapabilityAtomIds: ['web.render-js']
  });
  assert.equal(counters.failure.failureClass, 'CAPABILITY_GAP');
  assert.deepEqual(counters.capabilityQueries.filter(item => item.capability).map(item => item.capability), ['js-rendering', 'invoice-reconciliation']);
  assert.ok(counters.capabilityQueries.some(item => item.atomId === 'web.render-js'));
});

test('a failed mechanism with uncertain external outcome is not blindly retried and a different family wins', () => {
  const compiled = compileWallProblem(baseProblem);
  const failed = candidate({ id: 'failed', family: 'provider-substitution' });
  const failedScore = scoreWallCandidate(failed, { problem: compiled.problem });
  const alternate = candidate({ id: 'alternate', family: 'dependency-redesign', mechanism: 'Remove the failed provider dependency entirely.', expectedContributionCents: 8500, evidenceRefs: ['architecture-proof'] });
  const plan = planWallbreakerCycle({
    problem: compiled,
    candidates: [failed, alternate],
    failures: [{ providerUnavailable: true, candidateId: 'failed', failedSignature: failedScore.candidate.signature, outcomeUncertain: true, evidenceRefs: ['provider-outage'] }]
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.selected.candidate.id, 'alternate');
  assert.ok(plan.rejected.find(item => item.candidate.id === 'failed').reasonCodes.includes('failed-mechanism-not-changed'));
});

test('a known-safe retryable provider failure may keep the same mechanism eligible', () => {
  const compiled = compileWallProblem(baseProblem);
  const retry = candidate({ id: 'retry', expectedContributionCents: 12000 });
  const retryScore = scoreWallCandidate(retry, { problem: compiled.problem });
  const plan = planWallbreakerCycle({
    problem: compiled,
    candidates: [retry],
    failures: [{ rateLimited: true, candidateId: 'retry', failedSignature: retryScore.candidate.signature, outcomeUncertain: false, evidenceRefs: ['provider-definitive-no-execution'] }]
  });
  assert.equal(plan.selected.candidate.id, 'retry');
  assert.equal(plan.failures[0].safeToRetrySameMechanism, true);
});

test('falsified assumptions prune dependent candidates and reopen search', () => {
  const plan = planWallbreakerCycle({
    problem: baseProblem,
    candidates: [
      candidate({ id: 'dependent', assumptions: ['provider-a-available'] }),
      candidate({ id: 'independent', family: 'owned-path', mechanism: 'Use an owned path.', assumptions: [] })
    ],
    failures: [{ assumptionFalsified: true, invalidatedAssumptions: ['provider-a-available'], evidenceRefs: ['provider-a-down'] }]
  });
  assert.equal(plan.selected.candidate.id, 'independent');
  assert.ok(plan.rejected.find(item => item.candidate.id === 'dependent').reasonCodes.includes('relies-on-falsified-assumption'));
});

test('solution frontier preserves family diversity instead of filling fallbacks with clones', () => {
  const plan = planWallbreakerCycle({
    problem: baseProblem,
    candidates: [
      candidate({ id: 'a1', family: 'provider-substitution', expectedContributionCents: 12000 }),
      candidate({ id: 'a2', family: 'provider-substitution', expectedContributionCents: 11000 }),
      candidate({ id: 'b1', family: 'dependency-redesign', mechanism: 'Remove provider dependency.', expectedContributionCents: 9000 }),
      candidate({ id: 'c1', family: 'manual-bounded-fallback', mechanism: 'Use a bounded owner-reviewed fallback.', expectedContributionCents: 8000 })
    ]
  });
  assert.equal(plan.familyCount, 3);
  const selectedAndFallbackFamilies = [plan.selected, ...plan.fallbacks].map(item => item.candidate.family);
  assert.equal(new Set(selectedAndFallbackFamilies).size, selectedAndFallbackFamilies.length);
});

test('unclear walls escalate compute while retaining zero external effects', () => {
  const plan = planWallbreakerCycle({
    problem: { ...baseProblem, unknowns: Array.from({ length: 9 }, (_, i) => `unknown-${i}`) },
    candidates: []
  });
  assert.equal(plan.computeTier, 'EXTREME');
  assert.equal(plan.status, 'SEARCH_REQUIRED');
  assert.deepEqual(plan.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});

test('human capability labels are never silently promoted into Genome atom ids', () => {
  const plan = planWallbreakerCycle({ problem: baseProblem, candidates: [candidate()] });
  assert.deepEqual(plan.requiredCapabilityAtomIds, []);
  assert.equal(plan.capabilityResolution.status, 'GENOME_QUERY_NOT_SCOPED');
  assert.equal(plan.status, 'CANDIDATE_SELECTED');
});

test('explicit Genome atoms with no supplied corpus produce a real capability gap instead of fake availability', () => {
  const resolution = resolveWallCapabilities({ mission: 'render javascript', requiredAtomIds: ['web.render-js'], genome: { capabilities: [] } });
  assert.equal(resolution.ok, true);
  assert.equal(resolution.retrieval.status, 'PROGRESSIVE_RETRIEVAL_COMPLETE');
  assert.equal(resolution.retrieval.candidateCount, 0);
  assert.equal(resolution.status, 'CAPABILITY_GAP_REMAINS');
  assert.deepEqual(resolution.bundle.uncoveredAtomIds, ['web.render-js']);
  assert.deepEqual(resolution.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});

test('a selected strategy with unresolved explicit Genome atoms is not execution-ready', () => {
  const plan = planWallbreakerCycle({
    problem: { ...baseProblem, requiredCapabilityAtomIds: ['web.render-js'] },
    candidates: [candidate({ requiredCapabilityAtomIds: ['web.render-js'] })],
    genome: { capabilities: [] }
  });
  assert.equal(plan.selected.candidate.id, 'a');
  assert.equal(plan.status, 'CANDIDATE_SELECTED_CAPABILITY_GAP');
  assert.equal(plan.capabilityResolution.status, 'CAPABILITY_GAP_REMAINS');
  assert.match(plan.nextSearchInstruction, /Capability Genome atom gap/);
  assert.deepEqual(plan.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});
