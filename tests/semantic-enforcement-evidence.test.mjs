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

test('an enforced law carries its declared source and hostile test into semantic evidence',()=>{
  const out=bindVerifiedEnforcementEvidence({
    coverage:baseCoverage,
    enforcementEntries:[{
      concept:'Capability does not create authority',
      sources:['src/sovereignty-type-system.mjs'],
      tests:['tests/sovereignty-type-system.test.mjs']
    }]
  });
  assert.deepEqual(out.rows[0].currentEvidence.sourceModules,['src/sovereignty-type-system.mjs']);
  assert.deepEqual(out.rows[0].currentEvidence.testModules,['tests/sovereignty-type-system.test.mjs']);
  assert.equal(out.rows[0].currentEvidence.enforcementEvidenceBound,true);
});

test('enforcement declarations never promote a non-enforced row',()=>{
  const coverage={...baseCoverage,rows:[{...baseCoverage.rows[0],currentState:'SPEC_ONLY'}]};
  const out=bindVerifiedEnforcementEvidence({
    coverage,
    enforcementEntries:[{concept:'Capability does not create authority',sources:['src/x.mjs'],tests:['tests/x.test.mjs']}]
  });
  assert.deepEqual(out.rows[0].currentEvidence.sourceModules,[]);
  assert.equal(out.rows[0].currentEvidence.enforcementEvidenceBound,undefined);
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
