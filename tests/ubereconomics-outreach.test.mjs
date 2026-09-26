import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOutreachEconomics } from '../src/ubereconomics-outreach.mjs';
test('computes cost per positive reply and cleared contribution without inventing unknown cost',()=>{
 const r=compileOutreachEconomics({
  prospects:[{id:'p1',draft:'x',contact:{verified:'valid'},replyLabel:'positive',opportunityStage:'paid'},{id:'p2',draft:'x'}],
  messages:[{prospectId:'p1'},{prospectId:'p2'}],
  replies:[{prospectId:'p1',classification:{label:'positive'}}],
  orders:[{prospectId:'p1',status:'paid',amountCents:45000}],
  costReceipts:[{stage:'send',provider:'maildoso',costCents:100},{stage:'enrichment',provider:'internal',costCents:null}],
  ownerMinutes:10
 });
 assert.equal(r.counts.sent,2); assert.equal(r.counts.positiveReplies,1);
 assert.equal(r.costs.totalCostCents,100); assert.equal(r.costs.unknownCostCount,1);
 assert.equal(r.unitEconomics.costPerPositiveReplyCents,100);
 assert.equal(r.revenue.contributionCents,44900);
 assert.equal(r.revenue.contributionProfitPerOwnerMinuteCents,4490);
});
test('no positive replies yields null unit cost rather than fake infinity or zero',()=>{
 const r=compileOutreachEconomics({messages:[{}],costReceipts:[{stage:'send',costCents:50}]});
 assert.equal(r.unitEconomics.costPerPositiveReplyCents,null);
});

test('absence of cost receipts is unknown coverage rather than proven free operation',()=>{
 const r=compileOutreachEconomics({messages:[{}]});
 assert.equal(r.costs.totalCostCents,0);
 assert.equal(r.costs.costCoverageStatus,'NO_COST_RECEIPTS');
});
