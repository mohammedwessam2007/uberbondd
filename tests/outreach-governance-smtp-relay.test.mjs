import test from 'node:test';
import assert from 'node:assert/strict';
import { providerRoutePolicy } from '../src/outreach-governance.mjs';

test('SMTP relay admits permissioned canaries but not cold routes by transport name alone',()=>{
  assert.equal(providerRoutePolicy('smtp-relay','EXPLICIT_CONSENT').ok,true);
  assert.equal(providerRoutePolicy('smtp-relay','REQUESTED_INFORMATION').ok,true);
  assert.equal(providerRoutePolicy('smtp-relay','PUBLIC_BUSINESS_CONTACT').ok,false);
  assert.equal(providerRoutePolicy('smtp-relay','CONSPICUOUS_PUBLICATION').ok,false);
});
