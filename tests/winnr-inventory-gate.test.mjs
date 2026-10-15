import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExpectedInventory, gateCsvInventory, gateProviderInventory, gateCsvAgainstProvider, WINNR_STARTUP_ROLES } from '../src/winnr-inventory-gate.mjs';

// Fixtures use reserved .test names. Nothing here is a customer domain.
const STARTUP = Array.from({ length: 10 }, (_, i) => `startup-${String(i + 1).padStart(2, '0')}.test`);
const PILOT = ['pilot-fixture.test'];
const INVENTORY_TEXT = JSON.stringify({ startupDomains: STARTUP, pilotDomains: PILOT });
const EXPECTED = parseExpectedInventory(INVENTORY_TEXT);

function validRows() {
  const rows = [];
  for (const domain of STARTUP) {
    for (const role of WINNR_STARTUP_ROLES) {
      const email = `${role}@${domain}`;
      rows.push({ domain, from_email: email, user_name: email });
    }
  }
  return rows;
}

function providerFor(rows, { status = 'active' } = {}) {
  return {
    providerDomains: [...STARTUP.map(name => ({ name, tags: [] })), ...PILOT.map(name => ({ name, tags: ['pre-warmed'] }))],
    providerMailboxes: rows.map(r => ({ full_address: r.from_email, domain: r.domain, status }))
  };
}

// ---- expected inventory parsing -------------------------------------------------------------

test('a well-formed expected inventory parses to sorted, lower-case domains', () => {
  assert.equal(EXPECTED.ok, true);
  assert.equal(EXPECTED.startupDomains.length, 10);
  assert.deepEqual(EXPECTED.pilotDomains, PILOT);
});

test('an expected inventory that is not JSON, or has the wrong shape, is refused', () => {
  assert.deepEqual(parseExpectedInventory('not json').reasonCodes, ['inventory-not-json']);
  assert.deepEqual(parseExpectedInventory('[]').reasonCodes, ['inventory-shape-invalid']);
  assert.deepEqual(parseExpectedInventory(JSON.stringify({ startupDomains: STARTUP })).reasonCodes, ['inventory-shape-invalid']);
  assert.deepEqual(parseExpectedInventory('').reasonCodes, ['inventory-not-json']);
});

test('an expected inventory with 9 or 11 startup domains is refused', () => {
  assert.ok(parseExpectedInventory(JSON.stringify({ startupDomains: STARTUP.slice(1), pilotDomains: PILOT })).reasonCodes.includes('inventory-startup-domain-count-not-10'));
  assert.ok(parseExpectedInventory(JSON.stringify({ startupDomains: [...STARTUP, 'extra.test'], pilotDomains: PILOT })).reasonCodes.includes('inventory-startup-domain-count-not-10'));
});

test('duplicate startup domains, invalid names, a missing pilot, and a pilot that overlaps startup are refused', () => {
  const dup = [...STARTUP.slice(0, 9), STARTUP[0].toUpperCase()];
  assert.ok(parseExpectedInventory(JSON.stringify({ startupDomains: dup, pilotDomains: PILOT })).reasonCodes.includes('inventory-startup-domain-duplicate'));
  const bad = [...STARTUP.slice(1), 'not a domain'];
  assert.ok(parseExpectedInventory(JSON.stringify({ startupDomains: bad, pilotDomains: PILOT })).reasonCodes.includes('inventory-startup-domain-invalid'));
  assert.ok(parseExpectedInventory(JSON.stringify({ startupDomains: STARTUP, pilotDomains: [] })).reasonCodes.includes('inventory-pilot-domain-required'));
  assert.ok(parseExpectedInventory(JSON.stringify({ startupDomains: STARTUP, pilotDomains: [STARTUP[3]] })).reasonCodes.includes('inventory-pilot-overlaps-startup'));
});

// ---- export gate: exactly 50, 10 domains, 5 roles each --------------------------------------

test('the valid 50-row export passes the gate', () => {
  const g = gateCsvInventory({ expected: EXPECTED, rows: validRows() });
  assert.equal(g.ok, true);
  assert.equal(g.counts.mailboxes, 50);
  assert.equal(g.counts.distinctAddresses, 50);
  assert.equal(g.counts.domains, 10);
});

test('a partial export of 49 rows is refused: never a fully authenticated partial inventory', () => {
  const g = gateCsvInventory({ expected: EXPECTED, rows: validRows().slice(1) });
  assert.equal(g.ok, false);
  assert.ok(g.reasonCodes.includes('mailbox-count-not-50'));
});

test('an oversized export of 51 rows is refused', () => {
  const rows = [...validRows(), { domain: STARTUP[0], from_email: `extra@${STARTUP[0]}`, user_name: `extra@${STARTUP[0]}` }];
  assert.ok(gateCsvInventory({ expected: EXPECTED, rows }).reasonCodes.includes('mailbox-count-not-50'));
});

test('a duplicate address is refused', () => {
  const rows = validRows();
  rows[1] = { ...rows[0] };
  const g = gateCsvInventory({ expected: EXPECTED, rows });
  assert.equal(g.ok, false);
  assert.ok(g.reasonCodes.includes('duplicate-address'));
});

test('a pilot-domain row inside the Startup export is refused', () => {
  const rows = validRows();
  rows[0] = { domain: PILOT[0], from_email: `hello@${PILOT[0]}`, user_name: `hello@${PILOT[0]}` };
  const g = gateCsvInventory({ expected: EXPECTED, rows });
  assert.equal(g.ok, false);
  assert.ok(g.reasonCodes.includes('pilot-domain-present'));
});

