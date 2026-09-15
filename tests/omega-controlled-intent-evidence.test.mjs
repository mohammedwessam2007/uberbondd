import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAmbiguousControlledIntent, selectSemanticObservation, resolveControlledIntent, independentlyVerifySemanticWitness } from '../src/omega-controlled-intent-evidence.mjs';

test('ambiguous controlled intent stays superposed until evidence discriminates it',()=>{
  const compiled=compileAmbiguousControlledIntent({candidates:[
    {id:'different',terminalContract:'produce a valid assignment',text:'variables a,b use values 1,2. a differs from b. given a = 1'},
    {id:'equal',terminalContract:'produce a valid assignment',text:'variables a,b use values 1,2. a equals b. given a = 1'}
  ]});
  assert.equal(compiled.ok,true);
  assert.deepEqual(compiled.lattice.divergentKeys,['semanticHash']);
  const selected=selectSemanticObservation({compiledIntent:compiled,observations:[
    {id:'weak',cost:1,outcomes:{different:'unknown',equal:'unknown'}},
    {id:'ask-relation',cost:1,outcomes:{different:'different',equal:'same'}}
  ]});
  assert.equal(selected.ok,true);
  assert.equal(selected.selected.id,'ask-relation');
  assert.ok(selected.selected.informationBits>0);
  const resolved=resolveControlledIntent({compiledIntent:compiled,observation:selected.selected,observedValue:'different'});
  assert.equal(resolved.ok,true);
  assert.equal(resolved.resolved.id,'different');
  const expected=compiled.candidates.find(c=>c.id==='different').problem;
  const witness=independentlyVerifySemanticWitness({resolved:resolved.resolved,expectedProblem:expected});
  assert.equal(witness.valid,true);
});

test('semantic witness rejects a formally different interpretation',()=>{
  const compiled=compileAmbiguousControlledIntent({candidates:[
    {id:'different',terminalContract:'solve',text:'variables a,b use values 1,2. a differs from b'},
    {id:'equal',terminalContract:'solve',text:'variables a,b use values 1,2. a equals b'}
  ]});
  const selected=selectSemanticObservation({compiledIntent:compiled,observations:[{id:'relation',cost:1,outcomes:{different:'different',equal:'same'}}]});
  const resolved=resolveControlledIntent({compiledIntent:compiled,observation:selected.selected,observedValue:'different'});
  const wrong=compiled.candidates.find(c=>c.id==='equal').problem;
  const witness=independentlyVerifySemanticWitness({resolved:resolved.resolved,expectedProblem:wrong});
  assert.equal(witness.valid,false);
});
