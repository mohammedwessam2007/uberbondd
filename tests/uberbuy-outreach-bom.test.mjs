import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOutreachBuyList } from '../src/uberbuy-outreach-bom.mjs';

test('with domains and compute already owned the only outreach purchase can be sender substrate',()=>{
 const r=compileOutreachBuyList({
  domainsOwned:30,controlPlaneOwned:true,
  outboundSubstrate:{candidate:'maildoso',acquired:false,authorized:false,configured:false},
  paymentRail:{live:false},
  regulatory:{status:'UNKNOWN'},
  publicContactSupply:{status:'EMPIRICAL_SUPPLY_SHORTFALL'}
 });
 assert.deepEqual(r.summary.mandatoryNewPurchaseIds,[]);\n assert.deepEqual(r.summary.externalAcquisitionIds,['authorized_outbound_substrate']);
 assert.equal(r.summary.recurringOutreachSaasRequired,0);
 assert.equal(r.external.find(x=>x.id==='paid_lead_data').status,'OPTIONAL_UNTIL_EMPIRICAL_SHORTFALL_PROVEN');
});
test('a configured authorized substrate removes the new outreach purchase',()=>{
 const r=compileOutreachBuyList({
  domainsOwned:30,controlPlaneOwned:true,
  outboundSubstrate:{acquired:true,authorized:true,configured:true},
  paymentRail:{live:true},regulatory:{status:'PASSED'},
  publicContactSupply:{status:'OBSERVED_MONTH_COVERED'}
 });
 assert.equal(r.status,'NO_NEW_PURCHASE_REQUIRED');
 assert.equal(r.summary.mandatoryNewPurchaseCount,0);
});
test('regulatory work is never mislabeled as a SaaS purchase',()=>{
 const r=compileOutreachBuyList({domainsOwned:30,controlPlaneOwned:true,outboundSubstrate:{acquired:true,authorized:true,configured:true},regulatory:{status:'UNKNOWN'}});
 const reg=r.external.find(x=>x.id==='regulatory_clearance');
 assert.equal(reg.classification,'EXTERNAL_REGULATORY');
 assert.equal(reg.monthlyPurchaseRequired,false);
});

test('a provider checkout with proven cash requirement appears as the one purchase',()=>{
 const r=compileOutreachBuyList({
  domainsOwned:30,controlPlaneOwned:true,
  outboundSubstrate:{candidate:'provider-x',acquired:false,authorized:false,configured:false,cashRequired:true,observedPriceUsd:22},
  regulatory:{status:'PASSED'},publicContactSupply:{status:'OBSERVED_MONTH_COVERED'}
 });
 assert.deepEqual(r.summary.mandatoryNewPurchaseIds,['authorized_outbound_substrate']);
 assert.equal(r.external.find(x=>x.id==='authorized_outbound_substrate').observedPriceUsd,22);
});
