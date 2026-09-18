import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentMailAdapter } from '../src/agentmail-adapter.mjs';
import { PROVIDER_CAPABILITIES, resolveProviderAdapter, validateProviderAdapter } from '../src/provider-adapter-contract.mjs';

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

test('AgentMail adapter satisfies the provider contract without exposing credentials', async () => {
  const adapter = createAgentMailAdapter({ apiKey: 'secret-agentmail' });
  const validation = validateProviderAdapter(adapter);
  assert.equal(validation.ok, true, validation.missing.join(','));
  assert.equal(PROVIDER_CAPABILITIES.every(capability => typeof adapter[capability] === 'function'), true);
  assert.equal(JSON.stringify(adapter).includes('secret-agentmail'), false);

  const limits = await adapter.planLimits();
  assert.equal(limits.status, 'PLAN_CEILING_DECLARED_NOT_OBSERVED');
  assert.equal(limits.observed, false);
  assert.equal(limits.limits.maxInboxes, 150);
});

test('unconfigured AgentMail never performs network I/O', async () => {
  let called = false;
  const adapter = createAgentMailAdapter({}, {
    fetchImpl: async () => {
      called = true;
      return response({});
    }
  });
  const result = await adapter.listMailboxes();
  assert.equal(result.ok, false);
  assert.equal(result.status, 'PROVIDER_AUTH_REQUIRED');
  assert.equal(called, false);
});

test('AgentMail inbox inventory uses the documented endpoint and normalizes inboxes', async () => {
  const calls = [];
  const adapter = createAgentMailAdapter({ apiKey: 'secret-agentmail' }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({
        count: 1,
        inboxes: [{
          inbox_id: 'inbox_1',
          email: 'mohamed@uberbond.agency',
          display_name: 'Mohamed Wessam'
        }],
        next_page_token: 'next_1'
      });
    }
  });

  const result = await adapter.listMailboxes({ limit: 150 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.mailboxes, [{
    id: 'inbox_1',
    address: 'mohamed@uberbond.agency',
    domainId: '',
    status: '',
    forwardingStatus: '',
    providerAccountId: '',
    currentDailyCap: null,
    warmupState: '',
    credentialsAvailable: false
  }]);
  assert.equal(result.nextPageToken, 'next_1');
  assert.equal(new URL(calls[0].url).pathname, '/v0/inboxes');
  assert.equal(new URL(calls[0].url).searchParams.get('limit'), '150');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-agentmail');
});

test('AgentMail creates one inbox per request with provider client_id idempotency', async () => {
  const calls = [];
  const adapter = createAgentMailAdapter({ apiKey: 'secret-agentmail' }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return response({
        inbox_id: 'inbox_1',
        email: 'mohamed@uberbond.agency',
        client_id: 'fleet:one:inbox:0'
      });
    }
  });

  const result = await adapter.provisionMailboxes({
    mailboxes: [{ email: 'mohamed@uberbond.agency', displayName: 'Mohamed Wessam' }],
    ownerApproval: approval('agentmail:provisionMailboxes'),
    idempotencyKey: 'fleet:one'
  });

  assert.equal(result.ok, true);
  assert.equal(result.provisionedCount, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(new URL(calls[0].url).pathname, '/v0/inboxes');
  assert.deepEqual(calls[0].body, {
    username: 'mohamed',
    domain: 'uberbond.agency',
    display_name: 'Mohamed Wessam',
    client_id: 'fleet:one:inbox:0'
  });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-agentmail');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'fleet:one:inbox:0');
});

test('AgentMail mutations fail closed without approval and never retry uncertain writes', async () => {
  let calls = 0;
  const adapter = createAgentMailAdapter({ apiKey: 'secret-agentmail' }, {
    fetchImpl: async () => {
      calls += 1;
      return response({ error: 'upstream' }, 503);
    }
  });

  const denied = await adapter.sendMessage({
    inboxId: 'inbox_1',
    to: 'recipient@example.com',
    subject: 'Hello',
    text: 'Body',
    idempotencyKey: 'send:denied'
  });
  assert.equal(denied.status, 'OWNER_APPROVAL_REQUIRED');
  assert.equal(calls, 0);

  const uncertain = await adapter.sendMessage({
    inboxId: 'inbox_1',
    to: 'recipient@example.com',
    subject: 'Hello',
    text: 'Body',
    ownerApproval: approval('agentmail:sendMessage'),
    idempotencyKey: 'send:uncertain'
  });
  assert.equal(uncertain.status, 'EXTERNAL_OUTCOME_UNKNOWN');
  assert.equal(calls, 1);
});

test('AgentMail send and reply use documented message routes and bounded recipients', async () => {
  const calls = [];
  const adapter = createAgentMailAdapter({ apiKey: 'secret-agentmail' }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return response({ message_id: 'msg_1', thread_id: 'thread_1' });
    }
  });
  const ownerApproval = approval('agentmail:sendMessage');

  const sent = await adapter.sendMessage({
    inboxId: 'inbox_1',
    to: 'recipient@example.com',
    subject: 'Hello',
    text: 'Body',
    ownerApproval,
    idempotencyKey: 'send:1'
  });
  assert.equal(sent.ok, true);
  assert.equal(new URL(calls[0].url).pathname, '/v0/inboxes/inbox_1/messages/send');
  assert.equal(calls[0].body.to, 'recipient@example.com');

  const replied = await adapter.replyToMessage({
    inboxId: 'inbox_1',
    messageId: '<msg_1@example.com>',
    text: 'Reply',
    replyAll: true,
    ownerApproval,
    idempotencyKey: 'reply:1'
  });
  assert.equal(replied.ok, true);
  assert.equal(new URL(calls[1].url).pathname, '/v0/inboxes/inbox_1/messages/%3Cmsg_1%40example.com%3E/reply');
  assert.equal(calls[1].body.reply_all, true);

  const tooMany = await adapter.sendMessage({
    inboxId: 'inbox_1',
    to: Array.from({ length: 51 }, (_, index) => 'recipient' + index + '@example.com'),
    ownerApproval,
    idempotencyKey: 'send:too-many'
  });
  assert.equal(tooMany.status, 'RECIPIENT_LIMIT_EXCEEDED');
  assert.equal(calls.length, 2);
});

test('AgentMail domain DNS receipts are returned without guessing records', async () => {
  const adapter = createAgentMailAdapter({ apiKey: 'secret-agentmail' }, {
    fetchImpl: async () => response({
      domain_id: 'domain_1',
      domain: 'uberbond.agency',
      records: [{ type: 'TXT', name: '@', value: 'v=spf1 include:agentmail.to ~all', status: 'MISSING', priority: 1 }]
    })
  });
  const result = await adapter.dnsRequirements({ domainId: 'domain_1' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.expectedRecords.records, [{
    type: 'TXT',
    name: '@',
    value: 'v=spf1 include:agentmail.to ~all',
    status: 'MISSING',
    priority: 1
  }]);
});

test('configured AgentMail resolves to the real adapter while legacy gaps remain explicit', () => {
  const agentmail = resolveProviderAdapter({
    providers: {
      agentmail: {
        configured: true,
        apiKey: 'present',
        targetPlan: 'startup'
      }
    }
  }, 'agentmail');
  const instantly = resolveProviderAdapter({
    providers: { instantly: { configured: true, apiKey: 'present' } }
  }, 'instantly');

  assert.equal(agentmail.ok, true);
  assert.equal(agentmail.adapter.providerName, 'agentmail');
  assert.equal(instantly.ok, false);
  assert.equal(instantly.reason, 'provider-configured-but-no-live-adapter-implemented');
});
