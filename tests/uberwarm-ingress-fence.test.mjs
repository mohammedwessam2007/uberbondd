import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateIngressFence, readIngressHealth, DEFAULT_INGRESS_URL, INGRESS_FENCE_STATES } from '../src/uberwarm-ingress-fence.mjs';

const now = new Date('2026-10-19T22:30:00.000Z');
const health = overrides => ({ service: 'uberwarm-ingress', httpReady: true, signingConfigured: true, dbConfigured: true, databaseReadback: true, adverseEventCount: 0, canonicalReconciledAdverseEventCount: 0, pendingReplyReviewCount: 0, canonicalSuppressionReconciled: true, outboundAuthority: 'NONE', observedAt: '2026-10-19T22:29:00.000Z', ...overrides });
const webhook = overrides => ({ id: 'c9a55j1XPPu86ioRR0zv', url: DEFAULT_INGRESS_URL, status: 'enabled', events: ['email.bounced', 'email.complained', 'email.received'], consecutive_failures: 0, ...overrides });
const fence = overrides => evaluateIngressFence({ ingressHealth: health(), webhook: webhook(), canonicalReconciliation: { reconciledAdverseEventCount: 0 }, now, ...overrides });

test('fully reconciled, fresh and enabled evidence is CLEAR but never grants authority', () => {
  const result = fence();
  assert.equal(result.state, INGRESS_FENCE_STATES.CLEAR);
  assert.deepEqual(result.holdReasonCodes, []);
  assert.equal(result.sendAuthority, 'NONE');
});

test('pending potentially opted-out inbound replies must hold; missing backlog is unknown',()=>{
  const pending=fence({ingressHealth:health({pendingReplyReviewCount:1})});
  assert.equal(pending.state,INGRESS_FENCE_STATES.HOLD);
  assert.ok(pending.holdReasonCodes.includes('unreviewed-inbound-replies-potential-stop'));
  const missing=fence({ingressHealth:health({pendingReplyReviewCount:null})});
  assert.equal(missing.state,INGRESS_FENCE_STATES.HOLD);
  assert.ok(missing.holdReasonCodes.includes('unreviewed-reply-count-unavailable'));
});

test('an adverse ingress event not yet in the canonical stop list holds', () => {
  const result = fence({ ingressHealth: health({ adverseEventCount: 1 }) });
  assert.equal(result.state, INGRESS_FENCE_STATES.HOLD);
  assert.ok(result.holdReasonCodes.includes('unreconciled-adverse-ingress-events'));
});

test('the live disabled webhook observed 2026-10-19 holds', () => {
  const result = fence({ webhook: webhook({ status: 'disabled' }) });
  assert.equal(result.state, INGRESS_FENCE_STATES.HOLD);
  assert.ok(result.holdReasonCodes.includes('provider-webhook-not-enabled:disabled'));
});

test('missing adverse subscriptions, wrong URL and delivery failures hold', () => {
  const result = fence({ webhook: webhook({ events: ['email.received'], url: 'https://example.com/x', consecutive_failures: 2 }) });
  for (const code of ['provider-webhook-missing-event:email.bounced', 'provider-webhook-missing-event:email.complained', 'provider-webhook-url-mismatch', 'provider-webhook-delivery-failures']) assert.ok(result.holdReasonCodes.includes(code), code);
});

test('same-database claims and mismatched counts are never sufficient without readback', () => {
  for (const modified of [
    { canonicalSuppressionReconciled: false },
    { canonicalReconciledAdverseEventCount: null },
    { adverseEventCount: 1, canonicalReconciledAdverseEventCount: 0 },
  ]) assert.equal(fence({ ingressHealth: health(modified) }).state, INGRESS_FENCE_STATES.HOLD);
});

test('unknown or stale or unhealthy ingress never reads as an empty suppression list', () => {
  assert.ok(fence({ ingressHealth: null }).holdReasonCodes.includes('ingress-health-unavailable'));
  assert.ok(fence({ ingressHealth: health({ observedAt: '2026-10-19T21:00:00.000Z' }) }).holdReasonCodes.includes('ingress-health-stale'));
  assert.ok(fence({ ingressHealth: health({ adverseEventCount: null }) }).holdReasonCodes.includes('ingress-adverse-count-unknown'));
  assert.ok(fence({ ingressHealth: health({ databaseReadback: false }) }).holdReasonCodes.includes('ingress-database-readback-failed'));
  assert.ok(fence({ ingressHealth: health({ signingConfigured: false }) }).holdReasonCodes.includes('ingress-signing-not-configured'));
  assert.ok(fence({ ingressHealth: health({ outboundAuthority: 'FULL' }) }).holdReasonCodes.includes('ingress-claims-outbound-authority'));
  assert.ok(fence({ canonicalReconciliation: null }).holdReasonCodes.includes('canonical-reconciliation-unknown'));
  assert.ok(fence({ canonicalReconciliation: { reconciledAdverseEventCount: 3 } }).holdReasonCodes.includes('canonical-ahead-of-ingress-inconsistent'));
});

const response = (status, body, type = 'application/json') => ({ status, headers: { get: () => type }, json: async () => body });

test('readIngressHealth returns null on non-200, HTML, foreign JSON or network error', async () => {
  assert.equal(await readIngressHealth({ fetchImpl: async () => response(503, {}) }), null);
  assert.equal(await readIngressHealth({ fetchImpl: async () => response(200, {}, 'text/html') }), null);
  assert.equal(await readIngressHealth({ fetchImpl: async () => response(200, { service: 'other' }) }), null);
  assert.equal(await readIngressHealth({ fetchImpl: async () => { throw new Error('down'); } }), null);
  const ok = await readIngressHealth({ fetchImpl: async () => response(200, health()), now: () => now });
  assert.equal(ok.observedAt, now.toISOString());
  assert.equal(evaluateIngressFence({ ingressHealth: ok, webhook: webhook(), canonicalReconciliation: { reconciledAdverseEventCount: 0 }, now }).state, 'CLEAR');
});
