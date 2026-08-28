import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAccountingExportBatch,
  compileAccountingJournalProposal
} from '../src/accounting-ledger-export-contract.mjs';

const base = {
  sourceReceiptRef: 'payment-receipt:cleared:17',
  sourceTruthClass: 'CLEARED_PAYMENT',
  amountCents: 12500,
  currency: 'USD',
  occurredAt: '2026-08-28T15:00:00.000Z',
  compiledAt: '2026-08-28T16:00:00.000Z',
  accountingPolicyRef: 'acct-policy:cash-basis-v1',
  mappingPolicyRef: 'acct-map:service-revenue-v3',
  lines: [
    { accountRef: 'acct:cash-clearing', debitCents: 12500, creditCents: 0, evidenceRef: 'payment-receipt:cleared:17' },
    { accountRef: 'acct:service-revenue', debitCents: 0, creditCents: 12500, evidenceRef: 'payment-receipt:cleared:17' }
  ]
};

test('balanced canonical receipt proposal compiles locally with no authority', () => {
  const result = compileAccountingJournalProposal(base);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ACCOUNTING_JOURNAL_PROPOSAL_PREPARED_LOCAL_ONLY');
  assert.equal(result.proposal.accountingTruthAuthority, 'DERIVATIVE_EXPORT_ONLY');
  assert.equal(result.proposal.externalAccountingWriteAuthority, 'NONE');
  assert.equal(result.proposal.moneyMovementAuthority, 'NONE');
  assert.equal(result.proposal.taxFilingAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  assert.equal(result.externalEffectLedger.spendCents, 0);
});

test('proposal identity is deterministic for identical receipt-bound inputs', () => {
  const a = compileAccountingJournalProposal(base);
  const b = compileAccountingJournalProposal(structuredClone(base));
  assert.equal(a.proposal.proposalId, b.proposal.proposalId);
});

test('unbalanced journal fails closed', () => {
  const result = compileAccountingJournalProposal({
    ...base,
    lines: [
      base.lines[0],
      { ...base.lines[1], creditCents: 12000 }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('journal-entry-unbalanced'));
});

test('balanced journal must still match canonical source amount', () => {
  const result = compileAccountingJournalProposal({
    ...base,
    lines: [
      { ...base.lines[0], debitCents: 12000 },
      { ...base.lines[1], creditCents: 12000 }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('journal-total-must-match-source-amount'));
});

test('a line cannot debit and credit simultaneously or be a zero line', () => {
  for (const line of [
    { accountRef: 'acct:x', debitCents: 10, creditCents: 10 },
    { accountRef: 'acct:x', debitCents: 0, creditCents: 0 }
  ]) {
    const result = compileAccountingJournalProposal({ ...base, lines: [line, base.lines[1]] });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('valid-double-entry-lines-required'));
  }
});

test('raw customer banking free-text and secrets are prohibited', () => {
  for (const patch of [
    { customerEmail: 'a@example.com' },
    { bankAccountNumber: '123' },
    { description: 'raw memo' },
    { apiKey: 'secret' }
  ]) {
    const result = compileAccountingJournalProposal({ ...base, ...patch });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('raw-accounting-pii-bank-secret-or-free-text-prohibited'));
  }
});

test('tax calculation fields are rejected; only an external tax evidence reference may be carried', () => {
  const calculated = compileAccountingJournalProposal({ ...base, taxRateBps: 1400 });
  assert.equal(calculated.ok, false);
  assert.ok(calculated.reasonCodes.includes('tax-calculation-not-authorized-in-accounting-export'));
  const referenced = compileAccountingJournalProposal({ ...base, taxEvidenceRef: 'tax-evidence:external-accountant:17' });
  assert.equal(referenced.ok, true);
  assert.equal(referenced.proposal.taxTruthAuthority, 'REFERENCE_ONLY');
});

test('unsupported truth classes and future-dated source evidence fail closed', () => {
  const fake = compileAccountingJournalProposal({ ...base, sourceTruthClass: 'MODEL_REVENUE_CLAIM' });
  assert.equal(fake.ok, false);
  assert.ok(fake.reasonCodes.includes('unsupported-accounting-source-truth-class'));
  const future = compileAccountingJournalProposal({ ...base, occurredAt: '2026-08-29T16:00:00.000Z' });
  assert.equal(future.ok, false);
  assert.ok(future.reasonCodes.includes('future-dated-accounting-source'));
});

test('exact duplicate source proposals dedupe without double counting', () => {
  const result = compileAccountingExportBatch([base, structuredClone(base)]);
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.totalsByCurrency.USD.debitCents, 12500);
});

test('same canonical source receipt with contradictory proposal fails closed', () => {
  const conflicting = {
    ...base,
    accountingPolicyRef: 'acct-policy:different-v2'
  };
  const result = compileAccountingExportBatch([base, conflicting]);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('conflicting-accounting-proposals-for-source-receipt'));
});

test('batch keeps currencies separate and performs no implicit FX', () => {
  const eur = {
    ...base,
    sourceReceiptRef: 'payment-receipt:cleared:18',
    currency: 'EUR',
    amountCents: 9000,
    lines: [
      { accountRef: 'acct:cash-clearing-eur', debitCents: 9000, creditCents: 0, evidenceRef: 'payment-receipt:cleared:18' },
      { accountRef: 'acct:service-revenue-eur', debitCents: 0, creditCents: 9000, evidenceRef: 'payment-receipt:cleared:18' }
    ]
  };
  const result = compileAccountingExportBatch([base, eur]);
  assert.equal(result.ok, true);
  assert.equal(result.totalsByCurrency.USD.debitCents, 12500);
  assert.equal(result.totalsByCurrency.EUR.debitCents, 9000);
  assert.equal(result.currencyRule, 'CURRENCIES_REMAIN_SEPARATE_NO_IMPLICIT_FX');
});

test('batch is bounded and never upgrades bookkeeping into external authority', () => {
  const result = compileAccountingExportBatch([base]);
  assert.equal(result.externalAccountingWriteAuthority, 'NONE');
  assert.equal(result.moneyMovementAuthority, 'NONE');
  assert.equal(result.taxFilingAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.productionMutations, 0);
  const tooLarge = compileAccountingExportBatch(Array.from({ length: 1001 }, () => base));
  assert.equal(tooLarge.ok, false);
  assert.ok(tooLarge.reasonCodes.includes('accounting-batch-too-large'));
});
