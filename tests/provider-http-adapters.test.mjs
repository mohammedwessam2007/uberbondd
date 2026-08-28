import test from 'node:test';
import assert from 'node:assert/strict';
import { createIcemailAdapter, createMailforgeAdapter } from '../src/provider-http-adapters.mjs';
import { PROVIDER_CAPABILITIES, validateProviderAdapter, resolveProviderAdapter } from '../src/provider-adapter-contract.mjs';

function response(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    json: async () => payload
  };
}

const approval = (scope, overrides = {}) => ({
  granted: true,
  grantedBy: 'owner:test',
  scope: [scope],
  expiresAt: '2030-01-01T00:00:00.000Z',
  ...overrides
});

test('provider adapters expose the complete infrastructure contract without exposing credentials', () => {
  for (const adapter of [createIcemailAdapter({ apiKey: 'secret-icemail' }), createMailforgeAdapter({ apiKey: 'secret-mailforge' })]) {
    const result = validateProviderAdapter(adapter);
    assert.equal(result.ok, true, `${adapter.providerName}: ${result.missing.join(',')}`);
    assert.equal(PROVIDER_CAPABILITIES.every(capability => typeof adapter[capability] === 'function'), true);
    assert.equal(JSON.stringify(adapter).includes('secret-'), false);
  }
});

test('Icemail adapter performs a bounded authenticated read and normalizes workspaces', async () => {
  const calls = [];
  const adapter = createIcemailAdapter({ apiKey: 'secret-icemail' }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ success: true, data: [{ id: 'ws_1', name: 'UberBond' }] }, 200, { 'x-request-id': 'req_1' });
    }
  });
  const result = await adapter.listWorkspaces({ search: 'UberBond' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.workspaces, [{ id: 'ws_1', name: 'UberBond', slug: '' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers['x-api-key'], 'secret-icemail');
  assert.match(calls[0].url, /search=UberBond/);
});

test('mailbox credentials are blocked even when a caller asks for them', async () => {
  let called = false;
  const adapter = createMailforgeAdapter({ apiKey: 'secret' }, { fetchImpl: async () => { called = true; return response({}); } });
  const result = await adapter.listMailboxes({ includeCredentials: true });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SECRET_RETRIEVAL_BLOCKED');
  assert.equal(called, false);
});

test('all provider mutations fail closed without exact scoped owner approval', async () => {
  let called = false;
  const adapter = createMailforgeAdapter({ apiKey: 'secret' }, { fetchImpl: async () => { called = true; return response({}); } });
  const result = await adapter.createWorkspace({ name: 'UberBond' });
  assert.equal(result.status, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(called, false);
});

test('approved provider mutation requires idempotency and sends no credential-shaped payload', async () => {
  const calls = [];
  const adapter = createMailforgeAdapter({ apiKey: 'secret' }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ id: 'ws_1', password: 'provider-secret', nested: { accessToken: 'bad' } }, 201);
    }
  });
  const missingKey = await adapter.createWorkspace({ name: 'UberBond', ownerApproval: approval('mailforge:createWorkspace') });
  assert.equal(missingKey.status, 'IDEMPOTENCY_KEY_REQUIRED');
  assert.equal(calls.length, 0);

  const result = await adapter.createWorkspace({ name: 'UberBond', ownerApproval: approval('mailforge:createWorkspace'), idempotencyKey: 'workspace:create:uberbond' });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, 'secret');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'workspace:create:uberbond');
  assert.equal(result.data.password, undefined);
  assert.equal(result.data.nested.accessToken, undefined);
});

test('provider request bodies reject secret-shaped fields instead of forwarding them', async () => {
  let called = false;
  const adapter = createIcemailAdapter({ apiKey: 'secret' }, { fetchImpl: async () => { called = true; return response({}); } });
  const result = await adapter.provisionMailboxes({
    body: { mailboxes: [{ email: 'a@uberbond.example', password: 'do-not-forward' }] },
    ownerApproval: approval('icemail:provisionMailboxes'),
    idempotencyKey: 'mailboxes:secret-test'
  });
  assert.equal(result.status, 'SECRET_FIELD_REJECTED');
  assert.equal(called, false);
});

test('a timed-out or 5xx mutation becomes EXTERNAL_OUTCOME_UNKNOWN and is never retried', async () => {
  let calls = 0;
  const adapter = createIcemailAdapter({ apiKey: 'secret' }, {
    fetchImpl: async () => { calls += 1; return response({ error: 'upstream' }, 503); }
  });
  const result = await adapter.provisionMailboxes({
    mailboxes: [{ email: 'a@uberbond.example' }],
    ownerApproval: approval('icemail:provisionMailboxes'),
    idempotencyKey: 'mailboxes:1'
  });
  assert.equal(result.status, 'EXTERNAL_OUTCOME_UNKNOWN');
  assert.equal(calls, 1);
});

test('safe reads may recover once from a rate limit, while a bulk availability POST remains read-only', async () => {
  let calls = 0;
  const adapter = createMailforgeAdapter({ apiKey: 'secret' }, {
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response({ error: 'slow down' }, 429, { 'retry-after': '1' }) : response({ data: [{ domain: 'example.test', available: true }] });
    }
  });
  const result = await adapter.domainAvailability({ domains: ['example.test'] });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.domains[0].domain, 'example.test');
});

test('configured Icemail and Mailforge resolve to real adapters while legacy providers remain explicit gaps', () => {
  const icemail = resolveProviderAdapter({ providers: { icemail: { configured: true, apiKey: 'present' } } }, 'icemail');
  const mailforge = resolveProviderAdapter({ providers: { mailforge: { configured: true, apiKey: 'present' } } }, 'mailforge');
  const instantly = resolveProviderAdapter({ providers: { instantly: { configured: true, apiKey: 'present' } } }, 'instantly');
  assert.equal(icemail.ok, true);
  assert.equal(mailforge.ok, true);
  assert.equal(instantly.ok, false);
  assert.equal(instantly.reason, 'provider-configured-but-no-live-adapter-implemented');
});
