import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberInboxesFleet,
  materializeUberInboxes,
  reconcileUberInboxes,
  DEFAULT_UBERINBOXES_LOCAL_PARTS
} from '../src/uberinboxes.mjs';

function approval(scope = 'icemail:provisionMailboxes', spendLimitCents = 100000) {
  return {
    granted: true,
    grantedBy: 'founder',
    scope,
    spendLimitCents,
    expiresAt: '2026-09-15T23:59:59.000Z'
  };
}

test('UberInboxes compiles the full current 16-mailbox fleet across the two owned roots', () => {
  const result = compileUberInboxesFleet();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'UBERINBOXES_FLEET_READY_TO_PROVISION');
  assert.equal(result.fleet.roots.length, 2);
  assert.equal(result.fleet.localParts.length, 8);
  assert.equal(result.fleet.desiredMailboxCount, 16);
  assert.equal(result.fleet.missingMailboxCount, 16);
  assert.equal(result.fleet.sendAuthorityCreated, false);
  assert.equal(new Set(result.fleet.desired.map(item => item.address)).size, 16);
});

test('UberInboxes never exceeds UberDoso per-root density', () => {
  const result = compileUberInboxesFleet({
    localParts: [...DEFAULT_UBERINBOXES_LOCAL_PARTS, 'ninth']
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('mailboxes-per-domain-exceeds-8'));
});

test('existing mailbox inventory is not provisioned twice', () => {
  const result = compileUberInboxesFleet({
    existingMailboxes: [
      { address: 'mohamed@uberbond.cloud' },
      { address: 'mohamed@uberbond.agency' }
    ]
  });
  assert.equal(result.fleet.desiredMailboxCount, 16);
  assert.equal(result.fleet.existingMailboxCount, 2);
  assert.equal(result.fleet.missingMailboxCount, 14);
  assert.equal(result.fleet.missing.some(item => item.address === 'mohamed@uberbond.cloud'), false);
});

test('materialization fails closed when provider auth is absent', async () => {
  const fleet = compileUberInboxesFleet().fleet;
  const result = await materializeUberInboxes({
    providerName: 'icemail',
    fleet,
    providerAdapter: {
      providerName: 'icemail',
      configured: false,
      provisionMailboxes: async () => ({ ok: true })
    },
    ownerApproval: approval()
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UBERINBOXES_PROVISIONING_BLOCKED');
  assert.ok(result.reasonCodes.includes('provider-auth-required'));
});

test('materialization requires explicit owner approval even with configured provider', async () => {
  const fleet = compileUberInboxesFleet().fleet;
  let called = false;
  const result = await materializeUberInboxes({
    providerName: 'icemail',
    fleet,
    providerAdapter: {
      providerName: 'icemail',
      configured: true,
      provisionMailboxes: async () => { called = true; return { ok: true }; }
    }
  });
  assert.equal(result.ok, false);
  assert.equal(called, false);
  assert.ok(result.reasonCodes.includes('explicit-owner-approval-required'));
});

test('materialization provisions one bounded batch per root with stable idempotency keys', async () => {
  const fleet = compileUberInboxesFleet().fleet;
  const calls = [];
  const result = await materializeUberInboxes({
    providerName: 'icemail',
    fleet,
    estimatedCostCents: 1600,
    ownerApproval: approval('icemail:provisionMailboxes', 1600),
    providerAdapter: {
      providerName: 'icemail',
      configured: true,
      provisionMailboxes: async input => {
        calls.push(input);
        return {
          ok: true,
          status: 'ACCEPTED',
          operationId: `op-${calls.length}`,
          providerRequestId: `req-${calls.length}`
        };
      }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'UBERINBOXES_PROVIDER_WRITES_ACCEPTED_RECONCILIATION_REQUIRED');
  assert.equal(result.requestedMailboxCount, 16);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.mailboxes.length), [8, 8]);
  assert.equal(calls.every(call => call.idempotencyKey.startsWith('uberinboxes:icemail:')), true);
  assert.equal(calls.reduce((sum, call) => sum + call.estimatedCostCents, 0), 1600);
  assert.equal(result.sendAuthorityCreated, false);
});

test('unknown external write outcome halts remaining provisioning and forbids blind retry', async () => {
  const fleet = compileUberInboxesFleet().fleet;
  let calls = 0;
  const result = await materializeUberInboxes({
    providerName: 'icemail',
    fleet,
    ownerApproval: approval(),
    providerAdapter: {
      providerName: 'icemail',
      configured: true,
      provisionMailboxes: async () => {
        calls += 1;
        return { ok: false, status: 'EXTERNAL_OUTCOME_UNKNOWN' };
      }
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UBERINBOXES_EXTERNAL_OUTCOME_UNKNOWN');
  assert.equal(calls, 1);
  assert.ok(result.reasonCodes.includes('provider-write-outcome-unknown-do-not-retry-until-reconciled'));
});

test('reconciliation only marks mailboxes observed when provider inventory actually returns them', async () => {
  const fleet = compileUberInboxesFleet().fleet;
  const observed = fleet.desired.slice(0, 5).map(item => ({ address: item.address }));
  const result = await reconcileUberInboxes({
    fleet,
    providerAdapter: {
      listMailboxes: async () => ({ ok: true, mailboxes: observed })
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'UBERINBOXES_PARTIALLY_OBSERVED');
  assert.equal(result.observedMailboxCount, 5);
  assert.equal(result.missingAddresses.length, 11);
  assert.equal(result.sendAuthorityCreated, false);
});

test('UberInboxes plans founder aliases on every owned outreach domain, not only the two roots', async () => {
  const { OUTREACH_FLEET_DOMAINS } = await import('../src/outreach-domain-fleet.mjs');
  const roots = compileUberInboxesFleet();
  assert.equal(roots.fleet.desiredMailboxCount, 16);
  assert.equal('senderDomains' in roots.fleet, false, 'the default two-root plan and its digest are unchanged');

  const all = compileUberInboxesFleet({ senderDomains: OUTREACH_FLEET_DOMAINS });
  assert.equal(all.ok, true);
  assert.equal(all.fleet.desiredMailboxCount, 30 * DEFAULT_UBERINBOXES_LOCAL_PARTS.length);
  assert.equal(Object.keys(all.fleet.byDomain).length, 30);
  assert.deepEqual(all.fleet.senderDomains, [...OUTREACH_FLEET_DOMAINS]);
  assert.ok(all.fleet.desired.every(row => row.identityClass === 'FOUNDER_ALIAS' && row.desiredState === 'PROVISIONED_NOT_AUTHORIZED_TO_SEND'));
  assert.notEqual(all.fleet.fleetDigest, roots.fleet.fleetDigest);
  assert.equal(all.fleet.sendAuthorityCreated, false);

  const existing = compileUberInboxesFleet({ senderDomains: [OUTREACH_FLEET_DOMAINS[0]], existingMailboxes: [{ address: `mohamed@${OUTREACH_FLEET_DOMAINS[0]}` }] });
  assert.equal(existing.fleet.missingMailboxCount, 23);

  const foreign = compileUberInboxesFleet({ senderDomains: ['someone-else.example'] });
  assert.equal(foreign.ok, false);
  assert.deepEqual(foreign.reasonCodes, ['sender-domain-not-in-verified-outreach-fleet:someone-else.example']);
});
