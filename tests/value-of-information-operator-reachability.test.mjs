import test from 'node:test';
import assert from 'node:assert/strict';
import { runValueOfInformationDoctor } from '../scripts/value-of-information-doctor.mjs';

test('generic value-of-information governor has a zero-effect operator entry point outside founder-private reachability',()=>{
  const out=runValueOfInformationDoctor();
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.status,'VOI_ZERO_EFFECT_OPERATOR_PATH_READY');
  assert.equal(out.businessEffectAuthority,'NONE');
  assert.deepEqual(out.externalEffectLedger,{customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
  assert.match(out.executionBoundary,/DOES_NOT_EXECUTE/);
});
