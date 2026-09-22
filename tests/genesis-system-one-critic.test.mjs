import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGenesisSystemOneCritique } from '../src/genesis-system-one-critic.mjs';

const job={
 kind:'CANDIDATE_CRITIQUE',
 max_cost_microusd:0,
 prompt:{candidate:{
  candidateId:'genesis-candidate-20260922-self-0012',
  title:'Thermodynamic Compute Scheduler',
  hypothesis:'Measured energy and heat can improve compute routing.',
  mechanism:'Route jobs using joules per accepted output and thermal headroom.',
  falsifier:'Energy-aware scheduling fails to improve accepted progress per kWh.',
  nextProbe:'Compare throughput-only and energy-aware scheduling.',
  moonshotAffinity:['founder-moonshot-0123','founder-moonshot-0261'],
  substrateNeeds:['UBERWATT','THERMAL_TELEMETRY','SCHEDULER','LOCAL_COMPUTE']
 }}
};

test('produces a structured zero-cost deterministic critique',()=>{
 const r=compileGenesisSystemOneCritique({job});
 assert.equal(r.ok,true);
 assert.equal(r.costMicrousd,0);
 assert.equal(r.provider,'uberbond');
 assert.equal(r.model,'jev-system-one-v1');
 assert.equal(r.result.implementationSketch.internalOnly,true);
 assert.ok(r.result.strongestCounterexamples.length>=3);
 assert.equal(r.promotionAuthority,'NONE');
});

test('energy-dependent candidate explicitly keeps measurement uncertainty unresolved',()=>{
 const r=compileGenesisSystemOneCritique({job});
 assert.ok(r.result.unresolved.some(x=>/energy\/thermal/i.test(x)));
 assert.ok(r.result.strongestCounterexamples.some(x=>/thermal|energy/i.test(x)));
});

test('critique includes anti-gaming baseline and hidden-assistance controls',()=>{
 const r=compileGenesisSystemOneCritique({job});
 assert.match(r.result.falsifierRefinement,/same task population/i);
 assert.match(r.result.falsifierRefinement,/hidden-intervention/i);
 assert.match(r.result.minimumExperiment.failureCriterion,/hidden assistance/i);
});

test('refuses non-zero-cost jobs',()=>{
 const r=compileGenesisSystemOneCritique({job:{...job,max_cost_microusd:1}});
 assert.equal(r.ok,false);
 assert.ok(r.reasonCodes.includes('system-one-zero-cost-jobs-only'));
});

test('refuses malformed candidate jobs',()=>{
 const bad=structuredClone(job); delete bad.prompt.candidate.falsifier;
 const r=compileGenesisSystemOneCritique({job:bad});
 assert.equal(r.ok,false);
 assert.ok(r.reasonCodes.includes('valid-cognition-job-candidate-required'));
});

test('refuses task classes it does not implement',()=>{
 const r=compileGenesisSystemOneCritique({job:{...job,kind:'IMPLEMENTATION_DESIGN'}});
 assert.equal(r.ok,false);
 assert.ok(r.reasonCodes.includes('candidate-critique-job-required'));
});
