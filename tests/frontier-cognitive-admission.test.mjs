import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { buildFrontierAdmissionBundle, compileAdmittedFrontierPlan } from '../src/frontier-cognitive-admission.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile(overrides = {}) {
  return {
    id: 'elite', provider: 'google', model: 'gemini-frontier', revision: 'rev-1',
    transportProvider: 'ai-gateway', transportModel: 'google/gemini-frontier',
    transportSourceRef: 'official://gateway', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: { FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' } },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000, centsPerMillionInputTokens: 10, centsPerMillionOutputTokens: 20,
    identityAliases: ['gemini-frontier'], enabled: true,
    ...overrides
  };
}
function callability(p, overrides = {}) {
  return {
    profileId: p.id, status: 'CALLABLE_NOW', observedProvider: p.provider, observedModel: p.model,
    observedRevision: p.revision, observedTransportProvider: p.transportProvider, observedTransportModel: p.transportModel,
    observedAt: FRESH, sourceRef: 'runtime://probe', evidenceClass: 'OBSERVED_RUNTIME', identityVerification: 'OBSERVED',
    ...overrides
  };
}
function benchmark(p, overrides = {}) {
  const out = normalizeModelBenchmark({
    provider: p.provider, model: p.model, taskClasses: p.taskClasses, taskClass: 'general',
    quality: 0.98, reliability: 0.97, latencyScore: 0.8, economicImpact: 0.9, evidenceConfidence: 0.99, costEfficiency: 0.7
  }, new Date(FRESH));
  out.observedRevision = p.revision;
  out.evidenceRef = 'benchmark://elite';
  return Object.assign(out, overrides);
}
function contextArtifacts() {
  return [{ id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['frontier'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true }];
}
function task() {
  return { missionId: 'admission', taskId: 'admission', objective: 'Prove admission.', taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier: 'FRONTIER_MAX', requiredTags: ['frontier'], contextTokenBudget: 1000, minCouncilSize: 2, maxCouncilSize: 2 };
}
function build({ p = profile(), calls, benchmarks } = {}) {
  return buildFrontierAdmissionBundle({
    profiles: [p], callability: calls ?? [callability(p)], benchmarks: benchmarks ?? [benchmark(p)], contextArtifacts: contextArtifacts(),
    source: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://admission-suite', observedAt: FRESH }
  });
}

test('plain JSON shaped like an admission bundle cannot bypass the process admission membrane', () => {
  const p = profile();
  const forged = { schemaVersion: 'uberbond.frontier-admission-bundle.v1', profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts() };
  const out = compileAdmittedFrontierPlan({ task: task(), admissionBundle: forged, now: NOW });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'FRONTIER_PLAN_ADMISSION_BLOCKED');
  assert.ok(out.reasonCodes.includes('process-validated-frontier-admission-bundle-required'));
});

test('callability with model or revision drift is discarded before the lower compiler sees it', () => {
  const p = profile();
  const admission = build({ p, calls: [callability(p, { observedRevision: 'other-rev' })] });
  assert.equal(admission.ok, true);
  assert.equal(admission.bundle.callability.length, 0);
  assert.equal(admission.bundle.rejectedCallability.length, 1);
  const plan = compileAdmittedFrontierPlan({ task: task(), admissionBundle: admission.bundle, now: NOW });
  assert.equal(plan.ok, false);
  assert.equal(plan.status, 'CAPACITY_BLOCKED');
});

test('benchmark missing exact revision evidence is discarded before routing', () => {
  const p = profile();
  const bad = benchmark(p);
  delete bad.observedRevision;
  const admission = build({ p, benchmarks: [bad] });
  assert.equal(admission.ok, true);
  assert.equal(admission.bundle.benchmarks.length, 0);
  assert.equal(admission.bundle.rejectedBenchmarks.length, 1);
  const plan = compileAdmittedFrontierPlan({ task: task(), admissionBundle: admission.bundle, now: NOW });
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.includes('frontier-tier-requires-fresh-quality-evidence'));
});

test('benchmark missing durable evidence pointer is discarded', () => {
  const p = profile();
  const bad = benchmark(p);
  delete bad.evidenceRef;
  const admission = build({ p, benchmarks: [bad] });
  assert.equal(admission.ok, true);
  assert.equal(admission.bundle.benchmarks.length, 0);
  assert.equal(admission.bundle.rejectedBenchmarks.length, 1);
});

test('valid admission produces a tamper-evident digest and an admitted frontier plan', () => {
  const admission = build();
  assert.equal(admission.ok, true);
  assert.match(admission.bundle.identityDigest, /^[a-f0-9]{64}$/);
  const plan = compileAdmittedFrontierPlan({ task: task(), admissionBundle: admission.bundle, now: NOW });
  assert.equal(plan.ok, true);
  assert.equal(plan.plan.selected.profileId, 'elite');
  assert.equal(plan.admissionDigest, admission.bundle.identityDigest);
});
