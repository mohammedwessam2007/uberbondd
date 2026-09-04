import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DOMAIN_PURPOSES,
  DOMAIN_RECORD_STATES,
  GENERATED_PROVENANCE,
  OBSERVED_PROVENANCE,
  OWNED_ROOT_DOMAINS,
  RECORD_BLOCKED_REASON,
  buildDomainPurposePlan,
  evaluateDomainRecord,
  resolveOwnedHost
} from '../src/domain-purpose-plan.mjs';

const NOW = new Date('2026-09-02T00:00:00.000Z');
const hoursAgo = h => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test('UberBond owns exactly two roots and refuses every other one', () => {
  assert.deepEqual([...OWNED_ROOT_DOMAINS], ['uberbond.agency', 'uberbond.cloud']);
  for (const host of ['mail.uberbond.agency', 'uberbond.cloud', 'track.uberbond.cloud']) {
    assert.equal(resolveOwnedHost(host).ok, true, `${host} was refused`);
  }
  for (const host of ['uberbond.com', 'evil.example.com', 'uberbond.agency.attacker.net', '']) {
    const resolved = resolveOwnedHost(host);
    assert.equal(resolved.ok, false, `${host} was accepted as owned`);
    if (host) assert.ok(resolved.reasonCodes.includes('domain-not-owned'));
  }
});

test('the plan covers every purpose and separates the ones that must not share a host', () => {
  const plan = buildDomainPurposePlan({ now: NOW });
  assert.equal(plan.ok, true);
  assert.equal(plan.purposes.length, DOMAIN_PURPOSES.length);

  const hostFor = purpose => plan.purposes.find(row => row.purpose === purpose)?.host;
  assert.notEqual(hostFor('OUTBOUND'), hostFor('APP_PRODUCT'),
    'outbound reputation and the product share a host, so one can burn the other');
  assert.notEqual(hostFor('TRACKING'), hostFor('OUTBOUND'));
  assert.notEqual(hostFor('TESTING'), hostFor('OUTBOUND'));
});

test('without provider requirements, expected records are blocked rather than guessed', () => {
  const plan = buildDomainPurposePlan({ now: NOW });
  const outbound = plan.purposes.find(row => row.purpose === 'OUTBOUND');
  assert.equal(outbound.providerRequirementsSupplied, false);
  // A guessed DKIM selector is worse than no selector: it produces a
  // confident-looking record that will never verify.
  assert.ok(JSON.stringify(outbound.records).includes(RECORD_BLOCKED_REASON));
});

const SPF_RECORD = Object.freeze({
  type: 'SPF',
  matchMode: 'EXACT_ONE',
  expectedValue: 'v=spf1 include:example.test ~all',
  provenance: GENERATED_PROVENANCE.EXPECTED_FROM_PROVIDER_REQUIREMENT,
  reasonCodes: []
});

const spfObservation = (overrides = {}) => ({
  type: 'SPF',
  provenance: OBSERVED_PROVENANCE.DNS,
  values: ['v=spf1 include:example.test ~all'],
  observedAt: hoursAgo(1),
  pass: true,
  ...overrides
});

test('a record this system generated can never reach VERIFIED on its own', () => {
  // No observation at all: an expectation, however confident, is not a reading.
  const unobserved = evaluateDomainRecord({ record: SPF_RECORD, now: NOW });
  assert.notEqual(unobserved.state, 'VERIFIED',
    'expecting a record and having one were treated as the same fact');
  assert.ok(DOMAIN_RECORD_STATES.includes(unobserved.state));

  // And an "observation" carrying this module's own generated provenance is
  // the same claim wearing an observation's clothes.
  const selfWitnessed = evaluateDomainRecord({
    record: SPF_RECORD,
    observation: spfObservation({ provenance: GENERATED_PROVENANCE.EXPECTED_FROM_PROVIDER_REQUIREMENT }),
    now: NOW
  });
  assert.equal(selfWitnessed.state, 'UNKNOWN');
  assert.ok(selfWitnessed.reasonCodes.includes('evidence-provenance-not-observed'));
});

test('only a fresh observation verifies, and a stale one stops verifying', () => {
  const observed = overrides => evaluateDomainRecord({
    record: SPF_RECORD,
    observation: spfObservation(overrides),
    now: NOW,
    maxObservationAgeHours: 24
  });

  assert.equal(observed({}).state, 'VERIFIED');

  // Yesterday's GREEN is not today's GREEN: DNS changes without telling
  // anyone, and a stale pass is how a broken sender keeps looking fine.
  const stale = observed({ observedAt: hoursAgo(72) });
  assert.equal(stale.state, 'UNKNOWN', 'a three-day-old reading still counted as current DNS');
  assert.ok(stale.reasonCodes.includes('observation-stale'));

  assert.equal(observed({ values: ['v=spf1 include:someone-else.test ~all'] }).state, 'MISCONFIGURED');
  assert.equal(observed({ observedAt: new Date(NOW.getTime() + 3_600_000).toISOString() }).state, 'UNKNOWN');
});

test('a record not yet visible inside the propagation window reads as propagating, not broken', () => {
  const empty = { ...spfObservation(), values: [], pass: false };
  const propagating = evaluateDomainRecord({
    record: SPF_RECORD,
    observation: empty,
    declaredConfiguredAt: hoursAgo(6),
    now: NOW,
    propagationWindowHours: 48
  });
  assert.equal(propagating.state, 'DNS_PROPAGATING');

  // Outside the window the same absence is a misconfiguration, not patience.
  const expired = evaluateDomainRecord({
    record: SPF_RECORD,
    observation: empty,
    declaredConfiguredAt: hoursAgo(200),
    now: NOW,
    propagationWindowHours: 48
  });
  assert.notEqual(expired.state, 'DNS_PROPAGATING');
});

test('the plan is deterministic, changes no DNS and claims no authority', () => {
  const first = buildDomainPurposePlan({ now: NOW });
  assert.deepEqual(first, buildDomainPurposePlan({ now: NOW }));
  assert.equal(first.businessEffectAuthority, 'NONE');
  assert.equal(first.externalEffectLedger.dnsChanges, 0);
  for (const value of Object.values(first.externalEffectLedger)) assert.equal(value, 0);
});

test('a purpose pointed at a host UberBond does not own is refused, not planned', () => {
  const plan = buildDomainPurposePlan({
    hosts: { OUTBOUND: 'send.attacker-controlled.example' },
    now: NOW
  });
  const outbound = plan.purposes.find(row => row.purpose === 'OUTBOUND');
  const refused = plan.refusedPurposes?.some(row => row.purpose === 'OUTBOUND') || outbound?.state === 'UNKNOWN';
  assert.ok(refused, 'a host on an unowned root was planned as if UberBond controlled it');
  assert.equal(JSON.stringify(plan).includes('attacker-controlled'), plan.refusedPurposes?.length > 0);
});