test('a row on an unexpected domain is refused', () => {
  const rows = validRows();
  rows[0] = { domain: 'stranger.test', from_email: 'hello@stranger.test', user_name: 'hello@stranger.test' };
  assert.ok(gateCsvInventory({ expected: EXPECTED, rows }).reasonCodes.includes('unexpected-domain'));
});

test('a row with an unexpected role is refused', () => {
  const rows = validRows();
  rows[0] = { domain: STARTUP[0], from_email: `sales@${STARTUP[0]}`, user_name: `sales@${STARTUP[0]}` };
  assert.ok(gateCsvInventory({ expected: EXPECTED, rows }).reasonCodes.includes('unexpected-role'));
});

test('a domain missing one of the five roles is refused even when the total is 50', () => {
  const rows = validRows();
  rows[4] = { ...rows[0] };
  const g = gateCsvInventory({ expected: EXPECTED, rows });
  assert.equal(g.ok, false);
  assert.ok(g.reasonCodes.includes('domain-role-set-incomplete') || g.reasonCodes.includes('duplicate-role-on-domain'));
});

test('a domain column that disagrees with the address is refused', () => {
  const rows = validRows();
  rows[0] = { ...rows[0], domain: 'other.test' };
  assert.ok(gateCsvInventory({ expected: EXPECTED, rows }).reasonCodes.includes('domain-column-mismatch'));
});

test('a username that is not the address is refused', () => {
  const rows = validRows();
  rows[0] = { ...rows[0], user_name: 'someone-else' };
  assert.ok(gateCsvInventory({ expected: EXPECTED, rows }).reasonCodes.includes('username-not-address'));
});

test('a malformed address is refused', () => {
  const rows = validRows();
  rows[0] = { domain: STARTUP[0], from_email: 'not-an-address', user_name: 'not-an-address' };
  assert.ok(gateCsvInventory({ expected: EXPECTED, rows }).reasonCodes.includes('invalid-address'));
});

test('no gate runs without a valid expected inventory', () => {
  assert.ok(gateCsvInventory({ expected: null, rows: validRows() }).reasonCodes.includes('expected-inventory-required'));
  assert.ok(gateCsvInventory({ expected: parseExpectedInventory('x'), rows: validRows() }).reasonCodes.includes('expected-inventory-required'));
});

// ---- provider gate: read before any export --------------------------------------------------

test('a provider inventory matching the expected set passes', () => {
  const p = providerFor(validRows());
  assert.equal(gateProviderInventory({ expected: EXPECTED, ...p }).ok, true);
});

test('an extra non-pilot domain at the provider is refused before export', () => {
  const p = providerFor(validRows());
  p.providerDomains.push({ name: 'extra-provider.test', tags: [] });
  assert.ok(gateProviderInventory({ expected: EXPECTED, ...p }).reasonCodes.includes('provider-startup-domain-set-mismatch'));
});

test('a missing expected domain at the provider is refused', () => {
  const p = providerFor(validRows());
  p.providerDomains = p.providerDomains.filter(d => d.name !== STARTUP[9]);
  const g = gateProviderInventory({ expected: EXPECTED, ...p });
  assert.equal(g.ok, false);
  assert.ok(g.reasonCodes.includes('provider-startup-domain-missing'));
});

test('an inactive Startup mailbox at the provider is refused', () => {
  const rows = validRows();
  const p = providerFor(rows);
  p.providerMailboxes[0] = { ...p.providerMailboxes[0], status: 'suspended' };
  assert.ok(gateProviderInventory({ expected: EXPECTED, ...p }).reasonCodes.includes('provider-mailbox-not-active'));
});

test('an unexpected role at the provider is refused', () => {
  const rows = validRows();
  const p = providerFor(rows);
  p.providerMailboxes[0] = { ...p.providerMailboxes[0], full_address: `sales@${STARTUP[0]}` };
  assert.ok(gateProviderInventory({ expected: EXPECTED, ...p }).reasonCodes.includes('provider-unexpected-role'));
});

test('a provider list of 49 Startup mailboxes is refused', () => {
  const rows = validRows();
  const p = providerFor(rows.slice(1));
  assert.ok(gateProviderInventory({ expected: EXPECTED, ...p }).reasonCodes.includes('provider-startup-mailbox-count-not-50'));
});

test('a duplicate mailbox at the provider is refused', () => {
  const rows = validRows();
  const p = providerFor(rows);
  p.providerMailboxes[1] = { ...p.providerMailboxes[0] };
  assert.ok(gateProviderInventory({ expected: EXPECTED, ...p }).reasonCodes.includes('provider-duplicate-address'));
});

test('the export must match the provider exactly: extra or missing addresses are refused', () => {
  const rows = validRows();
  const p = providerFor(rows);
  assert.equal(gateCsvAgainstProvider({ rows, providerMailboxes: p.providerMailboxes, expected: EXPECTED }).ok, true);
  assert.ok(gateCsvAgainstProvider({ rows: rows.slice(1), providerMailboxes: p.providerMailboxes, expected: EXPECTED }).reasonCodes.includes('csv-provider-count-mismatch'));
  const swapped = [...rows.slice(1), { from_email: 'ghost@ghost.test' }];
  assert.ok(gateCsvAgainstProvider({ rows: swapped, providerMailboxes: p.providerMailboxes, expected: EXPECTED }).reasonCodes.includes('csv-address-not-in-provider'));
});
