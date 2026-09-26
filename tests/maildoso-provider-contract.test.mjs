import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaildosoInfrastructureAdapter } from '../src/provider-http-adapters.mjs';
import { resolveProviderAdapter } from '../src/provider-adapter-contract.mjs';

const response = (status, body) => ({
  status,
  headers: { get: () => null },
  json: async () => body
});

const providerConfig = () => ({
  apiKey: 'fixture-pat',
  baseUrl: 'https://api.maildoso.com',
  configured: true
});

test('configured Maildoso resolves through the canonical provider contract', () => {
  const resolution = resolveProviderAdapter({ providers: { maildoso: providerConfig() } }, 'maildoso');
  assert.equal(resolution.ok, true);
  assert.equal(resolution.adapter.providerName, 'maildoso');
  assert.equal(resolution.adapter.configured, true);
});

test('Maildoso DNS requirements stay unsupported instead of being guessed', async () => {
  let calls = 0;
  const adapter = createMaildosoInfrastructureAdapter(providerConfig(), {
    fetchImpl: async () => { calls += 1; return response(200, {}); }
  });
  const result = await adapter.dnsRequirements({ domainId: 'd1' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UNSUPPORTED_CAPABILITY');
  assert.equal(calls, 0);
});

test('Maildoso account lookup normalizes account address and observed cap', async () => {
  const adapter = createMaildosoInfrastructureAdapter(providerConfig(), {
    fetchImpl: async () => response(200, {
      accounts: [{ id: 'provider-m1', email: 'sender@example.com', status: 'active', daily_limit: 15 }]
    })
  });
  const result = await adapter.listMailboxes();
  assert.equal(result.ok, true);
  assert.equal(result.mailboxes.length, 1);
  assert.equal(result.mailboxes[0].address, 'sender@example.com');
  assert.equal(result.mailboxes[0].currentDailyCap, 15);
});

test('Maildoso warmup status promotes only an explicitly matching observation', async () => {
  const adapter = createMaildosoInfrastructureAdapter(providerConfig(), {
    fetchImpl: async () => response(200, {
      services: [
        { status: 'completed', mailboxes: ['sender@example.com'] },
        { status: 'active', mailboxes: ['other@example.com'] }
      ]
    })
  });
  const observed = await adapter.warmupStatus({ mailboxId: 'sender@example.com' });
  assert.equal(observed.ok, true);
  assert.equal(observed.warmupState, 'WARMUP_COMPLETE');

  const missing = await adapter.warmupStatus({ mailboxId: 'absent@example.com' });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 'WARMUP_NOT_OBSERVED');
});


test('Maildoso warmup creation remains owner-approved and idempotent', async () => {
  const calls = [];
  const adapter = createMaildosoInfrastructureAdapter(providerConfig(), {
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method, body: options.body });
      return response(200, { id: 'warm-1', status: 'active' });
    }
  });
  const denied = await adapter.startWarmup({
    providerPayload: { mailbox: 'provider-m1' },
    idempotencyKey: 'warm-1'
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(calls.length, 0);

  const allowed = await adapter.startWarmup({
    providerPayload: { mailbox: 'provider-m1' },
    ownerApproval: {
      granted: true,
      grantedBy: 'owner',
      scope: ['maildoso:startWarmup'],
      expiresAt: '2099-01-01T00:00:00.000Z'
    },
    idempotencyKey: 'warm-1'
  });
  assert.equal(allowed.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
});
