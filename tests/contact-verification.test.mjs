import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERIFICATION_STATES,
  normalizeContactVerification,
  resolveContactVerification,
  evaluateSendEligibilityForRoute
} from '../src/contact-verification.mjs';

const ROUTE = 'buyer@example.com';
const NOW = new Date('2026-08-15T00:00:00.000Z');
const RECENT = '2026-08-14T00:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';

function verification(overrides = {}) {
  return normalizeContactVerification({
    route: ROUTE, state: 'VALID', provider: 'verifier-a',
    evidenceClass: 'LICENSED_PROVIDER', checkedAt: RECENT, confidence: 1, ...overrides
  });
}

test('verification is not binary', () => {
  assert.deepEqual(VERIFICATION_STATES, [
    'VALID', 'INVALID', 'CATCH_ALL', 'RISKY', 'UNKNOWN', 'TEMPORARY_FAILURE', 'SUPPRESSED', 'STALE'
  ]);
});

test('a verifier cannot declare its own verdict permanently authoritative', () => {
  const greedy = verification({ ttlMs: 10 * 365 * 24 * 60 * 60 * 1000 });
  const normal = verification();
  assert.equal(greedy.expiresAt, normal.expiresAt);
});

test('a definite negative ages slower than an affirmative', () => {
  const valid = verification({ state: 'VALID' });
  const invalid = verification({ state: 'INVALID' });
  assert.ok(Date.parse(invalid.expiresAt) > Date.parse(valid.expiresAt));
});

test('a stronger provider outranks a more recent weaker one', () => {
  const resolved = resolveContactVerification({
    verifications: [
      verification({ state: 'CATCH_ALL', evidenceClass: 'THIRD_PARTY_UNVERIFIED', provider: 'weak', checkedAt: RECENT }),
      verification({ state: 'VALID', evidenceClass: 'FIRST_PARTY_DECLARED', provider: 'strong', checkedAt: '2026-08-13T00:00:00.000Z' })
    ],
    now: NOW
  });
  assert.equal(resolved.state, 'VALID');
});

test('a definite negative is not talked out of by a second opinion', () => {
  const resolved = resolveContactVerification({
    verifications: [
      verification({ state: 'INVALID', evidenceClass: 'LICENSED_PROVIDER', provider: 'bouncer' }),
      verification({ state: 'VALID', evidenceClass: 'FIRST_PARTY_DECLARED', provider: 'optimist' })
    ],
    now: NOW
  });
  assert.equal(resolved.state, 'INVALID');
  assert.ok(resolved.reasonCodes.includes('definite-negative-outranks-positive'));
});

test('equal-strength disagreement becomes RISKY with halved confidence, never a silent pick', () => {
  const resolved = resolveContactVerification({
    verifications: [
      verification({ state: 'VALID', provider: 'p1', confidence: 1 }),
      verification({ state: 'CATCH_ALL', provider: 'p2', confidence: 1 })
    ],
    now: NOW
  });
  assert.equal(resolved.state, 'RISKY');
  assert.equal(resolved.disagreement, true);
  assert.equal(resolved.contributing.length, 2);
  assert.ok(resolved.reasonCodes.includes('provider-disagreement-lowers-confidence'));
});

test('every verdict expired means STALE, not the last known answer', () => {
  const resolved = resolveContactVerification({ verifications: [verification({ checkedAt: OLD })], now: NOW });
  assert.equal(resolved.state, 'STALE');
  assert.equal(resolved.stale, true);
});

test('no verification at all means UNKNOWN', () => {
  const resolved = resolveContactVerification({ verifications: [], now: NOW });
  assert.equal(resolved.state, 'UNKNOWN');
  assert.deepEqual(resolved.reasonCodes, ['no-verification-on-record']);
});

// --- the invariant the whole module exists for -----------------------------

test('suppression dominates a fresh VALID verification from the strongest source', () => {
  const decision = evaluateSendEligibilityForRoute({
    route: ROUTE,
    evidenceClass: 'FIRST_PARTY_DECLARED',
    verifications: [verification({ state: 'VALID', evidenceClass: 'VERIFIED_TRANSACTION', confidence: 1, checkedAt: RECENT })],
    suppression: { suppressed: true, reason: 'UNSUBSCRIBED' },
    now: NOW
  });
  assert.equal(decision.eligible, false);
  assert.equal(decision.state, 'SUPPRESSED');
  assert.equal(decision.suppressionReason, 'UNSUBSCRIBED');
  assert.deepEqual(decision.reasonCodes, ['suppression-dominates-all-other-evidence']);
});

