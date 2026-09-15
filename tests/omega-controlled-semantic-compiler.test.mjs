import test from 'node:test';
import assert from 'node:assert/strict';
import {compileControlledIntent} from '../src/omega-controlled-semantic-compiler.mjs';
import {solveTask} from '../src/omega-private-evidence-lab.mjs';

const cases=[
 ['assign K0,K1,K2 to alpha,beta,gamma; alpha != beta; beta different from gamma; given alpha=K0','CONFLICT'],
 ['schedule design,build,verify in 0..2; design before build; build before verify','PRECEDENCE'],
 ['allocate x,y,z in 0..4; sum(x,y,z)=6; x != y; given x=1','CONSERVATION']
];
for(const [text,family] of cases)test(family,()=>{const c=compileControlledIntent({text});assert.equal(c.ok,true);assert.equal(c.problem.family,family);assert.equal(solveTask(c.problem,'MOST_CONSTRAINED').verified,true);});
test('unsupported prose refuses',()=>{assert.equal(compileControlledIntent({text:'please figure this out'}).ok,false);});
