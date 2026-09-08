import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFeasibleBoundedExperiment, GENESIS_EXPERIMENT_POLICY_CORE } from '../src/genesis-experiment-feasibility.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=path.join(root,'src');

const importsLegacyGenesisExperimentCompiler=body=>/import\s*\{[^}]*\bcompileBoundedExperiment\b[^}]*\}\s*from\s*['"]\.\/genesis-boundary-experiment\.mjs['"]/s.test(body);

test('no production module may restore the legacy GENESIS experiment compiler as a second policy route',()=>{
  const offenders=[];
  for(const name of fs.readdirSync(src)){
    if(!name.endsWith('.mjs')||name==='genesis-boundary-experiment.mjs')continue;
    const body=fs.readFileSync(path.join(src,name),'utf8');
    if(importsLegacyGenesisExperimentCompiler(body))offenders.push(name);
  }
  assert.deepEqual(offenders,[]);
});

test('GENESIS feasibility and Personal Civilization both name the generic bounded experiment core',()=>{
  const genesis=fs.readFileSync(path.join(src,'genesis-experiment-feasibility.mjs'),'utf8');
  const pce=fs.readFileSync(path.join(src,'personal-civilization-scientific-experiment.mjs'),'utf8');
  assert.match(genesis,/from '\.\/bounded-experiment-compiler\.mjs'/);
  assert.match(pce,/from '\.\/bounded-experiment-compiler\.mjs'/);
  assert.equal(GENESIS_EXPERIMENT_POLICY_CORE,'uberbond.bounded-experiment-compiler.v1');
});

test('GENESIS local probe exposes canonical core receipt without losing measure evidence',()=>{
  const out=compileFeasibleBoundedExperiment({
    hypothesis:'candidate defect changes held-out error',
    falsifier:'held-out error remains within tolerance',
    costCeilingCents:0,
    timeCeilingMinutes:20,
    probes:[{
      description:'run held-out fixture',costCents:0,timeMinutes:5,reversibility:'REVERSIBLE',
      measure:'classification error rate',decisionRule:'support only above predeclared tolerance',
      supportsHypothesis:'error exceeds tolerance',falsifiesHypothesis:'error remains within tolerance'
    }]
  });
  assert.equal(out.ok,true,JSON.stringify(out.reasonCodes));
  assert.equal(out.runnable,true);
  assert.equal(out.canonicalBoundedExperiment.ok,true);
  assert.equal(out.canonicalBoundedExperiment.status,'BOUNDED_ZERO_EFFECT_EXPERIMENT_FEASIBLE');
  assert.equal(out.probe.measure,'classification error rate');
  assert.equal(out.businessEffectAuthority,'NONE');
});

test('GENESIS customer blast radius can only add a blocker even when generic structural core is zero-effect',()=>{
  const out=compileFeasibleBoundedExperiment({
    hypothesis:'customers prefer short pack',falsifier:'reply rate is unchanged',costCeilingCents:0,timeCeilingMinutes:20,
    blastRadius:'CUSTOMER',effects:{customerContact:true},
    probes:[{description:'held-out customer split',costCents:0,timeMinutes:5,measure:'reply rate',decisionRule:'support above margin',supportsHypothesis:'reply rate exceeds margin',falsifiesHypothesis:'reply rate stays below margin'}]
  });
  assert.equal(out.ok,true);
  assert.equal(out.canonicalBoundedExperiment.status,'BOUNDED_ZERO_EFFECT_EXPERIMENT_FEASIBLE');
  assert.equal(out.runnable,false);
  assert.equal(out.status,'FEASIBLE_EXPERIMENT_REQUIRES_EXPLICIT_AUTHORITY');
  assert.ok(out.requiredAuthority.includes('CUSTOMER_CONTACT'));
  assert.ok(out.requiredAuthority.includes('BLAST_RADIUS_BEYOND_LOCAL'));
  assert.equal(out.businessEffectAuthority,'NONE');
});
