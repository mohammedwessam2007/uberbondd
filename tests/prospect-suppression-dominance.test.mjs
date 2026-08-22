// Section 29's invariant, stated as a hostile scenario: a contact unsubscribes,
// a later enrichment run returns the same address marked VALID, and the system
// still refuses to contact them.
//
// Four ways round it were open. A SUPPRESSED verification was outvoted by any
// fresher VALID one. A plus-tagged form of a suppressed address was treated as
// a different person. So was the dotted form on a provider that ignores dots.
// And a complaint recorded as a risk flag rather than a state did not block at
// all. Each of these is the ordinary shape of a resurrection, not an exotic
// attack: enrichment providers hand back tagged and dotted addresses routinely.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalContactRoute,
  evaluateContactRoute,
  buildProspectEvidenceBundle
} from '../src/prospect-evidence-reconciliation.mjs';

const NOW = new Date('2026-08-22T12:00:00Z');

function route(input) {
  return evaluateContactRoute({ now: NOW, ...input });
}

test('an unsubscribe cannot be outvoted by a fresher VALID check', () => {
  const result = route({
    route: 'buyer@example.com',
    verifications: [
      { route: 'buyer@example.com', state: 'SUPPRESSED', checkedAt: '2026-08-01T00:00:00Z', provider: 'inbound' },
      { route: 'buyer@example.com', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z', provider: 'enricher' }
    ]
  });
  assert.equal(result.status, 'BLOCKED_SUPPRESSED');
  assert.equal(result.usableForHandoff, false);
  assert.ok(result.reasonCodes.includes('suppression-dominates-verification'));
});

test('a plus-tagged address does not escape its own suppression entry', () => {
  const result = route({
    route: 'buyer+newsletter@example.com',
    verifications: [{ route: 'buyer+newsletter@example.com', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z' }],
    suppressions: [{ value: 'buyer@example.com' }]
  });
  assert.equal(result.status, 'BLOCKED_SUPPRESSED');
  assert.equal(result.usableForHandoff, false);
});

test('a suppressed plus-tagged entry also covers the bare address', () => {
  const result = route({
    route: 'buyer@example.com',
    verifications: [{ route: 'buyer@example.com', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z' }],
    suppressions: [{ value: 'buyer+newsletter@example.com' }]
  });
  assert.equal(result.status, 'BLOCKED_SUPPRESSED');
});

test('case differences do not escape suppression', () => {
  const result = route({
    route: 'BUYER@Example.COM',
    verifications: [{ route: 'BUYER@Example.COM', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z' }],
    suppressions: [{ value: 'buyer@example.com' }]
  });
  assert.equal(result.status, 'BLOCKED_SUPPRESSED');
});

test('dots do not escape suppression where the provider ignores them', () => {
  const result = route({
    route: 'buyer@gmail.com',
    verifications: [{ route: 'buyer@gmail.com', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z' }],
    suppressions: [{ value: 'b.uyer@gmail.com' }]
  });
  assert.equal(result.status, 'BLOCKED_SUPPRESSED');
});

test('dots still distinguish addresses where the provider honours them', () => {
  const result = route({
    route: 'b.uyer@example.com',
    verifications: [{ route: 'b.uyer@example.com', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z' }],
    suppressions: [{ value: 'buyer@example.com' }]
  });
  assert.equal(result.status, 'VERIFIED_ROUTE');
  assert.equal(result.usableForHandoff, true);
});

test('a complaint recorded as a risk flag blocks as firmly as a state', () => {
  for (const flag of ['spam-complaint', 'unsubscribe', 'do-not-contact', 'ABUSE-REPORT']) {
    const result = route({
      route: 'buyer@example.com',
      verifications: [{ route: 'buyer@example.com', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z', riskFlags: [flag] }]
    });
    assert.equal(result.status, 'BLOCKED_SUPPRESSED', `${flag} did not block`);
    assert.ok(result.reasonCodes.includes('contact-refusal-flag-present'));
  }
});

test('an ordinary deliverability risk flag is not treated as a refusal', () => {
  const result = route({
    route: 'buyer@example.com',
    verifications: [{ route: 'buyer@example.com', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z', riskFlags: ['role-account'] }]
  });
  assert.equal(result.status, 'VERIFIED_ROUTE');
});

test('a domain-level suppression entry still covers every address on it', () => {
  const result = route({
    route: 'someone@blocked.example',
    verifications: [{ route: 'someone@blocked.example', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z' }],
    suppressions: [{ value: 'blocked.example' }]
  });
  assert.equal(result.status, 'BLOCKED_SUPPRESSED');
});

test('canonicalContactRoute reports the mailbox, not the spelling', () => {
  assert.equal(canonicalContactRoute('Buyer+tag@Example.com'), 'buyer@example.com');
  assert.equal(canonicalContactRoute('b.u.y.e.r+tag@gmail.com'), 'buyer@gmail.com');
  assert.equal(canonicalContactRoute('b.uyer@example.com'), 'b.uyer@example.com');
  assert.equal(canonicalContactRoute('  BUYER@EXAMPLE.COM  '), 'buyer@example.com');
  // A leading '+' is part of the local part, not a tag separator.
  assert.equal(canonicalContactRoute('+buyer@example.com'), '+buyer@example.com');
});

test('an evidence bundle reports a resurrected contact as blocked, not verified', () => {
  const bundle = buildProspectEvidenceBundle({
    prospectId: 'prospect_1',
    contactRoutes: [{
      route: 'buyer+tag@example.com',
      verifications: [{ route: 'buyer+tag@example.com', state: 'VALID', checkedAt: '2026-08-20T00:00:00Z' }]
    }],
    suppressions: [{ value: 'buyer@example.com' }],
    now: NOW
  });
  assert.equal(bundle.summary.verifiedRoutes, 0);
  assert.equal(bundle.summary.blockedRoutes, 1);
  assert.equal(bundle.businessEffectAuthority, 'NONE');
});
