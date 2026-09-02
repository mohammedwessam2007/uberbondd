import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/omnia-v9/integrations/providers/postal-effect-adapter.mjs', import.meta.url), 'utf8');
const webhookEvidenceSource = fs.readFileSync(new URL('../src/omnia-v9/integrations/providers/postal-webhook-evidence.mjs', import.meta.url), 'utf8');
const webhookRouteSource = fs.readFileSync(new URL('../api/webhooks/postal.mjs', import.meta.url), 'utf8');

test('mutation guard: HTTP 409 can never be classified as definite rejection', () => {
  const set = source.match(/DEFINITE_REJECTION_STATUSES\s*=\s*new Set\(\[([^\]]*)\]\)/)?.[1] || '';
  assert.equal(/(^|\D)409(\D|$)/.test(set), false, '409 must remain UNCERTAIN because submission may have occurred');
});

test('mutation guard: post-acceptance failure events can never authorize a resend', () => {
  const submissionSet = source.match(/SUBMISSION_PROOF_STATUSES\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
  for (const required of ['DELIVERY_FAILED','MESSAGEDELIVERYFAILED','BOUNCED','MESSAGEBOUNCED','DNS_ERROR','DOMAINDNSERROR']) {
    assert.equal(submissionSet.includes(`'${required}'`), true, `${required} must remain submission proof`);
  }
  assert.match(source, /lifecycle:\s*'RECONCILED_ACCEPTED'/);
  assert.match(source, /negativeDeliveryEvidence:\s*NEGATIVE_DELIVERY_STATUSES\.has\(status\)/);
  assert.doesNotMatch(source, /\['DELIVERY_FAILED'[\s\S]*?lifecycle:\s*'RECONCILED_REJECTED'/);
});

test('mutation guard: normalized authenticated lifecycle outranks mutable payload status', () => {
  assert.match(source, /const lifecycleStatus\s*=\s*String\(row\.lifecycle/);
  assert.match(source, /const status\s*=\s*lifecycleStatus\s*\|\|\s*providerStatus/);
});

test('mutation guard: reconciliation rejects unauthenticated or caller-asserted webhook rows', () => {
  assert.match(source, /row\.provenance\s*!==\s*'AUTHENTICATED_POSTAL_WEBHOOK'/);
  assert.match(source, /unauthenticated-or-unproven-reconciliation-row/);
});

test('mutation guard: dispatch has a bounded AbortController timeout and exactly one fetch site', () => {
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /setTimeout\(\(\)\s*=>\s*controller\.abort/);
  const fetchCalls = source.match(/await this\.fetchImpl\(/g) || [];
  assert.equal(fetchCalls.length, 1, 'dispatch must have one provider-call site and no hidden retry');
});

test('mutation guard: webhook lifecycle aggregation ranks evidence before timestamps', () => {
  const sortBody = webhookEvidenceSource.match(/const sorted\s*=\s*usable\.slice\(\)\.sort\(\(a, b\) => \{([\s\S]*?)\n\s*\}\);/)?.[1] || '';
  const rankIndex = sortBody.indexOf('const rank');
  const timeIndex = sortBody.indexOf('const time');
  assert.notEqual(rankIndex, -1, 'lifecycle rank comparison must exist');
  assert.notEqual(timeIndex, -1, 'timestamp tie-breaker must exist');
  assert.ok(rankIndex < timeIndex, 'rank must be evaluated before timestamp so later weak events cannot regress stronger proof');
});

test('mutation guard: webhook route verifies only Postal SHA-256 signature header', () => {
  assert.match(webhookRouteSource, /headers\.get\('x-postal-signature-256'\)/);
  assert.doesNotMatch(webhookRouteSource, /signatureBase64:\s*request\.headers\.get\('x-postal-signature'\)/);
});
