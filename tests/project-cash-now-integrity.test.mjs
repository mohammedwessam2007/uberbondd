import test from 'node:test';
import assert from 'node:assert/strict';
import { appendRealityEntry, summarizeReality, verifyRealityChain, evidenceProblems } from '../src/revenue-reality-ledger.mjs';
import { canonicalPaymentTruthDigest } from '../src/lead-path-sprint-fulfillment.mjs';
import { classifyRail } from '../src/money-entry-rails.mjs';
import { allocateCapital } from '../src/capital-allocation-intelligence.mjs';
import { recordPaperDecision, verifyPaperChain } from '../src/quant-paper-ledger.mjs';
import { runExperiment } from '../src/quant-research-protocol.mjs';
import { diffApiContracts } from '../src/cash-now-api-contract-diff.mjs';
import { compareProcurementNotices } from '../src/cash-now-procurement-amendments.mjs';
const at='2026-10-21T00:00:00Z';
const sim=(amountCents,currency='USD',ledger=[])=>appendRealityEntry(ledger,{tier:'SIMULATED',mechanismId:'M',amountCents,currency,evidence:{experimentReceiptSha256:'a'.repeat(64)},at});
test('forged digest and forged payment status cannot unlock cleared profit',()=>{
 const t={status:'PROVIDER_CLEARED_PAYMENT_PROVEN',stages:{PAYMENT_RETAINED:{status:'PROVEN'}}};t.truthDigest=canonicalPaymentTruthDigest(t);
 const row={tier:'CLEARED_CONTRIBUTION_PROFIT',mechanismId:'FAKE',amountCents:1000000,evidence:{paymentTruth:t,attributableCostsCents:0},at};
 assert.equal(appendRealityEntry([],row).ok,false);
 assert.ok(evidenceProblems('COLLECTED_RECEIPTS',{providerEventRef:'charge-real-looking',counterparty:'x'}).length>0);
 assert.ok(evidenceProblems('REALIZED_TRADING',{venue:'exchange',fillIds:['fill123'],founderCapitalAuthorizationRef:'approved',feesCents:1}).length>0);
 assert.ok(evidenceProblems('CLEARED_CONTRIBUTION_PROFIT',row.evidence,{verifyClearedPayment:()=>{throw Error('provider unavailable')}}).length>0);
 assert.equal(evidenceProblems('CLEARED_CONTRIBUTION_PROFIT',row.evidence).some(x=>x.includes('independent trusted')),true);
});
test('mixed USD/EGP summaries never sum minor units as one currency',()=>{
 const first=sim(1000,'USD');const second=sim(100000,'EGP',first.ledger);const summary=summarizeReality(second.ledger);
 assert.equal(summary.chain.ok,true);assert.equal(summary.byTier.SIMULATED.amountCents,null);
 assert.deepEqual(summary.byTier.SIMULATED.byCurrency,{USD:1000,EGP:100000});
 assert.equal(sim(10,'usd').ok,false);
});
test('unsupported business activity cannot be laundered through valid payout route',()=>{
 assert.equal(classifyRail('crypto trading revenue via PayPal').verdict,'RAIL_BLOCKED');
 assert.equal(classifyRail('Stripe or PayPal').verdict,'RAIL_BLOCKED');
 assert.equal(classifyRail('Apify Store paid Actor via Paypal').verdict,'RAIL_PLAUSIBLE');
});
test('allocator ranks risk-adjusted profit per founder hour, not largest headline dollars',()=>{
 const c=(id,profit,hours)=>({id,monthlyContributionUsd:{p10:profit,p50:profit,p90:profit},capitalRequiredUsd:0,worstCredibleLossUsd:0,founderHoursPerMonth:hours,correlationGroup:'same'});
 const a=allocateCapital({candidates:[c('slow',200,20),c('fast',50,1)],levels:[0],founderHoursPerMonth:24});
 assert.equal(a.scenarios[0].portfolio[0].id,'fast');assert.equal(a.scenarios[0].riskAdjustedUsdPerFounderHour,50);
});
test('locally regenerated backdated hash chain cannot prove forward paper evidence',()=>{
 const chain=recordPaperDecision([],{strategy:'faked',positions:{A:1},quotes:{A:{price:1,observedAt:'2020-01-01T00:00:00Z'}},decidedAt:'2020-01-01T00:00:00Z'});
 assert.equal(verifyPaperChain(chain).ok,true);assert.equal(verifyPaperChain(chain).forwardChronologyProven,false);
 assert.ok(evidenceProblems('PAPER',{paperLedgerHeadSha256:verifyPaperChain(chain).head,signalsRecordedBeforeOutcome:1}).length>0);
});
test('cost stress uses each fold selected before its test, not eventual holdout parameter',()=>{
 const timestamps=Array.from({length:24*31*8},(_,i)=>Date.UTC(2025,0,1)+3600000*i);
 const family={name:'STRESS_FROZEN',hypothesis:'cost fold replay',grid:[{id:'A'},{id:'B'}],build:p=>({legs:[{name:'x',returns:timestamps.map((_,i)=> p.id==='A' ? (i<24*31*3?0.002:-0.004) : (i<24*31*3?-0.002:0.004)),costBps:0}],decide:()=>({x:1})})};
 const stressBuild=p=>({legs:[{name:'x',returns:timestamps.map((_,i)=>p.id==='A' ? (i<24*31*3?0.002:-0.004) : (i<24*31*3?-0.002:0.004)),costBps:1}],decide:()=>({x:1})});
 const result=runExperiment({family,timestamps,holdoutFrom:'2025-07',trainMonths:2,testMonths:1,stressBuild});
 assert.ok(result.walkForward.folds.length>1);
 assert.ok(result.outOfSampleUnderStressCosts);
 assert.ok(new Set(result.walkForward.folds.map(f=>f.params.id)).size>1,'fixture must select different params across history');
});
test('OpenAPI delta can identify removed endpoint and new required input without network',()=>{
 const a={openapi:'3.1.0',paths:{'/v1/x':{get:{responses:{200:{},404:{}}}}}};
 const b={openapi:'3.1.0',paths:{'/v1/x':{get:{parameters:[{in:'query',name:'token',required:true}],responses:{200:{}}}}}};
 const d=diffApiContracts(a,b);assert.equal(d.ok,true);
 assert.deepEqual(d.findings.map(x=>x.kind),['NEW_REQUIRED_PARAMETER','RESPONSE_REMOVED']);assert.match(d.evidenceClass,/LOCAL/);
 assert.equal(diffApiContracts({},b).status,'ABSTAIN');
});
test('bilingual notice differences retain provenance and do not pretend official verification',()=>{
 const a={noticeId:'public-42',sourceUrl:'https://example.org/tender/42',observedAt:'2026-10-20T10:00:00Z',deadlineAt:'2026-11-01T10:00:00Z',requirements:[{id:'R',locale:'ar',body:'شهادة مطلوبة'},{id:'R',locale:'en',body:'certificate required'}],budget:null};
 const b={...a,observedAt:'2026-10-21T10:00:00Z',deadlineAt:'2026-11-05T10:00:00Z',requirements:[{id:'R',locale:'ar',body:'شهادة جديدة'},{id:'R',locale:'en',body:'new certificate'}]};
 const d=compareProcurementNotices(a,b);assert.equal(d.ok,true);assert.equal(d.deltas.length,3);assert.equal(d.requiresHumanSourceValidation,true);assert.equal(d.translationPerformed,false);
 assert.equal(compareProcurementNotices(b,a).status,'ABSTAIN');
});
