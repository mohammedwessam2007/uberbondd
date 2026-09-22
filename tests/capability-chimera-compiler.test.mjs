import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCapabilityChimeras, evaluateCapabilityChimeraTournament } from '../src/capability-chimera-compiler.mjs';

const cap=(id,atoms,{deps=[],conflicts=[],edges=[],burdenTokens=0,cost=0,permissions=[],sideEffects=['NONE']}={})=>({
  id,
  capabilityAtoms:atoms.map(atom=>({id:atom})),
  dependencies:deps,
  knownConflicts:conflicts,
  compatibilityEdges:edges,
  contextCost:{tokens:burdenTokens},
  monetaryCost:{cents:cost},
  permissions,
  sideEffects
});
const eligible=(capability,score=1)=>({capability,score,admission:{ok:true,decision:'ELIGIBLE'}});
const retrieval=results=>({ok:true,status:'PROGRESSIVE_RETRIEVAL_COMPLETE',results});

const metrics={taskSuccess:.8,quality:.8,reliability:.8,latencyMs:1000,tokenCost:100,monetaryCostCents:5,founderInterventions:1};
const benchArgs={taskClass:'mission-x',modelId:'model-x',holdoutId:'private-holdout-1',leakChecks:[{passed:true}],securityPassed:true,benchmarkObservedAt:'2026-09-22T20:00:00.000Z',now:new Date('2026-09-22T21:00:00.000Z')};

test('search composes an admitted minimum sufficient bundle',()=>{
 const r=searchCapabilityChimeras({
  requiredAtomIds:['a','b'],
  retrieval:retrieval([eligible(cap('one',['a'])),eligible(cap('two',['b']))])
 });
 assert.equal(r.ok,true);
 assert.equal(r.primary.selectedIds.length,2);
 assert.deepEqual(new Set(r.primary.selectedIds),new Set(['one','two']));
 assert.equal(r.primary.executionAuthority,'NONE');
});

test('search discovers substitute compositions by excluding primary members',()=>{
 const r=searchCapabilityChimeras({
  requiredAtomIds:['a','b'],
  retrieval:retrieval([
    eligible(cap('ab',['a','b']),1),
    eligible(cap('one',['a']),.8),
    eligible(cap('two',['b']),.8)
  ]),
  maxCandidates:4
 });
 assert.equal(r.ok,true);
 assert.ok(r.candidates.some(c=>c.selectedIds.length===1&&c.selectedIds[0]==='ab'));
 assert.ok(r.candidates.some(c=>new Set(c.selectedIds).has('one')&&new Set(c.selectedIds).has('two')));
});

test('unadmitted retrieval results cannot enter composition search',()=>{
 const bad={ok:true,status:'PROGRESSIVE_RETRIEVAL_COMPLETE',results:[{capability:cap('x',['a']),score:1,admission:{ok:false,decision:'REJECTED'}}]};
 const r=searchCapabilityChimeras({requiredAtomIds:['a'],retrieval:bad});
 assert.equal(r.ok,false);
 assert.ok(r.reasonCodes.includes('all-retrieval-results-must-be-admitted-eligible'));
});

test('final pairwise conflict symmetry catches conflict declared only by earlier member',()=>{
 const a=cap('a',['atom-a'],{conflicts:['b']});
 const b=cap('b',['atom-b']);
 const r=searchCapabilityChimeras({requiredAtomIds:['atom-a','atom-b'],retrieval:retrieval([eligible(a,1),eligible(b,.9)])});
 assert.equal(r.ok,false);
 assert.equal(r.status,'CAPABILITY_CHIMERA_NO_SAFE_COMPOSITION');
 assert.ok(r.refusals.some(x=>x.reasonCodes?.includes('pairwise-conflict-detected')));
});

test('dependency gaps are refused instead of silently composing broken bundles',()=>{
 const a=cap('a',['atom-a'],{deps:['missing-runtime']});
 const r=searchCapabilityChimeras({requiredAtomIds:['atom-a'],retrieval:retrieval([eligible(a,1)])});
 assert.equal(r.ok,false);
 assert.ok(r.refusals.some(x=>x.status==='CAPABILITY_DEPENDENCY_GAP'));
});

test('held-out non-regressing and no-more-expensive chimera is supported',()=>{
 const search=searchCapabilityChimeras({requiredAtomIds:['a'],retrieval:retrieval([eligible(cap('a',['a']))])});
 const r=evaluateCapabilityChimeraTournament({
  composition:search.primary,
  ...benchArgs,
  incumbent:metrics,
  chimera:{...metrics,taskSuccess:.9,quality:.9,reliability:.9,monetaryCostCents:4}
 });
 assert.equal(r.ok,true);
 assert.equal(r.status,'CAPABILITY_CHIMERA_SUPPORTED');
 assert.equal(r.hypothesisSupported,true);
 assert.equal(r.promotionAuthority,'NONE');
});

test('reliability regression triggers the candidate falsifier',()=>{
 const search=searchCapabilityChimeras({requiredAtomIds:['a'],retrieval:retrieval([eligible(cap('a',['a']))])});
 const r=evaluateCapabilityChimeraTournament({
  composition:search.primary,...benchArgs,
  incumbent:metrics,
  chimera:{...metrics,reliability:.4,monetaryCostCents:4}
 });
 assert.equal(r.status,'CAPABILITY_CHIMERA_FALSIFIER_TRIGGERED');
 assert.equal(r.hypothesisSupported,false);
 assert.equal(r.benchmark.record.nonRegressing,false);
 assert.ok(r.falsifierReasonCodes.includes('benchmark-non-regression-failed'));
});

test('higher monetary cost triggers the falsifier even when quality improves',()=>{
 const search=searchCapabilityChimeras({requiredAtomIds:['a'],retrieval:retrieval([eligible(cap('a',['a']))])});
 const r=evaluateCapabilityChimeraTournament({
  composition:search.primary,...benchArgs,
  incumbent:metrics,
  chimera:{...metrics,taskSuccess:.95,quality:.95,reliability:.95,monetaryCostCents:6}
 });
 assert.equal(r.status,'CAPABILITY_CHIMERA_FALSIFIER_TRIGGERED');
 assert.equal(r.costComparison.costNonRegressing,false);
 assert.ok(r.falsifierReasonCodes.includes('chimera-more-expensive-than-incumbent'));
});

test('security or leakage failure dominates apparent benchmark gains',()=>{
 const search=searchCapabilityChimeras({requiredAtomIds:['a'],retrieval:retrieval([eligible(cap('a',['a']))])});
 const security=evaluateCapabilityChimeraTournament({
  composition:search.primary,...benchArgs,securityPassed:false,
  incumbent:metrics,chimera:{...metrics,taskSuccess:1,quality:1,reliability:1,monetaryCostCents:1}
 });
 assert.equal(security.status,'CAPABILITY_CHIMERA_FALSIFIER_TRIGGERED');
 assert.ok(security.benchmark.record.reasonCodes.includes('security-gate-dominates-benchmark'));

 const leak=evaluateCapabilityChimeraTournament({
  composition:search.primary,...benchArgs,leakChecks:[{passed:false}],
  incumbent:metrics,chimera:{...metrics,taskSuccess:1,quality:1,reliability:1,monetaryCostCents:1}
 });
 assert.equal(leak.status,'CAPABILITY_CHIMERA_FALSIFIER_TRIGGERED');
 assert.ok(leak.benchmark.record.reasonCodes.includes('benchmark-leak-check-failed'));
});
