import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/omnia-v9/integrations/providers/postal-effect-adapter.mjs', import.meta.url), 'utf8');

test('mutation guard: HTTP 409 can never be classified as definite rejection', () => {
  const set = source.match(/DEFINITE_REJECTION_STATUSES\s*=\s*new Set\(\[([^\]]*)\]\)/)?.[1] || '';
  assert.equal(/(^|\D)409(\D|$)/.test(set), false, '409 must remain UNCERTAIN because submission may have occurred');
});

test('mutation guard: bounce proves submission while retaining negative delivery evidence', () => {
  assert.match(source, /\['BOUNCED',\s*'MESSAGEBOUNCED'\][\s\S]*?lifecycle:\s*'RECONCILED_ACCEPTED'/);
  assert.match(source, /negativeDeliveryEvidence:\s*true/);
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
