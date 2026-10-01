import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerSendingDomain, computeSendingDomainState, OWNERSHIP_STATUSES } from '../src/sending-domain-registry.mjs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('provider-controlled sending domain is represented without owner-ownership fiction',()=>{
  assert.ok(OWNERSHIP_STATUSES.includes('PROVIDER_CONTROL_CONFIRMED'));
  const registered=registerSendingDomain({
    domainId:'winnr-domain-1',
    workspaceId:'uberbond-outreach',
    domain:'pilot.example',
    ownershipStatus:'PROVIDER_CONTROL_CONFIRMED',
    registrar:'winnr-managed',
    provider:'winnr-prewarmed',
    purpose:'outreach',
    simulation:true,
    date:new Date('2026-10-01T21:00:00Z')
  });
  assert.equal(registered.ok,true);
  const state=computeSendingDomainState([registered.event],{date:new Date('2026-10-01T21:00:00Z')});
  assert.equal(state.state,'DNS_INCOMPLETE');
  assert.equal(state.ownershipStatus,'PROVIDER_CONTROL_CONFIRMED');
});

test('Winnr is wired from environment through canonical provider resolver',()=>{
  const config=read('src/config.mjs');
  const contract=read('src/provider-adapter-contract.mjs');
  assert.match(config,/WINNR_API_TOKEN/);
  assert.match(config,/WINNR_ACCOUNT_AUTHORIZED/);
  assert.match(config,/WINNR_TERMS_COMPATIBLE/);
  assert.match(config,/WINNR_TERMS_EVIDENCE_REF/);
  assert.match(contract,/createWinnrInfrastructureAdapter/);
  assert.match(contract,/['"]winnr['"]/);
});

test('production server exposes read-only Winnr preflight and guarded post-purchase import',()=>{
  const server=read('server-core.mjs');
  assert.match(server,/createWinnrApiClient/);
  assert.match(server,/\/api\/providers\/winnr\/prepurchase/);
  assert.match(server,/\/api\/providers\/winnr\/prewarmed/);
  assert.match(server,/\/api\/providers\/winnr\/export/);
  assert.match(server,/\/api\/providers\/winnr\/postpurchase\/import/);
  assert.match(server,/confirmCredentialImport/);
  assert.match(server,/confirmRouteUse/);
  assert.match(server,/winnr\.listMyPrewarmed\(\)/);
});

test('production server has no automatic Winnr purchase endpoint',()=>{
  const server=read('server-core.mjs');
  assert.equal(server.includes('/api/providers/winnr/purchase'),false);
  assert.equal(server.includes('/api/providers/winnr/prewarmed/purchase'),false);
  assert.equal(server.includes('winnr.purchasePrewarmed('),false);
});
