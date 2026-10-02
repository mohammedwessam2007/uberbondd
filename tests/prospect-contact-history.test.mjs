import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileContactHistory, checkContactHistory, contactHistoryReceiptUsable, signContactHistoryReceipt,
  verifyContactHistorySignature, suppressionMatches, REQUIRED_COLLECTIONS, RESULT_STATUS
} from '../src/prospect-contact-history.mjs';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const EMAIL = 'hello@agency.example';
const ok = rows => ({ ok: true, rows });
const cleanReads = () => ({
  suppressions: ok([]), prospects: ok([]), outboundReservations: ok([]), outboundEvents: ok([]), replies: ok([]),
  messages: ok([]), providerEvents: ok([])
});
const run = (reads, extra = {}) => compileContactHistory({ email: EMAIL, reads, now: NOW, ...extra });

test('every required collection read and empty is CLEAN, with zero authority and zero effects', () => {
  const r = run(cleanReads());
  assert.equal(r.status, RESULT_STATUS.CLEAN);
  assert.equal(r.overallContactHistoryHit, false);
  assert.equal(r.sendAuthority, false);
  assert.equal(r.externalEffects, 0);
  assert.equal(r.readOnly, true);
  for (const name of REQUIRED_COLLECTIONS) assert.equal(r.checks[name].read, true);
});

test('a missing, failed or non-list read of ANY required collection is CHECK_FAILED, never CLEAN', () => {
  for (const name of REQUIRED_COLLECTIONS) {
    for (const bad of [undefined, null, { ok: false, error: 'timeout' }, { ok: true, rows: 'not-a-list' }, { ok: true }]) {
      const reads = cleanReads();
      if (bad === undefined) delete reads[name]; else reads[name] = bad;
      const r = run(reads);
      assert.equal(r.status, RESULT_STATUS.CHECK_FAILED, `${name}:${JSON.stringify(bad)}`);
      assert.equal(r.overallContactHistoryHit, null);
      assert.ok(r.reasonCodes.includes(`required-collection-unreadable:${name}`));
    }
  }
});

test('an empty aggregate-style payload is not exact absence', () => {
  const r = run({ aggregate: { prospectRecords: 0, suppressionRecords: 0 } });
  assert.equal(r.status, RESULT_STATUS.CHECK_FAILED);
});

test('suppressed exact email, suppressed domain, and @domain suffix suppression all hit', () => {
  for (const value of [EMAIL, 'agency.example', '@agency.example']) {
    const reads = cleanReads();
    reads.suppressions = ok([{ id: 's1', value, reason: 'manual' }]);
    const r = run(reads);
    assert.equal(r.status, RESULT_STATUS.HIT, value);
    assert.equal(r.overallContactHistoryHit, true);
    assert.ok(r.reasonCodes.some(c => c.startsWith('contact-history-hit:suppressions')));
  }
  assert.equal(suppressionMatches({ value: 'other.example' }, EMAIL, 'agency.example'), false);
});

test('a suppression of an unrelated recipient does not hit', () => {
  const reads = cleanReads();
  reads.suppressions = ok([{ value: 'someone@else.example' }, { value: 'else.example' }]);
  assert.equal(run(reads).status, RESULT_STATUS.CLEAN);
});

test('prior outbound reservation (any state) for the exact email hits; open/uncertain states block', () => {
  for (const status of ['reserved', 'dispatching', 'sent', 'uncertain']) {
    const reads = cleanReads();
    reads.outboundReservations = ok([{ id: 'r1', recipientEmail: EMAIL.toUpperCase(), status }]);
    assert.equal(run(reads).status, RESULT_STATUS.HIT, status);
  }
  const reads = cleanReads();
  reads.outboundReservations = ok([{ id: 'r2', recipientEmail: EMAIL, status: 'cancelled' }]);
  const r = run(reads);
  assert.equal(r.status, RESULT_STATUS.CLEAN, 'cancelled reservation is shown as informational history');
  assert.equal(r.findings[0].severity, 'INFORMATIONAL');
});

