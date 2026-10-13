import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeConfig } from '../src/db-compat/runtime-config.mjs';
import { parseRawEmail } from '../src/uberimap.mjs';
import {
  deriveRevenueTruthLedger,
  REVENUE_TRUTH_STATES as STATES
} from '../src/revenue-truth-ledger.mjs';

// Regression tests for the HIGH findings from the independent Mission C review. Each one reproduces the reviewer's
// case. All data is synthetic (example.invalid), with no network and no credentials.

const ALLOWLIST = ['db.example.invalid:5432/uberbond_prod'];
const PRODUCTION_ENV = (databaseUrl) => ({
  DATABASE_URL: databaseUrl,
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
  UNSUBSCRIBE_SECRET: 'u'.repeat(40)
});

test('a database URL cannot redirect the connection through query parameters', () => {
  const hijacked = validateRuntimeConfig(
    PRODUCTION_ENV('postgresql://app:pw@db.example.invalid:5432/uberbond_prod?host=evil.example.invalid'),
    { mode: 'production', databaseAllowlist: ALLOWLIST }
  );
  assert.equal(hijacked.ok, false);
  assert.ok(hijacked.reasonCodes.includes('DATABASE_URL_PARAMETER_NOT_ALLOWED'));

  const hostaddr = validateRuntimeConfig(
    PRODUCTION_ENV('postgresql://app:pw@db.example.invalid:5432/uberbond_prod?hostaddr=203.0.113.9'),
    { mode: 'production', databaseAllowlist: ALLOWLIST }
  );
  assert.ok(hostaddr.reasonCodes.includes('DATABASE_URL_PARAMETER_NOT_ALLOWED'));
});

test('harmless connection parameters such as sslmode remain accepted', () => {
  const result = validateRuntimeConfig(
    PRODUCTION_ENV('postgresql://app:pw@db.example.invalid:5432/uberbond_prod?sslmode=require'),
    { mode: 'production', databaseAllowlist: ALLOWLIST }
  );
  assert.equal(result.reasonCodes.includes('DATABASE_URL_PARAMETER_NOT_ALLOWED'), false);
});

test('an ARF complaint exposes its report type, unsubscribe header and embedded original Message-ID', () => {
  const raw = [
    'From: mailer-daemon@unvetted.example.invalid',
    'To: ops@ops.example.invalid',
    'Subject: Feedback report',
    'Message-ID: <fbl-1@unvetted.example.invalid>',
    'Content-Type: multipart/report; report-type=feedback-report; boundary="b1"',
    'List-Unsubscribe: <mailto:unsub@unvetted.example.invalid>',
    '',
    '--b1',
    'Content-Type: text/plain',
    '',
    'A recipient marked this as spam.',
    '--b1',
    'Content-Type: message/rfc822',
    '',
    'Message-ID: <original-1@sent.example.invalid>',
    'Subject: Original',
    '',
    '--b1--',
    ''
  ].join('\r\n');
  const parsed = parseRawEmail(raw);
  assert.equal(parsed.reportType, 'feedback-report');
  assert.equal(parsed.contentType, 'multipart/report');
  assert.ok(parsed.listUnsubscribe.includes('unsub@unvetted.example.invalid'));
  assert.deepEqual(parsed.embeddedMessageIds, ['<original-1@sent.example.invalid>']);
});

test('cash cannot clear through a settlement the ledger itself refuses', () => {
  const T1 = '2026-10-11T00:00:00.000Z';
  const T2 = '2026-10-12T00:00:00.000Z';
  const receipt = (type, fields = {}, observedAt = T1) => ({
    type,
    provenance: { kind: 'REAL', source: 'fixture.example.invalid', digest: 'digest-fixture-0001', observedAt },
    ...fields
  });
  const target = { commitSha: 'a'.repeat(40), offerDigest: 'offer-digest-fixture-0001' };
  const cashState = receipts => deriveRevenueTruthLedger({ receipts, target }).claims.find(c => c.claim === 'cash-cleared').state;

  // Control: a settlement that follows its initiation, with matching cleared funds, is REAL.
  assert.equal(cashState([
    receipt('payment-initiated', {}, T1),
    receipt('payment-settled', { providerReceiptId: 'pay_good_0002' }, T2),
    receipt('cleared-funds', { cleared: true, providerReceiptId: 'pay_good_0002' }, T2)
  ]), STATES.REAL);

  // The settlement precedes every initiation, so the payment-settled rule refuses it. Cash must not clear through it.
  assert.notEqual(cashState([
    receipt('payment-initiated', {}, T2),
    receipt('payment-settled', { providerReceiptId: 'pay_bad_0001' }, T1),
    receipt('cleared-funds', { cleared: true, providerReceiptId: 'pay_bad_0001' }, T1)
  ]), STATES.REAL);
});
