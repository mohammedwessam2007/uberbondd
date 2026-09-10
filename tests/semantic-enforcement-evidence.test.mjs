import test from 'node:test';
import assert from 'node:assert/strict';
import { bindVerifiedEnforcementEvidence } from '../src/semantic-enforcement-evidence.mjs';

const baseCoverage={
  ok:true,
  status:'COVERAGE_MATRIX_COMPILED',
  sourceCommit:'a'.repeat(40),
  rows:[{
    canonicalId:'north-star:capability-does-not-create-authority',
    literalNames:['Capability does not create authority'],
    currentState:'ENFORCED_BY_CODE',
    currentEvidence:{sourceModules:[],testModules:[],reachability:null}
  }]
};

const declaration={
  concept:'Capability does not create authority',
  sources:['src/sovereignty-type-system.mjs'],
  tests:['tests/sovereignty-type-system.test.mjs']
};

test('an enforced law carries its declared source and hostile test into semantic evidence',()=>{
  const out=bindVerifiedEnforcementEvidence({coverage:baseCoverage,enforcementEntries:[declaration]});
  assert.deepEqual(out.rows[0].currentEvidence.sourceModules,['src/sovereignty-type-system.mjs']);
  assert.deepEqual(out.rows[0].currentEvidence.testModules,['tests/sovereignty-type-system.test.mjs']);
  assert.equal(out.rows[0].currentEvidence.enforcementEvidenceBound,true);
});

test('a verified-current law keeps separately verified enforcement evidence without changing state',()=>{
  const coverage={...baseCoverage,rows:[{
    ...baseCoverage.rows[0],
    currentState:'VERIFIED_CURRENT',
    currentEvidence:{sourceModules:['src/already-verified.mjs'],testModules:['tests/already-verified.test.mjs'],reachability:'PRODUCTION'}
  }]};
  const out=bindVerifiedEnforcementEvidence({coverage,enforcementEntries:[declaration]});
  assert.equal(out.rows[0].currentState,'VERIFIED_CURRENT');
  assert.deepEqual(out.rows[0].currentEvidence.sourceModules,['src/already-verified.mjs','src/sovereignty-type-system.mjs']);
  assert.deepEqual(out.rows[0].currentEvidence.testModules,['tests/already-verified.test.mjs','tests/sovereignty-type-system.test.mjs']);
  assert.equal(out.rows[0].currentEvidence.enforcementEvidenceBound,true);
});

test('enforcement declarations never promote a non-current row',()=>{
  for(const currentState of ['SPEC_ONLY','PARTIAL_CURRENT','UNKNOWN','HISTORICAL_DONOR_PRESERVED']){
    const coverage={...baseCoverage,rows:[{...baseCoverage.rows[0],currentState,currentEvidence:{sourceModules:[],testModules:[],reachability:null}}]};
    const out=bindVerifiedEnforcementEvidence({coverage,enforcementEntries:[declaration]});
    assert.equal(out.rows[0].currentState,currentState);
    assert.deepEqual(out.rows[0].currentEvidence.sourceModules,[]);
    assert.deepEqual(out.rows[0].currentEvidence.testModules,[]);
    assert.equal(out.rows[0].currentEvidence.enforcementEvidenceBound,undefined);
  }
});

test('source-only enforcement declarations cannot manufacture semantic behavior evidence',()=>{
  const out=bindVerifiedEnforcementEvidence({
    coverage:baseCoverage,
    enforcementEntries:[{concept:'Capability does not create authority',sources:['src/x.mjs'],tests:[]}]
  });
  assert.deepEqual(out.rows[0].currentEvidence.sourceModules,[]);
  assert.deepEqual(out.rows[0].currentEvidence.testModules,[]);
});

test('lookalike law names do not inherit another law declaration',()=>{
  const coverage={...baseCoverage,rows:[{...baseCoverage.rows[0],literalNames:['Capability does not create deployment authority']}]};
  const out=bindVerifiedEnforcementEvidence({
    coverage,
    enforcementEntries:[{concept:'Capability does not create authority',sources:['src/x.mjs'],tests:['tests/x.test.mjs']}]
  });
  assert.deepEqual(out.rows[0].currentEvidence.sourceModules,[]);
});
