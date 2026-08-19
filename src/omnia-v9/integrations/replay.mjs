import { admitAction } from '../kernel.mjs';
import { deriveOutboundActionIntent } from './outbound-admission.mjs';
import { classifyComparison, COMPARISON_CATEGORIES } from './compare.mjs';

const OUTBOUND_EXTERNAL_ORIGINS = ['EXTERNAL_SOURCE', 'PROVIDER_CALLBACK', 'CUSTOMER_ATTESTATION', 'PROFESSIONAL_ATTESTATION', 'PRODUCTION_TELEMETRY'];

/**
 * Runs one replay scenario end to end: derive intent/evidence from the
 * scenario's context (optionally tampered, dropped, or malformed — exactly
 * as an adversarial or corrupted real candidate might arrive), evaluate V9
 * admission, and classify against the scenario's stated legacy decision.
 * Never touches Gmail, a real database, or a real Cedar instance — this is
 * a pure, offline, synchronous-safe replay.
 */
export function runScenario(testScenario) {
  const { context, admissionOptions } = testScenario.build();
  const startedAt = process.hrtime.bigint();
  try {
    let { intent, evidence } = deriveOutboundActionIntent(context, admissionOptions.now || new Date());
    if (typeof admissionOptions.__tamperIntent === 'function') intent = admissionOptions.__tamperIntent(intent);
    if (typeof admissionOptions.__tamperEvidence === 'function') evidence = admissionOptions.__tamperEvidence(evidence);
    const dropEvidence = admissionOptions.__dropEvidence === true;

    const authorization = admitAction(intent, {
      now: admissionOptions.now,
      approvals: admissionOptions.approvals || [],
      keyResolver: admissionOptions.keyResolver || (() => null),
      usageResolver: admissionOptions.usageResolver || (() => ({ uses: 0, costUsd: 0 })),
      evidenceResolver: id => (dropEvidence ? null : (id === evidence.evidenceId ? evidence : null)),
      evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: OUTBOUND_EXTERNAL_ORIGINS }),
      policyAuthorizer: admissionOptions.policyAuthorizer || (() => ({ decision: 'REVIEW' })),
      policyVersion: admissionOptions.policyVersion || 'omnia-v9-replay-v1',
      policyDigest: admissionOptions.policyDigest,
      constitutionDigest: admissionOptions.constitutionDigest,
      killState: admissionOptions.killState || { active: false },
      revokedApprovalIds: admissionOptions.revokedApprovalIds || new Set()
    });

    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const category = classifyComparison({
      legacyEligible: testScenario.legacyEligible,
      v9Status: 'OBSERVED',
      v9Decision: authorization.decision
    });

    return {
      id: testScenario.id,
      category: testScenario.category,
      description: testScenario.description,
      legacyEligible: testScenario.legacyEligible,
      v9Decision: authorization.decision,
      v9Reasons: authorization.reasons,
      comparisonCategory: category,
      latencyMs,
      error: null
    };
  } catch (error) {
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    return {
      id: testScenario.id,
      category: testScenario.category,
      description: testScenario.description,
      legacyEligible: testScenario.legacyEligible,
      v9Decision: null,
      v9Reasons: [],
      comparisonCategory: 'V9_ERROR',
      latencyMs,
      error: String(error?.message || error)
    };
  }
}

export function runReplay(scenarios) {
  const results = scenarios.map(runScenario);
  const byCategory = Object.fromEntries(COMPARISON_CATEGORIES.map(category => [category, 0]));
  const byFailureClass = {};
  const latencies = [];
  for (const result of results) {
    byCategory[result.comparisonCategory] = (byCategory[result.comparisonCategory] || 0) + 1;
    byFailureClass[result.category] = byFailureClass[result.category] || { total: 0, comparisonCategories: {} };
    byFailureClass[result.category].total += 1;
    byFailureClass[result.category].comparisonCategories[result.comparisonCategory] =
      (byFailureClass[result.category].comparisonCategories[result.comparisonCategory] || 0) + 1;
    latencies.push(result.latencyMs);
  }
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const at = percentile => sortedLatencies.length
    ? sortedLatencies[Math.min(sortedLatencies.length - 1, Math.floor((percentile / 100) * sortedLatencies.length))]
    : null;
  return {
    totalScenarios: results.length,
    byComparisonCategory: byCategory,
    byFailureClass,
    criticalDisagreements: results.filter(result => result.comparisonCategory === 'LEGACY_DENY_V9_ALLOW'),
    errors: results.filter(result => result.error),
    latencyMs: { p50: at(50), p95: at(95), p99: at(99), maxObserved: sortedLatencies.at(-1) ?? null },
    results
  };
}
