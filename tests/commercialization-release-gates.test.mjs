import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCommercialRelease } from '../scripts/commercialization-release-gates.mjs';
const quality=JSON.parse(readFileSync('artifacts/commercialization/quality-eval-2026-10.json','utf8'));
const economics=JSON.parse(readFileSync('artifacts/commercialization/unit-economics-2026-10.json','utf8'));
test('current quality and provider unknowns impose hard Store and money release holds',()=>{
 const r=evaluateCommercialRelease({quality,economics});
 assert.equal(r.status,'HOLD_NOT_READY');
 assert.equal(r.gates.matchedOriginalSourceCount,3);
 assert.equal(r.gates.humanAcceptedFindings,0);
 assert.equal(r.gates.targetHumanAcceptedFindings,20);
 assert.equal(r.gates.independentAccuracyAcceptance,'FAILED');
 assert.equal(r.gates.clearedContributionProfitUsd,0);
 assert.equal(r.gates.externalEffectAuthority,'NONE');
 assert.ok(r.actionsProhibited.includes('outbound'));
 assert.ok(r.actionsProhibited.includes('publish'));
});
test('fabricating 20 human counts never independently authenticates reviewer or cash',()=>{
 const candidate=structuredClone(quality);
 candidate.independentlyHumanVerified=20;
 const r=evaluateCommercialRelease({quality:candidate,economics});
 assert.equal(r.status,'HOLD_NOT_READY');
 assert.equal(r.gates.independentAccuracyAcceptance,'REQUIRES_EXTERNAL_SOURCE_VALIDATION');
 assert.equal(r.gates.realBuyerDeliveryAcceptance,'NOT_VERIFIED');
 assert.equal(r.gates.independentPaymentAndSecurityReview,'NOT_VERIFIED');
});
test('malformed or absent human count fails closed',()=>{
 for(const bad of [undefined,null,NaN,-1,'20']){
  const candidate=structuredClone(quality);
  if(bad===undefined)delete candidate.independentlyHumanVerified;else candidate.independentlyHumanVerified=bad;
  const r=evaluateCommercialRelease({quality:candidate,economics});
  assert.equal(r.status,'HOLD_NOT_READY');
  assert.notEqual(r.gates.independentAccuracyAcceptance,'PASS');
 }
});