test('prior outbound events (bounce, complaint, sent) for the email or domain hit', () => {
  for (const eventType of ['hard_bounce', 'complaint', 'send_uncertain', 'sent']) {
    const reads = cleanReads();
    reads.outboundEvents = ok([{ id: 'e', recipientEmail: 'someone.else@agency.example', eventType }]);
    assert.equal(run(reads).status, RESULT_STATUS.HIT, eventType);
  }
});

test('a prior reply from the address, or linked through its prospect, hits', () => {
  let reads = cleanReads();
  reads.replies = ok([{ id: 'p', from: 'Pat <HELLO@agency.example>', classification: { label: 'negative' } }]);
  assert.equal(run(reads).status, RESULT_STATUS.HIT);
  reads = cleanReads();
  reads.prospects = ok([{ id: 'prospect_1', contact: { email: EMAIL }, status: 'ready' }]);
  reads.replies = ok([{ id: 'p2', prospectId: 'prospect_1', from: 'no-address-here', classification: { label: 'positive' } }]);
  assert.equal(run(reads).status, RESULT_STATUS.HIT);
});

test('a prospect record: benign statuses are informational, contacted/unknown statuses block', () => {
  for (const status of ['ready', 'research-complete', 'rejected', 'new']) {
    const reads = cleanReads();
    reads.prospects = ok([{ id: 'p', contact: { email: EMAIL }, status }]);
    const r = run(reads);
    assert.equal(r.status, RESULT_STATUS.CLEAN, status);
    assert.ok(r.findings.some(f => f.collection === 'prospects' && f.severity === 'INFORMATIONAL'));
  }
  for (const status of ['sent', 'replied', 'send-uncertain', 'suppressed', 'bounce', 'complaint', 'brand-new-unrecognised-state']) {
    const reads = cleanReads();
    reads.prospects = ok([{ id: 'p', contact: { email: EMAIL }, status }]);
    assert.equal(run(reads).status, RESULT_STATUS.HIT, status);
  }
});

test('same-domain prior contact with a different person still blocks', () => {
  const reads = cleanReads();
  reads.prospects = ok([{ id: 'p', website: 'https://www.agency.example/about', contact: { email: 'owner@agency.example' }, status: 'sent' }]);
  const r = run(reads);
  assert.equal(r.status, RESULT_STATUS.HIT);
  assert.ok(r.findings.some(f => f.match === 'SAME_DOMAIN'));
});

test('supplementary reads (messages, provider events) can add a hit but never rescue a failed required read', () => {
  const reads = cleanReads();
  reads.prospects = ok([{ id: 'p1', contact: { email: EMAIL }, status: 'ready' }]);
  reads.messages = ok([{ id: 'm1', prospectId: 'p1', kind: 'initial' }]);
  assert.equal(run(reads).status, RESULT_STATUS.HIT);
  const reads2 = cleanReads();
  reads2.suppressions = { ok: false, error: 'db down' };
  reads2.providerEvents = ok([]);
  assert.equal(run(reads2).status, RESULT_STATUS.CHECK_FAILED);
});

test('a confirmed hit is reported as a hit even when another collection failed to read', () => {
  const reads = cleanReads();
  reads.suppressions = ok([{ value: EMAIL }]);
  reads.replies = { ok: false, error: 'timeout' };
  assert.equal(run(reads).status, RESULT_STATUS.HIT);
});

test('invalid, mismatched, or non-exact inputs are CHECK_FAILED', () => {
  assert.equal(compileContactHistory({ email: '', reads: cleanReads(), now: NOW }).status, RESULT_STATUS.CHECK_FAILED);
  assert.equal(compileContactHistory({ email: 'not-an-email', reads: cleanReads(), now: NOW }).status, RESULT_STATUS.CHECK_FAILED);
  assert.equal(compileContactHistory({ email: EMAIL, domain: 'other.example', reads: cleanReads(), now: NOW }).status, RESULT_STATUS.CHECK_FAILED);
  const padded = compileContactHistory({ email: ` ${EMAIL.toUpperCase()} `, reads: cleanReads(), now: NOW });
  assert.equal(padded.emailChecked, EMAIL, 'surrounding whitespace and case are normalised, the checked value is canonical');
  assert.equal(compileContactHistory({ email: 'a@b.example, c@d.example', reads: cleanReads(), now: NOW }).status, RESULT_STATUS.CHECK_FAILED);
});

