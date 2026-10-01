import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createWinnrApiClient,
  verifyWinnrWebhookSignature,
  normalizeWinnrEvent,
  compileWinnrPostPurchaseChecklist
} from '../src/uberwinnr-adapter.mjs';

test('Winnr webhook signature verifier accepts current HMAC and rejects stale timestamps', () => {
  const raw = JSON.stringify({ id: 'evt_1', type: 'test.ping' });
  const secret = 'whsec_test_secret';
  const timestamp = '1790884800';
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
  const headers = {
    'x-winnr-timestamp': timestamp,
    'x-winnr-signature': `v1=${sig}`
  };
  const now = Number(timestamp) * 1000;
  assert.equal(verifyWinnrWebhookSignature({ rawBody: raw, headers, secret, now }).ok, true);
  assert.equal(verifyWinnrWebhookSignature({ rawBody: raw, headers, secret, now: now + 301000 }).ok, false);
});

test('Winnr client refuses secrets without account authority and terms evidence', () => {
  const result = createWinnrApiClient({ token: 'wnr_fake_token' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('provider-account-authorization-required'));
  assert.ok(result.reasonCodes.includes('provider-terms-compatibility-required'));
});

test('Winnr read path uses documented bearer API without leaking token into result', async () => {
  let seen = null;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return {
      ok: true,
      status: 200,
      headers: { get: name => name.toLowerCase() === 'x-request-id' ? 'req_1' : null },
      text: async () => JSON.stringify({ data: [{ domain: 'uberbond.site' }], meta: { request_id: 'req_1' } })
    };
  };
  const client = createWinnrApiClient({
    token: 'wnr_account_abcdefghijklmnopqrstuvwx',
    authorized: true,
    termsCompatible: true,
    evidenceRef: 'support-confirmation:pending-final',
    fetchImpl
  });
  const result = await client.listDomains();
  assert.equal(result.ok, true);
  assert.equal(result.providerCalls, 1);
  assert.equal(seen.url.endsWith('/v1/domains'), true);
  assert.equal(seen.options.headers.Authorization.startsWith('Bearer wnr_'), true);
  assert.equal(JSON.stringify(result).includes('abcdefghijklmnopqrstuvwx'), false);
});

test('Winnr writes require explicit per-call authority and never blind-retry uncertain writes', async () => {
  let calls = 0;
  const client = createWinnrApiClient({
    token: 'wnr_account_abcdefghijklmnopqrstuvwx',
    authorized: true,
    termsCompatible: true,
    evidenceRef: 'policy:verified',
    fetchImpl: async () => { calls += 1; throw new Error('network-cut'); }
  });
  const blocked = await client.createMailbox({ domain: 'uberbond.site', username: 'sam', name: 'Sam' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.providerCalls, 0);

  const uncertain = await client.createMailbox({
    domain: 'uberbond.site',
    username: 'sam',
    name: 'Sam',
    writeAuthorized: true
  });
  assert.equal(uncertain.status, 'UBERWINNR_WRITE_OUTCOME_UNCERTAIN');
  assert.equal(uncertain.automaticRetryAuthorized, false);
  assert.equal(calls, 1);
});

test('Winnr events normalize reply, bounce, complaint and relay evidence without inventing authority', () => {
  const event = normalizeWinnrEvent({
    id: 'evt_1',
    type: 'message.relayed',
    created: '2026-10-01T20:00:00Z',
    data: {
      original_message_id: '<ours@example.com>',
      provider_message_id: '<provider@example.net>',
      provider: 'opaque-upstream',
      recipient: 'buyer@example.com',
      sender: 'sam@uberbond.site',
      sending_domain: 'uberbond.site'
    }
  });
  assert.equal(event.factType, 'MESSAGE_ID_MAPPING_OBSERVED');
  assert.equal(event.externalEffectAuthority, 'NONE');
  assert.equal(event.upstreamProvider, 'opaque-upstream');
});

test('post-purchase checklist keeps provider warmup optional', () => {
  const result = compileWinnrPostPurchaseChecklist({
    domains: ['uberbond.site'],
    mailboxesPerDomain: 1
  });
  assert.equal(result.providerWarmupAddonRequired, false);
  assert.equal(result.spendAuthorized, false);
  assert.ok(result.phases.includes('ENABLE_UBERWARM2_EVIDENCE_RAMP'));
});


test('Winnr owned-domain and credential-export atoms use documented endpoints and require write authority', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ data: { ok: true } })
    };
  };
  const client = createWinnrApiClient({
    token: 'wnr_account_abcdefghijklmnopqrstuvwx',
    authorized: true,
    termsCompatible: true,
    evidenceRef: 'winnr-mcp:MIT:bcec6bcc',
    fetchImpl
  });

  const blocked = await client.connectOwnedDomains({ domains: ['uberbond.site'] });
  assert.equal(blocked.status, 'UBERWINNR_WRITE_REFUSED');
  assert.equal(calls.length, 0);

  const connected = await client.connectOwnedDomains({
    domains: ['uberbond.site'],
    manualDns: true,
    writeAuthorized: true
  });
  assert.equal(connected.ok, true);
  assert.equal(calls[0].url.endsWith('/v1/domains/connect'), true);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    domains: ['uberbond.site'],
    manual_dns: true
  });

  const exported = await client.exportMailboxes({
    format: 'default',
    domains: ['uberbond.site'],
    writeAuthorized: true
  });
  assert.equal(exported.ok, true);
  assert.equal(calls[1].url.endsWith('/v1/export'), true);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    format: 'default',
    domains: ['uberbond.site']
  });
});

test('Winnr DNS verification remains an explicit consequential provider write', async () => {
  let calls = 0;
  const client = createWinnrApiClient({
    token: 'wnr_account_abcdefghijklmnopqrstuvwx',
    authorized: true,
    termsCompatible: true,
    evidenceRef: 'winnr-mcp:MIT:54cbacdf',
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ data: { status: 'complete' } })
      };
    }
  });

  const blocked = await client.verifyDns({ domainId: 'dom_123' });
  assert.equal(blocked.status, 'UBERWINNR_WRITE_REFUSED');
  assert.equal(calls, 0);

  const allowed = await client.verifyDns({ domainId: 'dom_123', writeAuthorized: true });
  assert.equal(allowed.ok, true);
  assert.equal(calls, 1);
});