test('later enrichment cannot resurrect a contact that unsubscribed', () => {
  // The exact hostile sequence: contact unsubscribes, then a provider returns
  // the same address as VALID with maximum confidence.
  const suppression = { suppressed: true, reason: 'UNSUBSCRIBED' };
  const before = evaluateSendEligibilityForRoute({ route: ROUTE, evidenceClass: 'FIRST_PARTY_PUBLIC', verifications: [], suppression, now: NOW });
  const after = evaluateSendEligibilityForRoute({
    route: ROUTE,
    evidenceClass: 'FIRST_PARTY_PUBLIC',
    verifications: [
      verification({ state: 'VALID', evidenceClass: 'VERIFIED_TRANSACTION', confidence: 1 }),
      verification({ state: 'VALID', evidenceClass: 'FIRST_PARTY_DECLARED', provider: 'another', confidence: 1 })
    ],
    suppression,
    now: NOW
  });
  assert.equal(before.eligible, false);
  assert.equal(after.eligible, false);
  assert.equal(after.state, 'SUPPRESSED');
});

test('a complaint suppresses exactly as hard as an unsubscribe', () => {
  for (const reason of ['COMPLAINED', 'HARD_BOUNCED', 'MANUAL_SUPPRESSION', 'ROUTE_INVALID']) {
    const decision = evaluateSendEligibilityForRoute({
      route: ROUTE, evidenceClass: 'FIRST_PARTY_DECLARED',
      verifications: [verification({ state: 'VALID' })],
      suppression: { suppressed: true, reason }, now: NOW
    });
    assert.equal(decision.eligible, false, `${reason} must suppress`);
  }
});

// --- everything below suppression ------------------------------------------

test('a constructed route is never sendable however well it verifies', () => {
  const decision = evaluateSendEligibilityForRoute({
    route: 'first.last@example.com',
    evidenceClass: 'INFERRED_PATTERN',
    verifications: [normalizeContactVerification({ route: 'first.last@example.com', state: 'VALID', provider: 'p', evidenceClass: 'VERIFIED_TRANSACTION', checkedAt: RECENT, confidence: 1 })],
    now: NOW
  });
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes('constructed-route-never-sendable'));
});

test('a catch-all domain proves nothing about this mailbox', () => {
  const decision = evaluateSendEligibilityForRoute({
    route: ROUTE, evidenceClass: 'FIRST_PARTY_PUBLIC',
    verifications: [verification({ state: 'CATCH_ALL' })], now: NOW
  });
  assert.equal(decision.eligible, false);
  assert.ok(decision.reasonCodes.includes('non-affirmative-verification-state'));
});

test('a stale verdict forces reverification before a consequential send', () => {
  const consequential = evaluateSendEligibilityForRoute({
    route: ROUTE, evidenceClass: 'FIRST_PARTY_PUBLIC',
    verifications: [verification({ checkedAt: OLD })], consequential: true, now: NOW
  });
  assert.equal(consequential.eligible, false);
  assert.ok(consequential.reasonCodes.includes('reverification-required-before-consequential-send'));
});

test('an affirmative, fresh, well-sourced route is eligible, so the gate is not always-closed', () => {
  const decision = evaluateSendEligibilityForRoute({
    route: ROUTE, evidenceClass: 'FIRST_PARTY_PUBLIC',
    verifications: [verification({ state: 'VALID' })],
    suppression: { suppressed: false }, now: NOW
  });
  assert.equal(decision.eligible, true);
  assert.equal(decision.state, 'VALID');
});

test('a malformed verification is refused rather than defaulted', () => {
  assert.ok(normalizeContactVerification({ route: ROUTE, state: 'DEFINITELY_FINE', provider: 'p', checkedAt: RECENT }).reasonCodes.includes('known-verification-state-required'));
  assert.ok(normalizeContactVerification({ route: '', state: 'VALID', provider: 'p', checkedAt: RECENT }).reasonCodes.includes('contact-route-required'));
  assert.ok(normalizeContactVerification({ route: ROUTE, state: 'VALID', provider: '', checkedAt: RECENT }).reasonCodes.includes('verification-provider-required'));
  assert.ok(normalizeContactVerification({ route: ROUTE, state: 'VALID', provider: 'p', checkedAt: 'not-a-date' }).reasonCodes.includes('verification-checked-at-required'));
});

test('a TEMPORARY_FAILURE is not an invalid address', () => {
  const fresh = verification({ state: 'TEMPORARY_FAILURE', checkedAt: '2026-08-14T23:00:00.000Z' });
  const resolved = resolveContactVerification({ verifications: [fresh], now: NOW });
  assert.equal(resolved.state, 'TEMPORARY_FAILURE');
  assert.notEqual(resolved.state, 'INVALID');
});

test('a TEMPORARY_FAILURE verdict is worth less than a day', () => {
  // A greylist answer describes one moment. Twenty-four hours later it
  // describes nothing, so it ages out rather than standing in for a verdict.
  const dayOld = verification({ state: 'TEMPORARY_FAILURE', checkedAt: '2026-08-14T00:00:00.000Z' });
  assert.equal(resolveContactVerification({ verifications: [dayOld], now: NOW }).state, 'STALE');
  const valid = verification({ state: 'VALID', checkedAt: '2026-08-14T00:00:00.000Z' });
  assert.equal(resolveContactVerification({ verifications: [valid], now: NOW }).state, 'VALID');
});