test('output is minimal: no bodies, no secrets, no unrelated rows', () => {
  const reads = cleanReads();
  reads.replies = ok([
    { id: 'p', from: EMAIL, body: 'SECRET BODY TEXT', classification: { label: 'negative' } },
    { id: 'q', from: 'stranger@unrelated.example', body: 'UNRELATED' }
  ]);
  const text = JSON.stringify(run(reads));
  assert.ok(!text.includes('SECRET BODY TEXT'));
  assert.ok(!text.includes('UNRELATED'));
  assert.ok(!text.includes('stranger@unrelated.example'));
});

test('checkContactHistory only calls store.list, captures failures as unread, and never writes', async () => {
  const calls = [];
  const store = {
    async list(name) { calls.push(name); if (name === 'replies') throw Object.assign(new Error('boom'), { code: 'ETIMEDOUT' }); return []; },
    add() { throw new Error('write attempted'); }, patch() { throw new Error('write attempted'); },
    update() { throw new Error('write attempted'); }, remove() { throw new Error('write attempted'); }
  };
  const r = await checkContactHistory({ store, email: EMAIL, now: NOW });
  assert.equal(r.status, RESULT_STATUS.CHECK_FAILED);
  assert.ok(calls.length >= REQUIRED_COLLECTIONS.length);
  assert.equal((await checkContactHistory({ store: null, email: EMAIL, now: NOW })).status, RESULT_STATUS.CHECK_FAILED);
});

test('receipt usability: exact recipient, fresh, unmutated; stale/mismatched/mutated/unsigned-forgery fail', () => {
  const receipt = run(cleanReads());
  const use = (r, extra = {}) => contactHistoryReceiptUsable(r, { email: EMAIL, domain: 'agency.example', now: NOW, ...extra });
  assert.equal(use(receipt).usable, true);
  assert.ok(use(receipt, { email: 'other@agency.example' }).reasons.includes('contact-history-receipt-email-mismatch'));
  assert.ok(use(receipt, { domain: 'other.example' }).reasons.includes('contact-history-receipt-domain-mismatch'));
  assert.ok(use(receipt, { now: new Date('2026-10-02T13:00:00Z') }).reasons.includes('contact-history-receipt-stale-or-future'));
  assert.ok(use(receipt, { now: new Date('2026-10-02T11:00:00Z') }).reasons.includes('contact-history-receipt-stale-or-future'));
  const mutated = { ...receipt, overallContactHistoryHit: true };
  assert.ok(use(mutated).reasons.includes('contact-history-receipt-digest-mismatch'));
  const failed = run({});
  assert.equal(use(failed).usable, false);
  assert.equal(use(null).usable, false);
  assert.equal(use({ ...receipt, schema: 'x' }).usable, false);
  assert.ok(use({ ...receipt, readOnly: false }).reasons.includes('contact-history-receipt-not-read-only'));
});

test('HMAC signature binds the digest: forged or re-signed-with-wrong-secret receipts do not verify', () => {
  const secret = 'a'.repeat(64);
  const receipt = run(cleanReads());
  const signed = signContactHistoryReceipt(receipt, secret);
  assert.equal(verifyContactHistorySignature(signed, secret), true);
  assert.equal(verifyContactHistorySignature(signed, 'b'.repeat(64)), false);
  assert.equal(verifyContactHistorySignature(receipt, secret), false);
  assert.equal(verifyContactHistorySignature({ ...signed, receiptDigest: 'f'.repeat(64) }, secret), false);
  assert.throws(() => signContactHistoryReceipt(receipt, 'short'));
  // A signed receipt still passes the usability check (signature is metadata).
  assert.equal(contactHistoryReceiptUsable(signed, { email: EMAIL, domain: 'agency.example', now: NOW }).usable, true);
});
