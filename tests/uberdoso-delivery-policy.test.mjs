import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberDosoDeliveryEligibility } from '../src/uberdoso-delivery-policy.mjs';

test('permissioned relationship with evidence produces only an eligibility receipt',()=>{
  const result=compileUberDosoDeliveryEligibility({recipient:'buyer@example.com',relationship:'EXPLICIT_OPT_IN',evidenceRefs:['receipt:signup-123'],purpose:'requested update',date:'2026-09-13T00:00:00Z'});
  assert.equal(result.ok,true);
  assert.equal(result.status,'UBERDOSO_PERMISSIONED_DELIVERY_ELIGIBLE');
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.externalEffectLedger.messages,0);
  assert.equal(result.relationship,'EXPLICIT_OPT_IN');
  assert.equal(result.evidenceRefs[0],'receipt:signup-123');
});

test('unknown or absent relationship is refused even when an email address exists',()=>{
  const result=compileUberDosoDeliveryEligibility({recipient:'person@example.com',relationship:'UNKNOWN',evidenceRefs:['receipt:public-page']});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('permissioned-relationship-required'));
});

test('relationship label without evidence is refused',()=>{
  const result=compileUberDosoDeliveryEligibility({recipient:'person@example.com',relationship:'TRANSACTIONAL'});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('relationship-evidence-required'));
});

test('user-initiated relationship is admissible but still grants no send authority',()=>{
  const result=compileUberDosoDeliveryEligibility({recipient:'support@example.com',relationship:'USER_INITIATED',evidenceRefs:['receipt:inbound-message-7']});
  assert.equal(result.ok,true);
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.externalEffectLedger.messages,0);
});
