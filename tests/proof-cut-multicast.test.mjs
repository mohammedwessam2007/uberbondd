import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash as h } from '../src/crown-closure.mjs';
import { factorFrontierResidualCut, settleFrontierResidualCut } from '../src/frontier-residual-cut.mjs';

const now=Date.parse('2026-09-30T20:00:00Z');
const obligation={taskClass:'FACT',crownRevision:'opus-5.5-r1',inputHash:h('leaf'),dependencies:{s:h('s')},qualityContract:{exact:true},contractHash:h('c'),applicability:{domain:'one'},invalidators:{revoked:false},freshnessClass:'BOUNDED'};
const program=id=>({id,roots:['artifact'],nodes:[{id:'fact',resolved:false,obligation},{id:'artifact',resolved:false,dependencies:['fact']}]});
const adjudication=key=>({status:'ADMITTED_CROWN_ADJUDICATION',key,obligation,decision:{answer:42},evidenceRef:'crown://receipt/1',expiresAt:'2026-10-01T00:00:00Z',crownRevision:obligation.crownRevision,dependencies:obligation.dependencies,qualityContract:obligation.qualityContract});
test('one exact admitted Crown cut multicasts to 1000 distinct roots without pretending roots are closed',()=>{
 const plan=factorFrontierResidualCut(Array.from({length:1000},(_,i)=>program('p'+i)));
 const out=settleFrontierResidualCut({plan,adjudications:[adjudication(plan.cuts[0].key)],now});
 assert.equal(out.adjudicationsPerformed,1);assert.equal(out.settledConsumerCount,1000);assert.equal(out.semanticMulticastFactor,1000);assert.equal(out.crownCallsAvoidedAgainstNaivePerConsumer,999);
 assert.ok(out.consumerSettlements.every(x=>x.downstreamClosureRequired===true));assert.equal(out.economicMultiplierClaim,'NONE_WITHOUT_PROVABLE_REFERENCE_ECONOMICS');
});
test('changed dependency cannot consume old adjudication',()=>{
 const plan=factorFrontierResidualCut([program('p')]);const row=adjudication(plan.cuts[0].key);row.dependencies={s:h('changed')};
 assert.throws(()=>settleFrontierResidualCut({plan,adjudications:[row],now}),/dependency-mismatch/);
});
test('expired or wrong Crown revision adjudication fails closed',()=>{
 const plan=factorFrontierResidualCut([program('p')]);
 const expired=adjudication(plan.cuts[0].key);expired.expiresAt='2026-09-30T19:59:00Z';
 assert.throws(()=>settleFrontierResidualCut({plan,adjudications:[expired],now}),/expired/);
 const wrong=adjudication(plan.cuts[0].key);wrong.crownRevision='other';
 assert.throws(()=>settleFrontierResidualCut({plan,adjudications:[wrong],now}),/crown-revision/);
});
