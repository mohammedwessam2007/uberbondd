// CD012 recovery. A reserved RFC 2606 / RFC 6761 domain must never become a
// real sending domain, and the guard must not be bypassable by a value that
// merely looks like consent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isReservedDomain, assertNotReservedOutsideSimulation } from '../src/reserved-domains.mjs';
import { registerSendingDomain } from '../src/sending-domain-registry.mjs';

test('reserved: the RFC 2606 exact names and reserved TLDs are reserved', () => {
  for (const domain of ['example.com', 'example.net', 'example.org', 'example.edu']) {
    assert.equal(isReservedDomain(domain), true, domain);
  }
  for (const domain of ['example.test', 'mail.example.test', 'foo.invalid', 'localhost', 'api.localhost', 'thing.example']) {
    assert.equal(isReservedDomain(domain), true, domain);
  }
});

test('reserved: a real domain that merely contains a reserved word is not reserved', () => {
  // The substring trap: "attestation" contains "test", "exampleshop" contains
  // "example". Refusing these would block legitimate customers.
  for (const domain of ['uberbond.com', 'attestation.com', 'exampleshop.com', 'testing.io', 'invalidate.co']) {
    assert.equal(isReservedDomain(domain), false, domain);
  }
});

test('reserved: case and URL form do not evade the check', () => {
  assert.equal(isReservedDomain('EXAMPLE.COM'), true);
  assert.equal(isReservedDomain('https://example.org/path'), true);
  assert.equal(isReservedDomain('  www.example.test  '), true);
});

test('reserved: only a literal true is simulation consent', () => {
  assert.equal(assertNotReservedOutsideSimulation('example.test').ok, false);
  assert.equal(assertNotReservedOutsideSimulation('example.test', { simulation: true }).ok, true);
  // A truthy value is how a fixture becomes real by accident.
  for (const value of ['yes', 1, {}, 'true']) {
    assert.equal(assertNotReservedOutsideSimulation('example.test', { simulation: value }).ok, false, String(value));
  }
});

test('reserved: empty and malformed input is not silently reserved', () => {
  assert.equal(isReservedDomain(''), false);
  assert.equal(isReservedDomain(null), false);
  assert.equal(isReservedDomain(undefined), false);
  assert.equal(assertNotReservedOutsideSimulation('').ok, true);
});

test('sending domain registry: a reserved domain is refused as a real registration', () => {
  const result = registerSendingDomain({
    domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'OWNER_CONFIRMED'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('reserved-domain-outside-simulation'));
});

test('sending domain registry: a declared simulation is allowed and stays labelled', () => {
  const result = registerSendingDomain({
    domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'OWNER_CONFIRMED', simulation: true
  });
  assert.equal(result.ok, true);
  // Without this the event is indistinguishable from a real registration once
  // it is in the log, which is the whole hazard one step later.
  assert.equal(result.event.simulationOnly, true);
});

test('sending domain registry: a real domain registers with simulationOnly false', () => {
  const result = registerSendingDomain({
    domainId: 'd1', workspaceId: 'w1', domain: 'uberbond.com', ownershipStatus: 'OWNER_CONFIRMED'
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.simulationOnly, false);
});

test('sending domain registry: the guard defaults closed when simulation is not mentioned at all', () => {
  const result = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: 'mail.example.org' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('reserved-domain-outside-simulation'));
});
