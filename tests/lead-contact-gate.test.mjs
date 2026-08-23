// Issue #99: with requireContact=true, the scorer hard-blocked only on a
// missing email string. A route explicitly marked invalid scored zero for
// contact and then cleared minScore on fit, evidence and intent alone -- so
// qualification advertised a known-bad address as handoff-ready.
//
// Scoring a route zero is not the same as blocking on it. The gate now names
// the route state, and the states come from the same vocabulary the evidence
// layer uses.
//
// Passing this gate is not send authority. Suppression, the deliverability
// guard and the V9 consequence gates remain the final word; this is
// qualification truth only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreLeadCandidate } from '../src/lead-generation.mjs';

const NOW = new Date('2026-08-23T00:00:00Z');

function candidate({ verified, email = 'buyer@acme.example' } = {}) {
  return {
    id: 'cand_1',
    name: 'Acme Clinic',
    domain: 'acme.example',
    industry: 'healthcare',
    employeeCount: 40,
    country: 'US',
    contact: email ? { email, verified } : {},
    evidence: [{ sourceType: 'company_website', observedAt: '2026-08-20T00:00:00Z', confidence: 0.9 }]
  };
}

// Deliberately permissive: a high-fit, high-intent candidate that clears the
// numeric threshold easily, so the only thing that can stop it is the gate.
const QUERY = Object.freeze({
  requireContact: true, requireEvidence: false,
  minScore: 1, minEvidenceScore: 0, minIntentScore: 0, freshWithinDays: 3650
});
const SIGNALS = [{ type: 'first_party_inquiry', observedAt: '2026-08-22T00:00:00Z', confidence: 1, sourceType: 'first_party' }];

function score(verified, overrides = {}) {
  return scoreLeadCandidate({
    candidate: candidate({ verified, ...overrides }),
    query: QUERY, signals: SIGNALS, suppressions: [], now: NOW
  });
}

test('a route known to be undeliverable is blocked however good the numeric score is', () => {
  for (const state of ['invalid', 'undeliverable', 'bounced', 'INVALID', 'Bounced']) {
    const result = score(state);
    assert.equal(result.eligible, false, `${state} was eligible`);
    assert.ok(result.blocks.includes('contact-route-invalid'), `${state}: ${result.blocks.join(',')}`);
    // The numeric total is still well above the threshold -- the block is what
    // stops it, not the arithmetic.
    assert.ok(result.total >= QUERY.minScore);
  }
});

test('a refused contact does not become eligible by being suppressed instead', () => {
  for (const state of ['suppressed', 'unsubscribed', 'complaint', 'complained']) {
    const result = score(state);
    assert.equal(result.eligible, false);
    assert.ok(result.blocks.includes('contact-route-suppressed'));
  }
});

test('a stale route requires reverification rather than passing on age alone', () => {
  for (const state of ['stale', 'expired']) {
    const result = score(state);
    assert.equal(result.eligible, false);
    assert.ok(result.blocks.includes('contact-route-reverify-required'));
  }
});

test('catch-all, risky, unknown and temporary failures go to review, not to handoff', () => {
  for (const state of ['catch_all', 'catch-all', 'risky', 'unknown', 'temporary_failure', 'deferred']) {
    const result = score(state);
    assert.equal(result.eligible, false, `${state} was eligible`);
    assert.ok(result.blocks.includes('contact-route-needs-review'), `${state}: ${result.blocks.join(',')}`);
  }
});

test('an unstated verification state is not permission', () => {
  // "we never checked" and "we checked and it is fine" must not score the same.
  const unstated = score(undefined);
  assert.equal(unstated.eligible, false);
  assert.ok(unstated.blocks.includes('contact-route-unverified'));

  const empty = score('');
  assert.equal(empty.eligible, false);
  assert.ok(empty.blocks.includes('contact-route-unverified'));
});

test('a positively verified route satisfies the contact gate', () => {
  for (const state of ['valid', 'verified', 'deliverable']) {
    const result = score(state);
    assert.equal(result.eligible, true, `${state}: ${result.blocks.join(',')}`);
    assert.deepEqual(result.blocks, []);
  }
});

test('a missing email is still its own distinct refusal', () => {
  const result = scoreLeadCandidate({
    candidate: candidate({ verified: 'valid', email: null }),
    query: QUERY, signals: SIGNALS, suppressions: [], now: NOW
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('no-selected-business-contact'));
});

test('suppression still dominates a positively verified route', () => {
  const result = scoreLeadCandidate({
    candidate: candidate({ verified: 'valid' }),
    query: QUERY, signals: SIGNALS,
    suppressions: ['buyer@acme.example'],
    now: NOW
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blocks.includes('suppressed'));
});

test('the gate only applies where the caller asked for a contact', () => {
  // A research-only query does not require a contact route, and an invalid one
  // must not silently become a hard block there.
  const result = scoreLeadCandidate({
    candidate: candidate({ verified: 'invalid' }),
    query: { ...QUERY, requireContact: false },
    signals: SIGNALS, suppressions: [], now: NOW
  });
  assert.ok(!result.blocks.some(block => block.startsWith('contact-route-')));
});

test('passing the contact gate confers no send authority', () => {
  const result = score('valid');
  assert.equal(result.eligible, true);
  // Nothing in a lead score is an authorization to contact anybody.
  assert.equal(result.businessEffectAuthority ?? 'NONE', 'NONE');
  assert.ok(!('outboundAuthority' in result) || result.outboundAuthority === 'NONE');
});
