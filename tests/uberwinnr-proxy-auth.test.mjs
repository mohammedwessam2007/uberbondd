import test from 'node:test';
import assert from 'node:assert/strict';
import { createWinnrApiClient, WINNR_API_BASE } from '../src/uberwinnr-adapter.mjs';

function recordingFetch(body = { data: { plan: 'startup' } }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, headers: { ...(init.headers || {}) }, method: init.method });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(body)
    };
  };
  return { calls, fetchImpl };
}

const AUTH = { authorized: true, termsCompatible: true, evidenceRef: 'owner-mission:UBERBOND_WINNR_FLEET_FINAL_INTEGRATION_2026-10-13' };

test('proxy-injected mode sends no Authorization header and holds no token', async () => {
  const { calls, fetchImpl } = recordingFetch();
  const client = createWinnrApiClient({ authMode: 'proxy-injected', ...AUTH, fetchImpl });
  assert.equal(client.ok, true);
  assert.equal(client.authMode, 'proxy-injected');
  assert.equal(client.token, 'PROXY_INJECTED');
  const result = await client.getAccount();
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${WINNR_API_BASE}/account`);
  assert.equal('Authorization' in calls[0].headers, false);
  assert.equal(calls[0].method, 'GET');
});

test('proxy-injected mode refuses an inline token rather than silently preferring either credential', () => {
  const client = createWinnrApiClient({ authMode: 'proxy-injected', token: 'wnr_inline_should_not_be_here', ...AUTH, fetchImpl: recordingFetch().fetchImpl });
  assert.equal(client.ok, false);
  assert.ok(client.reasonCodes.includes('proxy-injected-mode-forbids-inline-token'));
});

test('default bearer mode still requires an explicit wnr_ token', () => {
  const client = createWinnrApiClient({ token: '', ...AUTH, fetchImpl: recordingFetch().fetchImpl });
  assert.equal(client.ok, false);
  assert.ok(client.reasonCodes.includes('winnr-api-token-required'));
});

test('bearer mode with a wnr_ token sends that token and only that token', async () => {
  const { calls, fetchImpl } = recordingFetch();
  const client = createWinnrApiClient({ token: 'wnr_test_token_value_0000', ...AUTH, fetchImpl });
  assert.equal(client.ok, true);
  assert.equal(client.authMode, 'bearer');
  assert.notEqual(client.token, 'wnr_test_token_value_0000');
  await client.getAccount();
  assert.equal(calls[0].headers.Authorization, 'Bearer wnr_test_token_value_0000');
});

test('an unknown auth mode is refused rather than falling back to bearer', () => {
  const client = createWinnrApiClient({ authMode: 'anonymous', token: 'wnr_x', ...AUTH, fetchImpl: recordingFetch().fetchImpl });
  assert.equal(client.ok, false);
  assert.ok(client.reasonCodes.includes('winnr-auth-mode-unsupported'));
});

test('proxy-injected writes remain gated by explicit write authorization', async () => {
  const { calls, fetchImpl } = recordingFetch();
  const client = createWinnrApiClient({ authMode: 'proxy-injected', ...AUTH, fetchImpl });
  const refused = await client.exportMailboxes({ domains: ['example-startup.co'] });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 'UBERWINNR_WRITE_REFUSED');
  assert.equal(calls.length, 0);
});
