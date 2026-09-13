import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTotalCommercialGenomeOfferUniverseWealth } from '../src/uberbond-total-commercial-genome-offer-universe-and-wealth-engine.mjs';

const verified=value=>({value,claimType:'VERIFIED_FACT'});
const candidate={
  id:'opp-total-commercial-genome',name:'Total Commercial Genome Candidate',category:'b2b-services',
  buyer:verified('agencies'),pain:verified('revenue leakage'),value:verified('recovered revenue'),
  acquisition:verified('partner channel'),trust:verified('evidence receipt'),pricing:verified('fixed fee'),
  paymentTiming:verified('upfront'),fulfillment:verified('automated audit'),recurringTrigger:verified('monthly'),
  retention:verified(80),expansion:verified('portfolio'),partnerMultiplier:verified('multi-client'),
  dataAsset:verified('outcome ledger'),automationPotential:verified(90),platformDependency:verified('low'),regulatoryBurden:verified('low')
};
const evidence=['evidence:buyer-observation','receipt:mechanism-proof'];

test('whole commercial genome composes into bounded offer hypotheses and wealth search without external authority',()=>{
  const result=compileTotalCommercialGenomeOfferUniverseWealth({
    candidate,evidenceRefs:evidence,buyer:'agencies',signals:[{id:'signal-1',buyerClasses:['B2B_COMPANY']}],
    wealthCandidates:[],maxSearchCells:12,date:'2026-09-13T00:00:00Z'
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'TOTAL_COMMERCIAL_GENOME_OFFER_UNIVERSE_WEALTH_COMPILED');
  assert.ok(result.commercialGenome.completeness>0);
  assert.ok(result.offerUniverse.atomCount>=2);
  assert.ok(result.offerUniverse.candidateCount>=1);
  assert.ok(result.offerUniverse.candidates.every(row=>row.status==='HYPOTHESIS'&&row.evidenceStatus==='UNPROVEN_COMBINATION'));
  assert.equal(result.wealth.searchLattice.cellCount,12);
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.capitalDeploymentAuthority,'NONE');
  assert.equal(result.moneyClaimAuthority,'NONE');
  assert.equal(result.externalEffectLedger.messages,0);
  assert.equal(result.externalEffectLedger.spendCents,0);
});

test('missing commercial input stays missing rather than fabricating an offer universe',()=>{
  const result=compileTotalCommercialGenomeOfferUniverseWealth({maxSearchCells:7});
  assert.equal(result.ok,true);
  assert.equal(result.status,'NO_COMMERCIAL_GENOME_INPUT');
  assert.equal(result.commercialGenome,null);
  assert.equal(result.offerUniverse.candidateCount,0);
  assert.equal(result.wealth.searchLattice.cellCount,7);
  assert.equal(result.externalEffectAuthority,'NONE');
});

test('wealth layer still cannot turn hypotheses into canaries without admissible positive economics',()=>{
  const result=compileTotalCommercialGenomeOfferUniverseWealth({
    candidate,evidenceRefs:evidence,buyer:'agencies',
    wealthCandidates:[{id:'fake-rich',expectedGross:999999,cashAtRisk:0}]
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.wealth.portfolio.canaries,[]);
  assert.equal(result.wealth.portfolio.capitalDeploymentAuthority,'NONE');
  assert.match(result.truthBoundary,/NO MONEY COUNTS/);
});
