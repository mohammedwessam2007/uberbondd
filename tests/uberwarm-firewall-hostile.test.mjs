import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderHttpAdapter, createIcemailAdapter } from '../src/provider-http-adapters.mjs';
import { createWinnrApiClient } from '../src/uberwinnr-adapter.mjs';
import { createWinnrInfrastructureAdapter } from '../src/uberwinnr-provider-adapter.mjs';
import { createUberMaildosoAdapter } from '../src/ubermaildoso.mjs';
import { compileProvisioningPlan } from '../src/mailhub-control-plane.mjs';

// Hostile fixtures for the zero-paid firewall. Every fetch is an in-process
// counter; no provider, Maildoso, Winnr, DNS or billing endpoint is contacted.
const FUTURE = '2099-01-01T00:00:00.000Z';
const ok200 = () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => '{"data":{"ok":true}}',
  json: async () => ({ data: { ok: true } })
});
const counter = () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options?.method || 'GET' });
    return ok200();
  };
  return { calls, fetchImpl };
};

// ---------------------------------------------------------------- UW-ZA-01
const winnrConfig = { apiKey: 'wnr_account_abcdefghijklmnopqrstuvwx', accountAuthorized: true, termsCompatible: true, termsEvidenceRef: 'winnr-mcp:official' };
const winnrClient = fetchImpl => createWinnrApiClient({
  token: 'wnr_account_abcdefghijklmnopqrstuvwx', authorized: true, termsCompatible: true, evidenceRef: 'winnr-mcp:official', fetchImpl
});

test('UW-ZA-01: the Winnr infrastructure adapter exposes no raw client', () => {
  const adapter = createWinnrInfrastructureAdapter(winnrConfig, { fetchImpl: async () => ok200() });
  assert.equal(adapter.rawClient, undefined);
});

test('UW-ZA-01: a raw POST to a Winnr purchase route with writeAuthorized and no owner approval makes zero fetch calls', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createWinnrInfrastructureAdapter(winnrConfig, { fetchImpl });
  if (adapter.rawClient) await adapter.rawClient.rawRequest('POST', '/prewarmed/example.com/purchase', { writeAuthorized: true });
  assert.equal(calls.length, 0);
});

test('UW-ZA-01: the Winnr client refuses consequential writes to warm-up, pre-warm, purchase, billing and subscription routes', async () => {
  const { calls, fetchImpl } = counter();
  const client = winnrClient(fetchImpl);
  const attempts = [
    ['POST', '/prewarmed/example.com/purchase'],
    ['POST', '/prewarmed/example.com/purchase-batch'],
    ['PUT', '/account/billing/payment-method'],
    ['POST', '/account/subscription/upgrade'],
    ['DELETE', '/prewarmed/example.com/warmup'],
    ['PUT', '/email-users/warming-plan'],
    ['POST', '/warm-up/enable']
  ];
  for (const [method, path] of attempts) {
    const result = await client.rawRequest(method, path, { writeAuthorized: true, body: {} });
    assert.equal(result.ok, false, `${method} ${path} must be refused`);
    assert.equal(result.providerCalls, 0, `${method} ${path} must not reach the provider`);
  }
  assert.equal(calls.length, 0);
});

test('UW-ZA-01 regression guard: Winnr read of a billing-named route stays a read', async () => {
  const { calls, fetchImpl } = counter();
  const client = winnrClient(fetchImpl);
  const result = await client.rawRequest('GET', '/account/billing/invoices', {});
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
});

// ---------------------------------------------- UW-ZA-03 and F2 path lock
function probe(fetchImpl) {
  return createProviderHttpAdapter({
    providerName: 'probe-vendor',
    config: { apiKey: 'test-only-key' },
    baseUrl: 'https://example.org',
    routes: {},
    fetchImpl,
    extensions: ({ requestJson }) => ({
      sendWrite: ({ method, path, body = null, query }) => requestJson({
        capability: 'probeWrite',
        method,
        path,
        body,
        query,
        ownerApproval: { granted: true, grantedBy: 'owner-fixture', scope: ['probe-vendor:probeWrite'], expiresAt: FUTURE },
        idempotencyKey: 'probe:write:1'
      }),
      readStatus: ({ path }) => requestJson({ capability: 'probeRead', method: 'GET', path, readOnly: true })
    })
  });
}

