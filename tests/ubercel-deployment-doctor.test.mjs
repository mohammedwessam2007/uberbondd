// Ubercel deployment state, and the line between a vendor's fact and ours.
//
// Written after a session read a red Vercel badge and reported it as UberBond's
// deployment truth. Ubercel already treated VERCEL as one of five replaceable
// adapters holding no authority, and its plan-time law says
// NO_PROVIDER_IS_THE_CONTROL_PLANE -- but nothing answered "what is our
// deployment state?" at read time, so the badge was the only thing to read.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  diagnoseUbercelDeployment,
  EVIDENCE_CLASSES,
  UBERCEL_DEPLOYMENT_STATES
} from '../src/ubercel-deployment-doctor.mjs';

const NOW = new Date('2026-09-17T03:00:00.000Z');
const FRESH = '2026-09-17T02:55:00.000Z';
const CONTRACT = { authenticatedHealthRef: 'https://uberbondd.internal/health', expectedStatus: 200 };

const badge = (serving, provider = 'vercel', adapterType = 'VERCEL') => ({
  evidenceClass: 'PROVIDER_BADGE', adapterType, provider, serving,
  observedAt: FRESH, sourceRef: `github-status:${provider}`
});

const probe = (serving, overrides = {}) => ({
  evidenceClass: 'AUTHENTICATED_HEALTH', adapterType: 'OWNED_LINUX', provider: 'uberlit', serving,
  observedAt: FRESH, sourceRef: 'uberlit:probe-1',
  healthRef: CONTRACT.authenticatedHealthRef, status: CONTRACT.expectedStatus, ...overrides
});

const run = signals => diagnoseUbercelDeployment({
  serviceId: 'uberbondd', healthContract: CONTRACT, signals, date: NOW
});

test('a red provider badge is not a report that UberBond is down', () => {
  // The exact error this module exists to prevent. A vendor build failing may be
  // a surface UberBond does not serve from, and the badge cannot answer that
  // about itself.
  const result = run([badge(false)]);
  assert.equal(result.report.state, 'UNKNOWN__ONLY_PROVIDER_BADGES');
  assert.notEqual(result.report.state, 'NOT_SERVING__AUTHENTICATED');
  assert.equal(result.report.providerBadges[0].establishes, 'NOTHING_ABOUT_UBERBOND_DEPLOYMENT_STATE');
  assert.equal(result.report.authoritativeSignals, 0);
});

test('a green provider badge is not a report that UberBond is up', () => {
  // The symmetric error, and the more dangerous one: a vendor's green would
  // otherwise stand in for evidence that the service actually serves.
  assert.equal(run([badge(true)]).report.state, 'UNKNOWN__ONLY_PROVIDER_BADGES');
});

test('no number of provider badges adds up to an answer', () => {
  const many = run([badge(true), badge(true, 'netlify', 'OTHER_REPLACEABLE'), badge(false, 'oracle', 'ORACLE_CLOUD')]);
  assert.equal(many.report.state, 'UNKNOWN__ONLY_PROVIDER_BADGES');
  assert.equal(many.report.providerBadges.length, 3);
});

test('a contract-bound authenticated probe does answer', () => {
  assert.equal(run([probe(true)]).report.state, 'SERVING__AUTHENTICATED');
  assert.equal(run([probe(false)]).report.state, 'NOT_SERVING__AUTHENTICATED');
});

test('one authenticated not-serving outranks any number of healthy ones', () => {
  // Something is failing to serve and the others did not see it. Majority vote
  // would turn a real outage into a rounding error.
  const result = run([probe(true), probe(true, { sourceRef: 'uberlit:probe-2' }), probe(false, { sourceRef: 'uberlit:probe-3' })]);
  assert.equal(result.report.state, 'NOT_SERVING__AUTHENTICATED');
});

test('a 200 from somewhere else is a 200 from somewhere else', () => {
  // Unbound from the declared contract, so it establishes nothing about the
  // service the contract names.
  const elsewhere = run([probe(true, { healthRef: 'https://example.test/health' })]);
  assert.equal(elsewhere.report.state, 'UNKNOWN__EVIDENCE_STALE');
  assert.notEqual(elsewhere.report.state, 'SERVING__AUTHENTICATED');

  const wrongStatus = run([probe(true, { status: 503 })]);
  assert.equal(wrongStatus.report.state, 'UNKNOWN__EVIDENCE_STALE');
});

test('stale and future-dated evidence both stop counting as current', () => {
  const old = run([probe(true, { observedAt: '2026-09-17T01:00:00.000Z' })]);
  assert.equal(old.report.state, 'UNKNOWN__EVIDENCE_STALE');

  // A future timestamp is a clock problem or a fabricated one. Neither is fresh.
  const future = run([probe(true, { observedAt: '2026-09-18T03:00:00.000Z' })]);
  assert.equal(future.report.state, 'UNKNOWN__EVIDENCE_STALE');
});

test('an adapter cannot promote its own evidence', () => {
  // The plan-time law (adapter-must-not-own-deployment-authority) applied to the
  // read path, where it would otherwise be a comment.
  for (const claim of [{ deploymentAuthority: true }, { authoritative: true }]) {
    const result = run([probe(true, claim)]);
    assert.equal(result.report.state, 'UNKNOWN__NO_EVIDENCE');
    assert.ok(result.report.rejectedSignals.some(row =>
      row.reasonCodes.includes('adapter-must-not-claim-deployment-authority')));
  }
});

test('no evidence is reported as no evidence, not as health', () => {
  const empty = run([]);
  assert.equal(empty.report.state, 'UNKNOWN__NO_EVIDENCE');
  assert.equal(empty.report.authoritativeSignals, 0);
});

test('an unknown adapter type or evidence class is refused rather than admitted', () => {
  const bogus = run([
    { ...badge(true), adapterType: 'FLY_IO' },
    { ...badge(true), evidenceClass: 'VIBES' }
  ]);
  assert.equal(bogus.report.admittedSignals.length, 0);
  assert.equal(bogus.report.rejectedSignals.length, 2);
  assert.ok(bogus.report.rejectedSignals[0].reasonCodes.includes('declared-adapter-type-required'));
  assert.ok(bogus.report.rejectedSignals[1].reasonCodes.includes('known-evidence-class-required'));
});

test('the report carries no authority of any kind', () => {
  const result = run([probe(true)]);
  assert.equal(result.report.businessEffectAuthority, 'NONE');
  assert.equal(result.report.externalEffectAuthority, 'NONE');
  assert.equal(result.report.deploymentAuthority, 'NONE');
  assert.deepEqual(result.externalEffectLedger.effects ?? [], []);
  for (const signal of result.report.admittedSignals) assert.equal(signal.deploymentAuthority, 'NONE');
});

test('a provider badge is structurally unable to establish serving state', () => {
  // Asserted on the table rather than only through behaviour, because this is
  // the one entry whose flipping would make every test above pass wrongly.
  assert.equal(EVIDENCE_CLASSES.PROVIDER_BADGE.establishesServing, false);
  assert.equal(EVIDENCE_CLASSES.PROVIDER_BADGE.establishesNotServing, false);
  assert.equal(EVIDENCE_CLASSES.AUTHENTICATED_HEALTH.establishesServing, true);
  assert.ok(UBERCEL_DEPLOYMENT_STATES.includes('UNKNOWN__ONLY_PROVIDER_BADGES'));
});

test('a missing service identity is refused', () => {
  const result = diagnoseUbercelDeployment({ signals: [probe(true)] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('service-identity-required'));
});
