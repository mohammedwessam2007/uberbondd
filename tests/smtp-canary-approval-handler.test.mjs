import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';

const token = 'fixture-admin-token-for-smtp-canary-approval';
const slot = 'winnr:sender@sender.example';
let handler, dir;

test.before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'smtp-canary-handler-'));
  Object.assign(process.env, {
    PROCESS_ROLE: 'web', STORE_BACKEND: 'json', DATA_DIR: dir,
    NODE_ENV: 'test', ADMIN_TOKEN: token, APP_BASE_URL: 'https://uberbond.example',
    OUTBOUND_PROVIDER: 'smtp-relay', OUTBOUND_LAUNCH_PHASE: 'canary',
    OUTREACH_APPROVAL_SECRET: 'fixture-approval-secret-'.repeat(3),
    OUTREACH_APPROVER_ID: 'fixture-owner', OUTBOUND_ENABLED: 'false', OUTBOUND_DRY_RUN: 'true'
  });
  const store = new Store(dir);
  await store.init();
  await store.add('campaigns', { id: 'campaign', approved: true, autoSend: true });
  const account = {
    id: 'smtp-account', slot, provider: 'smtp-relay', email: 'sender@sender.example',
    connected: true, tokens: 'encrypted-fixture-placeholder', plannedDailyCap: 2,
    smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'fixture-route' }
  };
  await store.add('accounts', account);
  for (const [suffix, patch] of [
    ['paused', {}], ['disconnected', { connected: false }],
    ['unauthorized', { smtpRoute: { ...account.smtpRoute, authorized: false } }],
    ['imap', { provider: 'imap-forwarding' }]
  ]) {
    await store.add('accounts', { ...account, ...patch, id: suffix, slot: suffix });
  }
  await store.setSenderPaused('paused', true, 'Fixture protective pause');
  for (const [id, inbox] of [
    ['permissioned', slot], ['cold', slot], ['legacy', 'A'], ['missing', 'missing'],
    ['paused', 'paused'], ['disconnected', 'disconnected'], ['unauthorized', 'unauthorized'], ['imap', 'imap']
  ]) {
    await store.add('prospects', {
      id, campaignId: 'campaign', company: 'Fixture recipient', website: `https://${id}.recipient.example`, domain: `${id}.recipient.example`,
      country: 'GB', inbox, status: 'ready', subject: 'Requested evidence',
      draft: 'Here is the evidence you requested. Reply no to stop future messages.',
      contact: { email: 'owner@recipient.example' },
      oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=fixture'
    });
  }
  ({ requestHandler: handler } = await import('../server-core.mjs'));
});

test.after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

async function approve(prospectId, routeType = 'REQUESTED_INFORMATION') {
  const body = JSON.stringify({
    prospectId, idempotencyKey: `fixture-${prospectId}-${routeType}`,
    routeEvidence: {
      routeType, permissionScope: 'SERVICE_INFORMATION',
      sourceUrl: 'https://recipient.example/request',
      sourceExcerpt: 'Please send the requested service evidence to owner@recipient.example.',
      sourceObservedAt: new Date().toISOString(), jurisdiction: 'GB',
      relevantToRecipientRole: true, noUnsolicitedStatementPresent: false
    }
  });
  const res = { status: null, body: '', writeHead(status) { this.status = status; }, end(value) { this.body = value; } };
  await handler({
    method: 'POST', url: '/api/outbound/approve-prospect',
    headers: { authorization: `Bearer ${token}` },
    async *[Symbol.asyncIterator]() { yield Buffer.from(body); }
  }, res);
  return { status: res.status, data: JSON.parse(res.body) };
}

test('permissioned SMTP canary approval binds an existing fleet sender without a provider call', async () => {
  const result = await approve('permissioned');
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.state, 'CANARY_APPROVED_NO_PROVIDER_CALL');
  assert.equal(result.data.providerCalls, 0);
  assert.equal(result.data.messagesSent, 0);
  assert.match(result.data.effectPayloadDigest, /^[a-f0-9]{64}$/);
});

test('SMTP cannot sign a different sender when the stored sender is missing or unhealthy', async () => {
  for (const id of ['legacy', 'missing', 'paused', 'disconnected', 'unauthorized', 'imap']) {
    const result = await approve(id);
    assert.equal(result.status, 409, `${id}: ${JSON.stringify(result.data)}`);
    assert.match(result.data.error, /healthy authorized SMTP sender/);
  }
});

test('adding SMTP to the approval endpoint does not admit an unsolicited cold route', async () => {
  const result = await approve('cold', 'PUBLIC_BUSINESS_CONTACT');
  assert.equal(result.status, 409);
  assert.match(result.data.error, /smtp-relay-cold-route-requires-separate-provider-and-legal-evidence/);
});