test('UW-ZA-03 and F2: every warm-up and pre-warm path variant is refused for every non-read method with zero fetch calls', async () => {
  const variants = [
    // Segment-exact control: refused before the fix as well.
    '/paid/warmup/enable',
    '/prewarm/buy',
    '/x/./warmup',
    '/PAID/Warmup/Enable',
    // Substring variants: the exact segment set missed these.
    '/warmup-enable',
    '/enable-warmup',
    '/warm_up/enable',
    '/warmup-plans',
    // Backslash, query, percent-encoding, double encoding and dot segments.
    '/paid\\warmup\\enable',
    '/services?warmup=1',
    '/warm%75p/enable',
    '/warm%2575p/enable',
    '/x/..%2fwarmup/enable'
  ];
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of variants) {
      const { calls, fetchImpl } = counter();
      const adapter = probe(fetchImpl);
      const result = await adapter.sendWrite({ method, path });
      assert.equal(result.ok, false, `${method} ${path} must be refused`);
      assert.equal(calls.length, 0, `${method} ${path} must not reach fetch`);
    }
  }
});

test('UW-ZA-03 regression guard: a read-only warm-up status GET is still permitted', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = probe(fetchImpl);
  const result = await adapter.readStatus({ path: '/v1/user/services/warmups' });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});

