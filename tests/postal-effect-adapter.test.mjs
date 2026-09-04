import test from 'node:test';
import assert from 'node:assert/strict';
import { PostalEffectAdapter, postalProviderEffectIdentity, postalEffectTag } from '../src/omnia-v9/integrations/providers/postal-effect-adapter.mjs';

const fixedNow = () => new Date('2026-09-01T20:00:00.000Z');
function adapter(overrides = {}) {
  return new PostalEffectAdapter({
    baseUrl: 'https://postal.example.test', apiKey: 'test-secret', fromAddress: 'outreach@example.test', messageIdDomain: 'example.test', now: fixedNow,
    fetchImpl: async () => ({ status: 200, json: async () => ({ status: 'success', data: { message_id: 'postal-generated@rp.example.test', messages: { 'buyer@example.com': { id: 37171, token: 'secret-token' } } } }) }),
    ...overrides
  });
}
function intent() {
  const executionId = 'exec_123';
  return { businessKey: 'lead_1', executionId, providerEffectIdentity: postalProviderEffectIdentity(executionId, 'example.test'), effectPayload: { to: 'buyer@example.com', subject: 'Evidence sprint', body: 'Short evidence-bound note.' } };
}

test('prepare creates deterministic Message-ID/tag and rejects sender drift', async () => {
  const a = adapter();
  const prepared = await a.prepare(intent());
  assert.equal(prepared.tag, postalEffectTag('exec_123'));
  assert.match(prepared.messageId, /^<v9-[a-f0-9]{64}@example\.test>$/);
  await assert.rejects(() => a.prepare({ ...intent(), effectPayload: { ...intent().effectPayload, from: 'other@example.test' } }), /approved sender/);
});

test('dispatch performs exactly one Postal HTTP call and accepts only witnessed identifiers', async () => {
  const calls = [];
  const a = adapter({ fetchImpl: async (...args) => { calls.push(args); return { status: 200, json: async () => ({ status: 'success', data: { message_id: 'postal@rp.example.test', messages: { 'buyer@example.com': { id: 12, token: 'do-not-leak' } } } }) }; } });
  const result = await a.dispatch(await a.prepare(intent()));
  assert.equal(calls.length, 1);
  assert.equal(a.dispatchCallCount, 1);
  assert.equal(result.classification, 'ACCEPTED');
  assert.equal(result.providerReferenceId, '12');
  assert.equal(JSON.stringify(result).includes('do-not-leak'), false);
  const request = JSON.parse(calls[0][1].body);
  assert.equal(request.tag, postalEffectTag('exec_123'));
  assert.equal(request.headers['Message-ID'], postalProviderEffectIdentity('exec_123', 'example.test'));
});

test('network, 429, and 5xx outcomes are uncertain and never retried', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('timeout'); },
    async () => ({ status: 429, json: async () => ({ status: 'error' }) }),
    async () => ({ status: 503, json: async () => ({ status: 'error' }) })
  ]) {
    let calls = 0;
    const a = adapter({ fetchImpl: async (...args) => { calls += 1; return fetchImpl(...args); } });
    const result = await a.dispatch(await a.prepare(intent()));
    assert.equal(result.classification, 'UNCERTAIN');
    assert.equal(calls, 1);
  }
});

test('definite Postal rejection is REJECTED, malformed success stays UNCERTAIN', async () => {
  const rejected = adapter({ fetchImpl: async () => ({ status: 422, json: async () => ({ status: 'error', data: { code: 'ValidationError' } }) }) });
  assert.equal((await rejected.dispatch(await rejected.prepare(intent()))).classification, 'REJECTED');
  const malformed = adapter({ fetchImpl: async () => ({ status: 200, json: async () => ({ status: 'success', data: {} }) }) });
  assert.equal((await malformed.dispatch(await malformed.prepare(intent()))).classification, 'UNCERTAIN');
});

test('reconcile fails closed when webhook ledger is absent or empty', async () => {
  const prepared = await adapter().prepare(intent());
  const noLedger = await adapter().reconcile({ businessKey: 'lead_1', providerEffectIdentity: prepared.providerEffectIdentity, executionId: 'exec_123', expectedTo: prepared.to });
  assert.equal(noLedger.lifecycle, 'UNCERTAIN');
  const empty = await adapter({ reconciliationLookupFn: async () => [] }).reconcile({ businessKey: 'lead_1', providerEffectIdentity: prepared.providerEffectIdentity, executionId: 'exec_123' });
  assert.equal(empty.lifecycle, 'UNCERTAIN');
});

