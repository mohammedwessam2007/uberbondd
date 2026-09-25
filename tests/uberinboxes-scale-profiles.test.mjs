import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UBERINBOXES_SCALE_PROFILES,
  compileScaledUberInboxesFleet,
  compareUberInboxesProfiles
} from '../src/uberinboxes-scale-profiles.mjs';

const NOW = new Date('2026-09-14T20:30:00.000Z');

test('Icemail Azure profile compiles 200 founder-alias inboxes over the two owned roots', () => {
  const result = compileScaledUberInboxesFleet({ now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.fleet.desiredMailboxCount, 200);
  assert.equal(result.fleet.maxMailboxesPerDomain, 100);
  assert.equal(result.fleet.byDomain['uberbond.agency'].length, 100);
  assert.equal(result.fleet.byDomain['uberbond.cloud'].length, 100);
  assert.equal(new Set(result.fleet.desired.map(item => item.address)).size, 200);
  assert.equal(result.fleet.desired.every(item => item.identityClass === 'FOUNDER_ALIAS'), true);
  assert.equal(result.fleet.sendAuthorityCreated, false);
});

test('Icemail Azure evidence envelope is 1000 cold messages/day across 200 mailboxes', () => {
  const result = compileScaledUberInboxesFleet({ now: NOW });
  assert.equal(result.fleet.theoreticalColdDailyCap, 1000);
  assert.equal(result.fleet.theoreticalTotalDailyCap, 2000);
  assert.match(result.fleet.truthBoundary, /Actual cold-send capacity remains zero/);
});

test('existing scaled inboxes are reconciled out of the provisioning request', () => {
  const result = compileScaledUberInboxesFleet({
    now: NOW,
    existingMailboxes: [
      { address: 'mohamed.001@uberbond.agency' },
      { address: 'mohamed.001@uberbond.cloud' }
    ]
  });
  assert.equal(result.fleet.existingMailboxCount, 2);
  assert.equal(result.fleet.missingMailboxCount, 198);
});

test('scaled fleet refuses unowned or incomplete root sets', () => {
  const result = compileScaledUberInboxesFleet({ roots: ['uberbond.cloud', 'not-owned.example'], now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('exact-owned-roots-required'));
});

test('stale provider profile is not silently trusted', () => {
  const result = compileScaledUberInboxesFleet({ now: new Date('2027-01-01T00:00:00.000Z') });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SCALE_PROFILE_STALE');
});

test('SMTP profile exposes total-send envelope without pretending all 50 are cold', () => {
  const result = compileScaledUberInboxesFleet({ profile: UBERINBOXES_SCALE_PROFILES.ICEMAIL_SMTP_2026_09_14, now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.fleet.desiredMailboxCount, 20);
  assert.equal(result.fleet.theoreticalTotalDailyCap, 1000);
  assert.equal(result.fleet.theoreticalColdDailyCap, null);
});

test('profile comparison preserves evidence uncertainty', () => {
  const comparison = compareUberInboxesProfiles({ now: NOW });
  const azure = comparison.rows.find(row => row.infrastructureClass === 'AZURE_HIGH_VOLUME');
  const smtp = comparison.rows.find(row => row.infrastructureClass === 'SMTP_DEDICATED_IP_PER_DOMAIN');
  assert.equal(azure.theoreticalColdDailyCap, 1000);
  assert.equal(smtp.theoreticalColdDailyCap, null);
  assert.equal(comparison.externalEffectAuthority, 'NONE');
});

test('a provider-managed profile spreads over chosen fleet domains and refuses foreign ones', async () => {
  const { OUTREACH_FLEET_DOMAINS } = await import('../src/outreach-domain-fleet.mjs');
  const base = compileScaledUberInboxesFleet({ now: NOW });
  const wider = compileScaledUberInboxesFleet({ senderDomains: OUTREACH_FLEET_DOMAINS.slice(0, 3), now: NOW });
  assert.equal(wider.ok, true);
  assert.equal(wider.fleet.desiredMailboxCount, base.fleet.desiredMailboxCount / 2 * 5);
  assert.equal(Object.keys(wider.fleet.byDomain).length, 5);
  assert.equal('senderDomains' in base.fleet, false);
  const foreign = compileScaledUberInboxesFleet({ senderDomains: ['someone-else.example'], now: NOW });
  assert.equal(foreign.status, 'SCALE_PROFILE_REFUSED');
  assert.deepEqual(foreign.reasonCodes, ['sender-domain-not-in-verified-outreach-fleet:someone-else.example']);
});