// ---------------------------------------------------------------- UW-ZA-04
test('UW-ZA-04 and F1: a warm-up key nested anywhere in a Maildoso createAccounts or updateAccount body is refused with zero fetch calls', async () => {
  const bodies = [
    { accounts: [{ email: 'a@example.com', warmup: { enabled: true } }] },
    { warmup: { enabled: true } },
    { settings: { prewarmPlan: { on: true } } },
    { warm_up: 1 }
  ];
  const approval = { authorized: true, authorizedBy: 'owner-fixture', receiptId: 'receipt-1', scopes: ['createAccounts', 'updateAccount'], expiresAt: FUTURE, spendLimitCents: 1000 };
  for (const body of bodies) {
    const { calls, fetchImpl } = counter();
    const adapter = createUberMaildosoAdapter({ token: 'test-only-key', fetchImpl });
    const result = await adapter.mutate('createAccounts', { body, approval, estimatedCostCents: 0 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'UBERBOND_ZERO_PAID_WARMUP_LOCK');
    assert.equal(calls.length, 0);
  }
  const { calls, fetchImpl } = counter();
  const adapter = createUberMaildosoAdapter({ token: 'test-only-key', fetchImpl });
  const updated = await adapter.mutate('updateAccount', {
    params: { account_id: 'acct-1' },
    body: { warmup: { enabled: true } },
    approval: { ...approval, scopes: ['updateAccount'] },
    estimatedCostCents: 0
  });
  assert.equal(updated.status, 'UBERBOND_ZERO_PAID_WARMUP_LOCK');
  assert.equal(calls.length, 0);
});

test('UW-ZA-04: a warm-up key in a generic provisionMailboxes or configureForwarding body is refused with zero fetch calls', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createIcemailAdapter({ apiKey: 'secret-icemail' }, { fetchImpl });
  const provisioned = await adapter.provisionMailboxes({
    body: { mailboxes: [{ email: 'ops@uberbond.example', warmup: { enabled: true } }] },
    ownerApproval: { granted: true, grantedBy: 'owner:test', scope: ['icemail:provisionMailboxes'], expiresAt: FUTURE, spendLimitCents: 1000 },
    estimatedCostCents: 100,
    idempotencyKey: 'mailboxes:warm-key'
  });
  assert.equal(provisioned.ok, false);
  assert.equal(provisioned.status, 'UBERBOND_ZERO_PAID_WARMUP_LOCK');
  const forwarded = await adapter.configureForwarding({
    body: { domainId: 'd1', warmup: { enabled: true } },
    ownerApproval: { granted: true, grantedBy: 'owner:test', scope: ['icemail:configureForwarding'], expiresAt: FUTURE },
    idempotencyKey: 'forwarding:warm-key'
  });
  assert.equal(forwarded.ok, false);
  assert.equal(forwarded.status, 'UBERBOND_ZERO_PAID_WARMUP_LOCK');
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- UW-ZA-02
const FUTURE_APPROVAL = (scope, extra = {}) => ({ granted: true, grantedBy: 'owner:test', scope: [scope], expiresAt: FUTURE, ...extra });

test('UW-ZA-02: a billable provider route with an omitted estimate and a $0 spend limit is refused with zero fetch calls', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createIcemailAdapter({ apiKey: 'secret-icemail' }, { fetchImpl });
  const mailboxes = await adapter.provisionMailboxes({
    mailboxes: [{ email: 'ops@uberbond.example' }],
    ownerApproval: FUTURE_APPROVAL('icemail:provisionMailboxes', { spendLimitCents: 0 }),
    idempotencyKey: 'mailboxes:spend-omitted'
  });
  assert.equal(mailboxes.ok, false);
  const domains = await adapter.provisionDomains({
    domains: ['uberbond.example'],
    ownerApproval: FUTURE_APPROVAL('icemail:provisionDomains', { spendLimitCents: 0 }),
    idempotencyKey: 'domains:spend-omitted'
  });
  assert.equal(domains.ok, false);
  assert.equal(calls.length, 0);
});

test('UW-ZA-02: a billable provider route refuses a $0 estimate against a $0 limit, a non-numeric estimate, an overrun and a wildcard scope', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createIcemailAdapter({ apiKey: 'secret-icemail' }, { fetchImpl });
  const cases = [
    { estimatedCostCents: 0, ownerApproval: FUTURE_APPROVAL('icemail:provisionDomains', { spendLimitCents: 0 }) },
    { estimatedCostCents: 'abc', ownerApproval: FUTURE_APPROVAL('icemail:provisionDomains', { spendLimitCents: 1000 }) },
    { estimatedCostCents: 1001, ownerApproval: FUTURE_APPROVAL('icemail:provisionDomains', { spendLimitCents: 1000 }) },
    { estimatedCostCents: 100, ownerApproval: FUTURE_APPROVAL('*', { spendLimitCents: 1000 }) }
  ];
  for (const extra of cases) {
    const result = await adapter.provisionDomains({ domains: ['uberbond.example'], idempotencyKey: 'domains:refused', ...extra });
    assert.equal(result.ok, false, JSON.stringify(extra));
  }
  assert.equal(calls.length, 0);
});

test('UW-ZA-02 regression guard: an in-limit priced billable provider route with a named scope still proceeds', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createIcemailAdapter({ apiKey: 'secret-icemail' }, { fetchImpl });
  const result = await adapter.provisionMailboxes({
    mailboxes: [{ email: 'ops@uberbond.example' }],
    ownerApproval: FUTURE_APPROVAL('icemail:provisionMailboxes', { spendLimitCents: 1000 }),
    estimatedCostCents: 100,
    idempotencyKey: 'mailboxes:priced'
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
});

test('UW-ZA-02: the Winnr adapter refuses billable mailbox provisioning without an estimate or with a wildcard scope', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createWinnrInfrastructureAdapter(winnrConfig, { fetchImpl });
  const body = { domain: 'pilot.test', users: [{ username: 'sam', name: 'Sam' }] };
  const omitted = await adapter.provisionMailboxes({
    body,
    ownerApproval: { granted: true, grantedBy: 'founder', scope: ['winnr:provisionMailboxes'], expiresAt: FUTURE, spendLimitCents: 0 }
  });
  assert.equal(omitted.ok, false);
  const wildcard = await adapter.provisionMailboxes({
    body,
    estimatedCostCents: 100,
    ownerApproval: { granted: true, grantedBy: 'founder', scope: ['*'], expiresAt: FUTURE, spendLimitCents: 1000 }
  });
  assert.equal(wildcard.ok, false);
  assert.equal(calls.length, 0);
});