test('reconcile uses independent webhook evidence and rejects ambiguity/mismatch', async () => {
  const prepared = await adapter().prepare(intent());
  // Provenance is part of the row now. A correctly shaped row from an unknown
  // source used to reconcile as accepted, which made the reconciliation ledger
  // trusted by shape rather than by who wrote it.
  const base = { id: 12, tag: prepared.tag, to: prepared.to, from: prepared.from, subject: prepared.subject, lifecycle: 'SENT', provenance: 'AUTHENTICATED_POSTAL_WEBHOOK' };
  const accepted = await adapter({ reconciliationLookupFn: async () => [base] }).reconcile({ businessKey: 'lead_1', providerEffectIdentity: prepared.providerEffectIdentity, executionId: 'exec_123', expectedTo: prepared.to, expectedFrom: prepared.from });
  assert.equal(accepted.lifecycle, 'RECONCILED_ACCEPTED');
  assert.equal(adapter().classifyOutcome(accepted), 'RECONCILED_ACCEPTED');
  const many = await adapter({ reconciliationLookupFn: async () => [base, base] }).reconcile({ businessKey: 'lead_1', providerEffectIdentity: prepared.providerEffectIdentity, executionId: 'exec_123' });
  assert.equal(many.lifecycle, 'AMBIGUOUS');
  const wrongRecipient = await adapter({ reconciliationLookupFn: async () => [{ ...base, to: 'wrong@example.com' }] }).reconcile({ businessKey: 'lead_1', providerEffectIdentity: prepared.providerEffectIdentity, executionId: 'exec_123', expectedTo: prepared.to });
  assert.equal(wrongRecipient.lifecycle, 'AMBIGUOUS');
});

test('adapter refuses unsafe base URL, missing secret, and payload expansion', async () => {
  assert.throws(() => new PostalEffectAdapter({ baseUrl: 'http://postal.example.test', apiKey: 'x', fromAddress: 'a@example.test', messageIdDomain: 'example.test' }), /HTTPS/);
  assert.throws(() => new PostalEffectAdapter({ baseUrl: 'https://postal.example.test', apiKey: '', fromAddress: 'a@example.test', messageIdDomain: 'example.test' }), /apiKey/);
  await assert.rejects(() => adapter().prepare({ ...intent(), effectPayload: { ...intent().effectPayload, bcc: 'x@example.com' } }), /not supported/);
});

test('a reconciliation row that cannot say where it came from is ambiguous, not accepted', async () => {
  const prepared = await adapter().prepare(intent());
  const authentic = { id: 12, tag: prepared.tag, to: prepared.to, from: prepared.from, subject: prepared.subject, lifecycle: 'SENT', provenance: 'AUTHENTICATED_POSTAL_WEBHOOK' };
  const { provenance, ...unsourced } = authentic;
  void provenance;

  for (const row of [unsourced, { ...authentic, provenance: 'OPERATOR_ASSERTED' }, { ...authentic, provenance: '' }]) {
    const result = await adapter({ reconciliationLookupFn: async () => [row] }).reconcile({
      businessKey: 'lead_1',
      providerEffectIdentity: prepared.providerEffectIdentity,
      executionId: 'exec_123',
      expectedTo: prepared.to
    });
    assert.equal(result.lifecycle, 'AMBIGUOUS',
      `a row with provenance ${JSON.stringify(row.provenance)} reconciled as if Postal had witnessed it`);
  }
});

test('reconcile works at the arity the recovery worker actually calls it with', async () => {
  // external-effect-recovery.mjs calls reconcile({ businessKey,
  // providerEffectIdentity, expectedTo }) with no executionId. Throwing here
  // does not fail one execution -- it aborts the whole recovery batch.
  const prepared = await adapter().prepare(intent());
  const row = { id: 12, tag: prepared.tag, to: prepared.to, from: prepared.from, subject: prepared.subject, lifecycle: 'SENT', provenance: 'AUTHENTICATED_POSTAL_WEBHOOK' };
  const result = await adapter({ reconciliationLookupFn: async () => [row] }).reconcile({
    businessKey: 'lead_1',
    providerEffectIdentity: prepared.providerEffectIdentity,
    expectedTo: prepared.to
  });
  assert.equal(result.lifecycle, 'RECONCILED_ACCEPTED');
});

test('a conflict is uncertain, because a conflict does not prove the message was refused', async () => {
  const conflicted = adapter({ fetchImpl: async () => ({ status: 409, json: async () => ({ status: 'error' }) }) });
  const result = await conflicted.dispatch(await conflicted.prepare(intent()));
  assert.equal(result.classification, 'UNCERTAIN');
  assert.equal(conflicted.dispatchCallCount, 1);
});

test('a bounce proves the send happened and is recorded as negative delivery, never as non-submission', async () => {
  const prepared = await adapter().prepare(intent());
  const bounced = { id: 12, tag: prepared.tag, to: prepared.to, from: prepared.from, subject: prepared.subject, lifecycle: 'BOUNCED', provenance: 'AUTHENTICATED_POSTAL_WEBHOOK' };
  const result = await adapter({ reconciliationLookupFn: async () => [bounced] }).reconcile({
    businessKey: 'lead_1',
    providerEffectIdentity: prepared.providerEffectIdentity,
    executionId: 'exec_123',
    expectedTo: prepared.to
  });
  assert.notEqual(result.lifecycle, 'NOT_FOUND',
    'NOT_FOUND releases the business key for a resend; a bounce is the opposite of evidence for that');
  assert.equal(result.detail.negativeDeliveryEvidence, true);
});
