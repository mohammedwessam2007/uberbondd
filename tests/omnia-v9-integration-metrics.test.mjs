import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfusionMatrix, buildShadowReliabilityMetrics, buildFounderBurdenEstimate, summarizeLatencyMs } from '../src/omnia-v9/integrations/metrics.mjs';

function compareRecord(reservationId, category, observedAt) {
  return { type: 'omnia_v9_outbound_compare', detail: { reservationId, category, observedAt } };
}

test('confusion matrix counts each category correctly', () => {
  const matrix = buildConfusionMatrix([
    compareRecord('r1', 'BOTH_ALLOW', '2026-08-08T00:00:00Z'),
    compareRecord('r2', 'BOTH_ALLOW', '2026-08-08T00:01:00Z'),
    compareRecord('r3', 'LEGACY_ALLOW_V9_DENY', '2026-08-08T00:02:00Z'),
    compareRecord('r4', 'LEGACY_DENY_V9_ALLOW', '2026-08-08T00:03:00Z')
  ]);
  assert.equal(matrix.total, 4);
  assert.equal(matrix.counts.BOTH_ALLOW, 2);
  assert.equal(matrix.counts.LEGACY_ALLOW_V9_DENY, 1);
  assert.equal(matrix.criticalDisagreementCount, 1);
  assert.equal(matrix.criticalCases[0].reservationId, 'r4');
});

test('confusion matrix deduplicates idempotent replays by reservationId, keeping the earliest', () => {
  const matrix = buildConfusionMatrix([
    compareRecord('r1', 'BOTH_ALLOW', '2026-08-08T00:00:00Z'),
    // same reservation retried three more times (e.g. a followup retry path)
    compareRecord('r1', 'BOTH_ALLOW', '2026-08-08T00:01:00Z'),
    compareRecord('r1', 'BOTH_ALLOW', '2026-08-08T00:02:00Z'),
    compareRecord('r1', 'BOTH_ALLOW', '2026-08-08T00:03:00Z')
  ]);
  assert.equal(matrix.total, 1, 'a retried reservation must count once, not four times');
  assert.equal(matrix.counts.BOTH_ALLOW, 1);
});

test('a retried reservation cannot flip a critical disagreement count via a later replay', () => {
  const matrix = buildConfusionMatrix([
    compareRecord('r1', 'LEGACY_DENY_V9_ALLOW', '2026-08-08T00:00:00Z'),
    compareRecord('r1', 'BOTH_DENY', '2026-08-08T00:05:00Z') // hypothetical later re-evaluation
  ]);
  assert.equal(matrix.total, 1);
  // earliest observation wins for dedup purposes
  assert.equal(matrix.criticalDisagreementCount, 1);
});

test('shadow reliability metrics compute error and no-hook rates', () => {
  const metrics = buildShadowReliabilityMetrics([
    { type: 'omnia_v9_outbound_final_shadow', detail: { reservationId: 'a', status: 'OBSERVED', decision: 'ALLOW' } },
    { type: 'omnia_v9_outbound_final_shadow', detail: { reservationId: 'b', status: 'OBSERVED', decision: 'REVIEW' } },
    { type: 'omnia_v9_outbound_final_shadow', detail: { reservationId: 'c', status: 'NO_HOOK' } },
    { type: 'omnia_v9_outbound_final_shadow', detail: { reservationId: 'd', status: 'SHADOW_ERROR' } }
  ]);
  assert.equal(metrics.total, 4);
  assert.equal(metrics.byStatus.OBSERVED, 2);
  assert.equal(metrics.byStatus.NO_HOOK, 1);
  assert.equal(metrics.byStatus.SHADOW_ERROR, 1);
  assert.equal(metrics.errorRate, 0.25);
  assert.equal(metrics.noHookRate, 0.25);
  assert.equal(metrics.proofResolutionFailureRate, 0.25); // one OBSERVED+REVIEW out of 4
});

test('founder burden estimate counts only genuine ambiguity as requiring review', () => {
  const matrix = buildConfusionMatrix([
    compareRecord('r1', 'BOTH_ALLOW', '2026-08-08T00:00:00Z'),
    compareRecord('r2', 'BOTH_DENY', '2026-08-08T00:01:00Z'),
    compareRecord('r3', 'LEGACY_ALLOW_V9_DENY', '2026-08-08T00:02:00Z'),
    compareRecord('r4', 'V9_INCOMPLETE', '2026-08-08T00:03:00Z')
  ]);
  const burden = buildFounderBurdenEstimate({ confusionMatrix: matrix, avoidableReviewMinutes: 5 });
  assert.equal(burden.governedActions, 4);
  assert.equal(burden.reviewsRequired, 2); // LEGACY_ALLOW_V9_DENY + V9_INCOMPLETE only
  assert.equal(burden.reviewsPer100GovernedActions, 50);
  assert.equal(burden.founderMinutesPer100GovernedActions, 250);
});

test('latency summary computes percentiles without crashing on empty input', () => {
  assert.deepEqual(summarizeLatencyMs([]), { p50: null, p95: null, p99: null, count: 0 });
  const summary = summarizeLatencyMs([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(summary.count, 10);
  assert(summary.p50 >= 1 && summary.p50 <= 10);
  assert(summary.p99 >= summary.p50);
});