test('UW-ZA-02 regression guard: the Winnr adapter still provisions a priced, in-limit, named-scope mailbox', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createWinnrInfrastructureAdapter(winnrConfig, { fetchImpl });
  const result = await adapter.provisionMailboxes({
    body: { domain: 'pilot.test', users: [{ username: 'sam', name: 'Sam' }] },
    estimatedCostCents: 100,
    ownerApproval: { granted: true, grantedBy: 'founder', scope: ['winnr:provisionMailboxes'], expiresAt: FUTURE, spendLimitCents: 1000 }
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
});

test('UW-ZA-02: Maildoso createAccounts and createDomains refuse an omitted estimate, a $0 limit and a wildcard scope with zero fetch calls', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createUberMaildosoAdapter({ token: 'test-only-key', fetchImpl });
  const omittedAccounts = await adapter.mutate('createAccounts', {
    body: { accounts: [{ email: 'a@example.com' }] },
    approval: { authorized: true, authorizedBy: 'owner-fixture', receiptId: 'receipt-2', scopes: ['createAccounts'], expiresAt: FUTURE, spendLimitCents: 0 }
  });
  assert.equal(omittedAccounts.ok, false);
  const wildcardDomains = await adapter.mutate('createDomains', {
    body: { domains: ['uberbond.example'] },
    estimatedCostCents: 100,
    approval: { authorized: true, authorizedBy: 'owner-fixture', receiptId: 'receipt-3', scopes: ['*'], expiresAt: FUTURE, spendLimitCents: 1000 }
  });
  assert.equal(wildcardDomains.ok, false);
  assert.equal(calls.length, 0);
});

test('UW-ZA-02: unpriced provisioning is a financial external effect, and an absent estimate is not recorded as zero', () => {
  const plan = compileProvisioningPlan({
    provider: 'icemail',
    workspaceId: 'ws_1',
    requestedDomains: ['uberbond.cloud'],
    requestedMailboxes: ['ops@uberbond.cloud']
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.estimatedCostCents, null);
  assert.equal(plan.stages.find(stage => stage.stage === 'PROVISION_DOMAIN').effectClass, 'FINANCIAL_EXTERNAL_EFFECT');
  assert.equal(plan.stages.find(stage => stage.stage === 'PROVISION_MAILBOX').effectClass, 'FINANCIAL_EXTERNAL_EFFECT');
  assert.ok(plan.externalEffects.includes('FINANCIAL_EXTERNAL_EFFECT'));
});

// ---------------------------------------------------------------- F4
const deleteApproval = { authorized: true, authorizedBy: 'owner-fixture', receiptId: 'receipt-4', scopes: ['deleteWarmup'], expiresAt: FUTURE };

test('F4: Maildoso deleteWarmup with a dot-segment or separator id makes zero fetch calls', async () => {
  for (const id of ['..', '.', '%2e%2e', 'a/../b', 'a\\..\\b']) {
    const { calls, fetchImpl } = counter();
    const adapter = createUberMaildosoAdapter({ token: 'test-only-key', fetchImpl });
    const result = await adapter.mutate('deleteWarmup', { params: { id }, approval: deleteApproval });
    assert.equal(result.ok, false, `id ${JSON.stringify(id)} must be refused`);
    assert.equal(calls.length, 0, `id ${JSON.stringify(id)} must not reach fetch`);
  }
});

test('F4 regression guard: a normal deleteWarmup id still deletes inside the warm-up collection', async () => {
  const { calls, fetchImpl } = counter();
  const adapter = createUberMaildosoAdapter({ token: 'test-only-key', fetchImpl });
  const result = await adapter.mutate('deleteWarmup', { params: { id: 'warmup-42' }, approval: deleteApproval });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'DELETE');
  assert.match(calls[0].url, /\/v1\/user\/services\/warmups\/warmup-42$/);
});
