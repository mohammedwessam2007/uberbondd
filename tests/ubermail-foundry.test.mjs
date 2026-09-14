import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberMailFoundry } from '../src/ubermail-foundry.mjs';

test('UberMail Foundry compiles 200 founder-alias accounts across the two owned roots', () => {
  const result = compileUberMailFoundry();
  assert.equal(result.ok, true);
  assert.equal(result.plan.desiredAccountCount, 200);
  assert.equal(result.plan.accountsPerRoot, 100);
  assert.equal(result.plan.accounts.filter(row => row.domain === 'uberbond.agency').length, 100);
  assert.equal(result.plan.accounts.filter(row => row.domain === 'uberbond.cloud').length, 100);
  assert.equal(new Set(result.plan.accounts.map(row => row.address)).size, 200);
  assert.equal(result.plan.accounts.every(row => row.identityClass === 'FOUNDER_ALIAS'), true);
});

test('mailbox identities do not manufacture cold-send or egress capacity', () => {
  const result = compileUberMailFoundry();
  assert.equal(result.plan.capacityCreated.mailboxIdentityCapacity, 200);
  assert.equal(result.plan.capacityCreated.coldSendDailyCapacity, 0);
  assert.equal(result.plan.capacityCreated.egressDailyCapacity, 0);
  assert.equal(result.plan.sendAuthorityCreated, false);
});

test('existing accounts are reconciled out of the missing set', () => {
  const result = compileUberMailFoundry({
    existingAccounts: [
      { address: 'mohamed.001@uberbond.agency' },
      { address: 'mohamed.001@uberbond.cloud' }
    ]
  });
  assert.equal(result.plan.existingAccountCount, 2);
  assert.equal(result.plan.missingAccountCount, 198);
});

test('unowned roots are refused', () => {
  const result = compileUberMailFoundry({ roots: ['uberbond.cloud', 'other.example'] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('exact-owned-roots-required'));
});
