import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEvidenceAcquisitionPlan, compileEvidenceCacheEntry } from '../src/cost-aware-public-evidence-tier.mjs';
import { compileStagedContent, claimReadyContentSql } from '../src/staging-content-repository.mjs';
import { compileProgrammaticFulfillment, normalizeProvisioningReceipt } from '../src/programmatic-fulfillment-router.mjs';
import { proposeProfileWeightUpdates } from '../src/economic-feedback-allocator.mjs';

test('cache wins before any external source',()=>{
  const r=compileEvidenceAcquisitionPlan({targetRef:'acct:1',field:'industry',occurrenceKey:'o1',cache:{hit:true,expired:false,contentHash:'a'.repeat(64)},sources:[{id:'paid',tier:'LICENSED_API',configured:true,allowedPurpose:true,costKnown:true,estimatedCostCents:5}]});
  assert.equal(r.ok,true); assert.equal(r.plan.steps.length,1); assert.equal(r.plan.steps[0].tier,'CACHE');
});

test('browser is blocked until static HTTP insufficiency is observed',()=>{
  const r=compileEvidenceAcquisitionPlan({targetRef:'acct:1',field:'stack',occurrenceKey:'o2',sources:[{id:'browser',tier:'PUBLIC_BROWSER',configured:true,allowedPurpose:true,termsPurposeRef:'t',robotsDecisionRef:'r',publicSourceCheckRef:'p',requiresClientRender:true,observedHttpInsufficient:false}]});
  assert.equal(r.ok,true); assert.equal(r.plan.steps.length,0); assert.match(r.plan.blockedSources[0].reasonCodes.join(','),/browser-requires/);
});

test('cache entry requires hashed evidence and expiry',()=>{
  const r=compileEvidenceCacheEntry({targetRef:'acct:1',field:'industry',sourceId:'official',sourcePolicyRef:'policy:1',contentHash:'b'.repeat(64),observedAt:'2026-08-29T00:00:00Z',expiresAt:'2026-09-01T00:00:00Z',evidenceRef:'evidence:1'});
  assert.equal(r.ok,true);
});

test('staged content is source bound and non-publishing',()=>{
  const r=compileStagedContent({assetType:'VIDEO_SCRIPT',audienceRef:'aud:1',offerRef:'offer:1',profileRef:'profile:1',payload:'Evidence-backed script body',sourceEvidenceRefs:['ev:1'],policyRef:'content:1'});
  assert.equal(r.ok,true); assert.equal(r.content.publicationAuthority,'NONE'); assert.match(claimReadyContentSql(),/SKIP LOCKED/);
});

test('fulfillment rejects raw secret delivery and requires secretless invite modes',()=>{
  const r=compileProgrammaticFulfillment({paymentTruth:{state:'CLEARED_PAYMENT',providerOccurrenceRef:'pay:1',receiptRef:'receipt:1'},fulfillmentRef:'fulfill:1',customerRef:'customer:1',serviceSkuRef:'sku:1',authorityReceiptRef:'auth:1',occurrenceKey:'occ:1',actions:[{type:'PROVISION_API_CLIENT',providerRef:'api:1',configRef:'cfg:1',deliveryMode:'RAW_TOKEN_EMAIL'}]});
  assert.equal(r.ok,false); assert.match(r.reasonCodes.join(','),/secretless-access-delivery-required/);
});

test('fulfillment prepares idempotent secretless provisioning and receipts reconcile uncertainty',()=>{
  const r=compileProgrammaticFulfillment({paymentTruth:{state:'CLEARED_PAYMENT',providerOccurrenceRef:'pay:1',receiptRef:'receipt:1'},fulfillmentRef:'fulfill:1',customerRef:'customer:1',serviceSkuRef:'sku:1',authorityReceiptRef:'auth:1',occurrenceKey:'occ:1',actions:[{type:'CREATE_DASHBOARD_INVITE',providerRef:'dash:1',configRef:'cfg:1',deliveryMode:'MAGIC_LINK'}]});
  assert.equal(r.ok,true); assert.match(r.plan.idempotencyKey,/^fulfill:/);
  const u=normalizeProvisioningReceipt({provider:'dash',providerEventId:'evt1',planId:r.plan.planId,actionType:'CREATE_DASHBOARD_INVITE',status:'UNCERTAIN',providerReceiptRef:'provreceipt:1',observedAt:'2026-08-29T09:00:00Z',receivedAt:'2026-08-29T09:00:01Z'});
  assert.equal(u.receipt.retryDisposition,'BLOCK_RETRY_UNTIL_RECONCILED');
});

test('allocator refuses sensitive targeting dimensions',()=>{
  const r=proposeProfileWeightUpdates({segments:[{profileKey:'x',dimensions:{religion:'x'},exposures:20,qualifiedOutcomes:5,paidAcceptedOutcomes:3,clearedContributionCents:10000,founderMinutes:10,currentWeight:1}]});
  assert.equal(r.ok,false);
});

test('allocator holds sparse data and bounds mature weight changes',()=>{
  let r=proposeProfileWeightUpdates({segments:[{profileKey:'sparse',dimensions:{industry:'hvac'},exposures:4,qualifiedOutcomes:2,paidAcceptedOutcomes:1,clearedContributionCents:1000,founderMinutes:10,currentWeight:1}]});
  assert.equal(r.proposal.updates[0].allocationState,'HOLD_FOR_MORE_EVIDENCE');
  r=proposeProfileWeightUpdates({segments:[{profileKey:'a',dimensions:{industry:'hvac'},exposures:30,qualifiedOutcomes:8,paidAcceptedOutcomes:4,clearedContributionCents:12000,founderMinutes:60,currentWeight:1},{profileKey:'b',dimensions:{industry:'plumbing'},exposures:30,qualifiedOutcomes:6,paidAcceptedOutcomes:3,clearedContributionCents:3000,founderMinutes:60,currentWeight:1}],policy:{maxWeightDeltaPerCycle:.1,minOutcomes:10,minPaidOutcomes:3}});
  assert.equal(r.ok,true); for(const u of r.proposal.updates) assert.ok(Math.abs(u.weightDelta)<=.100001);
});