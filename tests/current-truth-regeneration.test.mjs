import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCurrentTruthRegeneration, EXPECTED_TRUTH_OUTPUTS } from '../src/current-truth-regeneration.mjs';

const HEAD='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
function fixture(over={}){
  const readiness={
    generatedBy:'scripts/system-readiness.mjs',
    generatedAt:'2026-09-09T00:00:00.000Z',
    repository:{head:HEAD,workingTreeClean:true,sourceModules:400,testSuites:500},
    measurements:{reachability:{measurementMode:'LIVE_COMPUTED_FROM_IMPORT_GRAPH',srcModules:400,reachableFromProduction:150,reachableFromUnattendedOperatorScriptsOnly:100,reachableFromFounderInteractiveOnly:20,noEntryPointAtAll:130,partitionExact:true,allClassified:true}}
  };
  const coverage={
    ok:true,status:'COVERAGE_MATRIX_COMPILED',sourceCommit:HEAD,
    counts:{rows:10,extractedConcepts:12,byState:{IMPLEMENTED:7,SPEC_ONLY:3},byLane:{'OMEGA-01':5,'OMEGA-02':5}}
  };
  const freeze={
    ok:true,head:{sha:HEAD},
    generatedArtifacts:[{id:'system-readiness',status:'CURRENT_EXACT_HEAD'},{id:'sovereign-coverage',status:'CURRENT_EXACT_HEAD'}],
    closureBoundary:{runtimeTruth:'NOT_INFERRED_FROM_REPOSITORY_FREEZE',externalOutcomeTruth:'NOT_INFERRED_FROM_REPOSITORY_FREEZE'}
  };
  return {headSha:HEAD,readiness,coverage,freeze,dirtyPaths:[...EXPECTED_TRUTH_OUTPUTS],generatorResults:{readiness:{exitCode:0},coverage:{exitCode:0}},...over};
}

test('exact-head canonical regeneration compiles a bounded source-truth receipt',()=>{
  const out=verifyCurrentTruthRegeneration(fixture());
  assert.equal(out.ok,true);
  assert.equal(out.status,'CURRENT_TRUTH_REGENERATED_FOR_EXACT_SOURCE_HEAD');
  assert.equal(out.coverage.rows,10);
  assert.equal(out.coverage.byState.SPEC_ONLY,3);
  assert.equal(out.closureBoundary.namedRuntimeTruth,'NOT_INFERRED');
  assert.equal(out.closureBoundary.commercialTruth,'NOT_INFERRED');
  assert.equal(out.closureBoundary.asiTruth,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(out.businessEffectAuthority,'NONE');
});

test('invalid head fails closed',()=>{
  const out=verifyCurrentTruthRegeneration(fixture({headSha:'nope'}));
  assert.equal(out.ok,false);
  assert.deepEqual(out.reasonCodes,['valid-exact-head-required']);
});

test('readiness must bind exact head',()=>{
  const x=fixture();x.readiness.repository.head='b'.repeat(40);
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('readiness-head-mismatch'));
});

test('coverage must bind exact head',()=>{
  const x=fixture();x.coverage.sourceCommit='b'.repeat(40);
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-head-mismatch'));
});

test('readiness must have observed a clean source checkout before it wrote outputs',()=>{
  const x=fixture();x.readiness.repository.workingTreeClean=false;
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('readiness-must-be-measured-from-clean-source-checkout'));
});

test('recorded reachability cannot replace exact live import-graph reachability',()=>{
  const x=fixture();x.readiness.measurements.reachability.measurementMode='RECORDED';
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('live-reachability-measurement-required'));
});

test('incomplete or unclassified reachability fails',()=>{
  const x=fixture();x.readiness.measurements.reachability.partitionExact=false;x.readiness.measurements.reachability.allClassified=false;
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('reachability-partition-must-be-exact'));assert.ok(out.reasonCodes.includes('reachability-must-be-fully-classified'));
});

test('coverage denominator cannot be empty',()=>{
  const x=fixture();x.coverage.counts.rows=0;x.coverage.counts.extractedConcepts=0;x.coverage.counts.byState={};
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-row-denominator-required'));assert.ok(out.reasonCodes.includes('coverage-concept-denominator-required'));
});

test('coverage state counts must account for every row',()=>{
  const x=fixture();x.coverage.counts.byState={IMPLEMENTED:7,SPEC_ONLY:2};
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-state-counts-must-sum-to-row-denominator'));
});

test('unexpected mutation outside generated truth surfaces fails',()=>{
  const x=fixture();x.dirtyPaths=[...EXPECTED_TRUTH_OUTPUTS,'src/evil-drift.mjs'];
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('truth-regeneration-mutated-unexpected-path'));assert.deepEqual(out.unexpectedDirtyPaths,['src/evil-drift.mjs']);
});

test('idempotent generator output is allowed to remain byte-identical',()=>{
  const x=fixture();x.dirtyPaths=[];
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,true);
});

test('both canonical generators must actually execute successfully',()=>{
  const x=fixture();x.generatorResults.readiness.exitCode=1;x.generatorResults.coverage.exitCode=2;
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('readiness-generator-must-exit-zero'));assert.ok(out.reasonCodes.includes('coverage-generator-must-exit-zero'));
});

test('freeze must independently agree that both generated artifacts bind exact head',()=>{
  const x=fixture();x.freeze.generatedArtifacts[1].status='CURRENT_SOURCE_EQUIVALENT';
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('freeze-artifact-not-current-exact-head:sovereign-coverage'));
});

test('freeze may never launder repository regeneration into runtime or outcomes',()=>{
  const x=fixture();x.freeze.closureBoundary.runtimeTruth='PROVEN';x.freeze.closureBoundary.externalOutcomeTruth='PROVEN';
  const out=verifyCurrentTruthRegeneration(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('freeze-runtime-boundary-must-remain-noninferred'));assert.ok(out.reasonCodes.includes('freeze-external-outcome-boundary-must-remain-noninferred'));
});
