import test from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenExactLeaves,
  resolveJsonPointer,
  buildSourceGroundedObligations,
  evaluateSourceGroundedEquivalence
} from '../src/achieved-opus-equivalence-island.mjs';

const docs={
  'a.json':{status:'READY',limits:{monthlyUsd:20,crown:false},items:['x','y']},
  'b.json':{quality:{regressionTolerance:0,silentDowngrade:false}}
};

test('exact source-grounded workload achieves zero-model-cost equality on every admitted leaf',()=>{
  const out=evaluateSourceGroundedEquivalence({sourceDocuments:docs});
  assert.equal(out.ok,true);
  assert.equal(out.semanticAuthority,'E1_DETERMINISTIC_DERIVATION');
  assert.equal(out.candidateProviderCallsPerformed,0);
  assert.equal(out.candidateModelInferenceCallsPerformed,0);
  assert.equal(out.candidateExternalApiSpendUsd,0);
  assert.equal(out.achievedApiPriceReductionVsFreshDirectFrontierPercent,100);
  assert.equal(out.generalOpenEndedOpusEquivalenceClaim,false);
  assert.equal(out.exactObligationCount,7);
  assert.equal(out.passedObligationCount,7);
});

test('mutation or bad resolver deoptimizes instead of claiming equivalence',()=>{
  const out=evaluateSourceGroundedEquivalence({
    sourceDocuments:docs,
    resolve(document,pointer){
      const value=resolveJsonPointer(document,pointer);
      return pointer==='/status'?'WRONG':value;
    }
  });
  assert.equal(out.ok,false);
  assert.equal(out.semanticAuthority,'NONE');
  assert.equal(out.achievedApiPriceReductionVsFreshDirectFrontierPercent,null);
  assert.equal(out.failedObligationCount,1);
  assert.equal(out.failures[0].reason,'EXACT_VALUE_MISMATCH');
});

test('source compiler is content-addressed and pointer exact',()=>{
  const compiled=buildSourceGroundedObligations(docs);
  assert.match(compiled.sourceDigests['a.json'],/^sha256:[0-9a-f]{64}$/);
  const leaves=flattenExactLeaves(docs['a.json']);
  assert.equal(leaves.length,5);
  assert.equal(resolveJsonPointer(docs['a.json'],'/limits/monthlyUsd'),20);
  assert.throws(()=>resolveJsonPointer(docs['a.json'],'/limits/nope'),/json-pointer-not-found/);
});

test('positive frontier tariff is required before a price-reduction claim exists',()=>{
  assert.throws(()=>evaluateSourceGroundedEquivalence({sourceDocuments:docs,inputUsdPerMillion:0}),/positive-frontier-tariff-required/);
});
