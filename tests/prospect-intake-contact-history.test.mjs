import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProspectVerification, PROSPECT_STATUSES } from '../src/prospect-verification-intake.mjs';
import { compileContactHistory, signContactHistoryReceipt } from '../src/prospect-contact-history.mjs';

const now = new Date('2026-10-05T12:00:00.000Z');
const EMAIL = 'hello@agency.example';
const ok = rows => ({ ok: true, rows });
const clean = () => ({ suppressions: ok([]), prospects: ok([]), outboundReservations: ok([]), outboundEvents: ok([]), replies: ok([]), messages: ok([]), providerEvents: ok([]) });
const receiptFor = (reads = clean(), at = now) => compileContactHistory({ email: EMAIL, reads, now: at });
const base = (patch = {}) => ({
  company: 'Example Home Marketing', website: 'https://agency.example/', hqCountry: 'US',
  currentOwnership: { status: 'INDEPENDENT', evidenceUrl: 'https://agency.example/about' },
  evidenceClass: 'PAGE_FETCH_VERIFIED',
  offerRoute: { offerId: 'AGENCY_REVENUE_LEAK_PROOF_PACK', rationale: 'Agency serves home-service clients and needs client lead-path evidence.' },
  recipient: { email: EMAIL, publishedRole: 'GENERAL_BUSINESS_INQUIRIES', sourceUrl: 'https://agency.example/contact', sourcePageExact: true, excerpt: `General inquiries: ${EMAIL}`, observedAt: '2026-10-04T12:00:00.000Z' },
  notices: { noSolicitationChecked: true, noSolicitationFound: false, noHarvestChecked: true, noHarvestFound: false },
  offerFit: { servesHomeServiceClients: true, evidenceUrl: 'https://agency.example/hvac-marketing' },
  clientEvidence: { clientName: 'Example HVAC', clientSiteUrl: 'https://example-hvac.example/', observation: { verifiable: true, text: 'Contact form returns a blank page after submit', sourceUrl: 'https://example-hvac.example/contact', excerpt: 'blank page after submit', observedAt: '2026-10-04T13:00:00.000Z' } },
  ...patch
});
const run = (record, trust = { inProcess: true }) => compileProspectVerification(record, { now, contactHistoryTrust: trust });
const reasons = r => [...r.rejectionReasons, ...r.missingEvidence].join(' | ');

test('a fresh in-process CLEAN receipt verifies the candidate and carries RUNTIME_RECEIPT provenance and its digest', () => {
  const receipt = receiptFor();
  const r = run(base({ contactHistoryReceipt: receipt }));
  assert.equal(r.status, PROSPECT_STATUSES.VERIFIED_CANDIDATE, reasons(r));
  assert.equal(r.contactHistoryProvenance, 'RUNTIME_RECEIPT');
  assert.equal(r.contactHistoryReceiptDigest, receipt.receiptDigest);
  assert.equal(r.sendAuthority, false);
});

test('a HIT receipt rejects with the exact deterministic reason and the receipt reason codes, and cannot be overridden by a clean manual flag', () => {
  const reads = clean();
  reads.suppressions = ok([{ value: EMAIL, reason: 'manual' }]);
  const r = run(base({
    contactHistoryReceipt: receiptFor(reads),
    contactHistory: { repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: true, hit: false }
  }));
  assert.equal(r.status, PROSPECT_STATUSES.REJECTED);
  assert.ok(r.rejectionReasons.includes('prior-contact-or-suppression-runtime-ledger-hit'));
  assert.ok(r.rejectionReasons.some(x => x.startsWith('contact-history-hit:suppressions')));
});

test('CHECK_FAILED, wrong-recipient, wrong-domain, stale and future receipts are INCOMPLETE, never clean', () => {
  const failed = receiptFor({});
  assert.equal(run(base({ contactHistoryReceipt: failed })).status, PROSPECT_STATUSES.INCOMPLETE);
  const other = compileContactHistory({ email: 'other@agency.example', reads: clean(), now });
  assert.ok(reasons(run(base({ contactHistoryReceipt: other }))).includes('contact-history-receipt-email-mismatch'));
  const stale = receiptFor(clean(), new Date('2026-10-05T10:00:00.000Z'));
  assert.ok(reasons(run(base({ contactHistoryReceipt: stale }))).includes('stale-or-future'));
  const future = receiptFor(clean(), new Date('2026-10-05T14:00:00.000Z'));
  assert.ok(reasons(run(base({ contactHistoryReceipt: future }))).includes('stale-or-future'));
});

test('a mutated receipt (clean flipped, hit erased) fails the digest and is INCOMPLETE', () => {
  const reads = clean();
  reads.replies = ok([{ id: 'r', from: EMAIL, classification: { label: 'negative' } }]);
  const hit = receiptFor(reads);
  const forged = { ...hit, status: 'CLEAN', overallContactHistoryHit: false, findings: [], reasonCodes: [] };
  const r = run(base({ contactHistoryReceipt: forged }));
  assert.equal(r.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.ok(reasons(r).includes('digest-mismatch'));
});

test('a receipt with no declared trust is not accepted; a boundary-crossing receipt needs a valid HMAC', () => {
  const receipt = receiptFor();
  const none = compileProspectVerification(base({ contactHistoryReceipt: receipt }), { now });
  assert.equal(none.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.ok(none.missingEvidence.includes('contact-history-receipt-authenticity-unverified'));
  const secret = 'd'.repeat(64);
  assert.equal(run(base({ contactHistoryReceipt: signContactHistoryReceipt(receipt, secret) }), { secret }).status, PROSPECT_STATUSES.VERIFIED_CANDIDATE);
  assert.equal(run(base({ contactHistoryReceipt: receipt }), { secret }).status, PROSPECT_STATUSES.INCOMPLETE, 'unsigned receipt with a secret required');
  assert.equal(run(base({ contactHistoryReceipt: signContactHistoryReceipt(receipt, 'e'.repeat(64)) }), { secret }).status, PROSPECT_STATUSES.INCOMPLETE, 'signed with the wrong secret');
});

test('the legacy hand-set flags are only a MANUAL_ATTESTATION and never RUNTIME_RECEIPT', () => {
  const r = run(base({ contactHistory: { repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: true, hit: false } }));
  assert.equal(r.status, PROSPECT_STATUSES.VERIFIED_CANDIDATE);
  assert.equal(r.contactHistoryProvenance, 'MANUAL_ATTESTATION');
  assert.equal(r.contactHistoryReceiptDigest, null);
  const none = run(base());
  assert.equal(none.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.equal(none.contactHistoryProvenance, 'NONE');
});

test('a receipt for another recipient cannot be reused for this candidate even if it is CLEAN and signed', () => {
  const secret = 'f'.repeat(64);
  const receipt = signContactHistoryReceipt(compileContactHistory({ email: 'someone@elsewhere.example', reads: clean(), now }), secret);
  const r = run(base({ contactHistoryReceipt: receipt }), { secret });
  assert.equal(r.status, PROSPECT_STATUSES.INCOMPLETE);
});
