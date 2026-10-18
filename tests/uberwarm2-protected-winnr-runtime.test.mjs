import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2ProtectedWinnrRuntime } from '../src/uberwarm2-protected-winnr-runtime.mjs';
import { createWinnrApiClient } from '../src/uberwinnr-adapter.mjs';

const at = Date.parse('2026-10-17T00:00:00.000Z');
const sender = 'owner@owned.example';
function getClient({ partial = false, stale = false, paused = false } = {}) {
  const calls = [];
  const reply = (data, name) => ({
    ok: true, data, pagination: { has_more: partial },
    receipt: { responseDigest: 'sha256:provider-' + name }
  });
  const client = {
    async listAllMailboxes() {
      calls.push('mailboxes');
      return reply([{ id: 'mailbox-1', email: sender, domain: 'owned.example',
        connected: true, paused, quarantined: false,
        placementQuarantine: false, policyCompatible: true }], 'mailboxes');
    },
    async listAllDomains() {
      calls.push('domains');
      return reply([{ id: 'domain-1', domain: 'owned.example' }], 'domains');
    },
    async getDnsStatus({ domainId }) {
      calls.push('dns');
      assert.equal(domainId, 'domain-1');
      return { ok: true, data: { domainId, domain: 'owned.example', ready: true,
        observedAt: new Date(at - (stale ? 500000 : 1000)).toISOString() },
        receipt: { responseDigest: 'sha256:provider-dns' } };
    }
  };
  return { client, calls };
}

test('provider observations feed an integrated preflight but never grant send authority', async () => {
  const { client, calls } = getClient();
  const runtime = createUberWarm2ProtectedWinnrRuntime({ client, clock: () => at });
  assert.equal(runtime.sendAuthority, 'NONE');
  assert.equal(runtime.configured, false);
  assert.equal(runtime.ready, false);
  const result = await runtime.inspectProviderReadOnly({ email: sender, at });
  assert.equal(result.ok, true);
  assert.equal(result.observation.healthRowEligible, true);
  assert.deepEqual(calls, ['mailboxes', 'domains', 'dns']);
  assert.equal(await runtime.verifyCurrentSenderHealth(sender, at), false);
  assert.equal(await runtime.verifyCurrentSeedConsent('receiver@example.org', 'probe-one', at), false);
  assert.equal('client' in runtime, false);
  assert.equal('send' in runtime, false);
});

test('partial inventory, stale DNS, quarantine and absent client fail closed', async () => {
  for (const [fixture, code] of [
    [{ partial: true }, 'mailbox-inventory-partial-or-unusable'],
    [{ stale: true }, 'provider-dns-receipt-stale-or-unverified']
  ]) {
    const { client } = getClient(fixture);
    const runtime = createUberWarm2ProtectedWinnrRuntime({ client, clock: () => at });
    const result = await runtime.inspectProviderReadOnly({ email: sender, at });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes(code));
  }
  const { client } = getClient({ paused: true });
  const runtime = createUberWarm2ProtectedWinnrRuntime({ client, clock: () => at });
  const result = await runtime.inspectProviderReadOnly({ email: sender, at });
  assert.equal(result.ok, true);
  assert.equal(result.observation.healthRowEligible, false);
  const absent = createUberWarm2ProtectedWinnrRuntime();
  assert.equal(absent.configured, false);
  assert.equal((await absent.inspectProviderReadOnly({ email: sender, at })).ok, false);
});

test('the Winnr client used for diagnostics exposes documented GET reads, no implied writes', async () => {
  const requests = [];
  const client = createWinnrApiClient({
    token: 'wnr_test_only_not_real', authorized: true, termsCompatible: true,
    evidenceRef: 'synthetic-fixture', fetchImpl: async (url, init) => {
      requests.push({ url, method: init.method });
      return {
        ok: true, status: 200, headers: { get: () => null },
        text: async () => JSON.stringify({ data: [], pagination: { has_more: false } })
      };
    }
  });
  assert.equal(client.ok, true);
  const results = await Promise.all([
    client.getAccount(), client.listAllMailboxes(), client.listAllDomains()
  ]);
  assert.ok(results.every(r => r.ok && r.receipt?.responseDigest));
  assert.deepEqual(requests.map(r => r.method), ['GET', 'GET', 'GET']);
  assert.ok(requests.every(r => r.url.startsWith('https://api.winnr.app/v1/')));
});


test('live-shaped Winnr status-only GET plus separate signed local hold clears health but cannot mint send rights',async()=>{
  const client={
    listAllMailboxes:async()=>({ok:true,data:[{id:'mailbox-1',email:sender,domain:'owned.example',status:'active'}],pagination:{has_more:false},receipt:{responseDigest:'sha256:mailboxes'}}),
    listAllDomains:async()=>({ok:true,data:[{id:'domain-1',domain:'owned.example'}],pagination:{has_more:false},receipt:{responseDigest:'sha256:domains'}}),
    getDnsStatus:async()=>({ok:true,data:{domainId:'domain-1',domain:'owned.example',ready:true,observedAt:new Date(at).toISOString()},receipt:{responseDigest:'sha256:dns'}})
  };
  const row=extra=>({email:sender,domain:'owned.example',observedAt:new Date(at).toISOString(),evidenceRef:'signed:local-test',...extra});
  let state={held:false,suppressed:false,signed:true,verified:true,paused:false,quarantined:false,placementQuarantine:false,policyCompatible:true};
  const runtime=createUberWarm2ProtectedWinnrRuntime({client,clock:()=>at,transportMode:'WINNR_INBOX_HTTPS_API',trustedReaders:{
    readVerifiedHttpsTransport:async()=>[row({authenticated:true,signed:true,transportAuthorized:true,secure:true,termsCompatible:true,senderIdentityVerified:true,providerWritePermissionVerified:true,submissionEndpoint:'WINNR_INBOX_HTTPS_API',authorizedPurpose:'OWNER_CONTROLLED_PLACEMENT_PROBE'})],
    readLocalHold:async()=>[row({...state})],
    readVerifiedDnsAlignment:async()=>[row({aligned:true,signed:true})],
    readAuthenticatedConsent:async()=>[],readCurrentReceiveReady:async()=>[],readSuppression:async()=>[]
  }});
  const observation=await runtime.inspectProviderReadOnly({email:sender,at});
  assert.equal(observation.ok,true);
  assert.equal(observation.observation.healthRowEligible,false);
  assert.equal(await runtime.verifyCurrentSenderHealth(sender,at),true);
  assert.equal(await runtime.verifyCurrentSeedConsent('seed@owned.example','one-shot',at),false);
  assert.equal(runtime.sendAuthority,'NONE');assert.equal(runtime.ready,false);
  state={...state,quarantined:true};
  assert.equal(await runtime.verifyCurrentSenderHealth(sender,at),false);
});
