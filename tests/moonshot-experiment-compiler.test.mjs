import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMoonshotExperiment,
  compileReplicationContract
} from '../src/moonshot-experiment-compiler.mjs';

const softwareProbe={
  id:'software-canary',
  description:'Run a deterministic held-out software benchmark.',
  measurement:'Held-out verified success rate and operations evaluated.',
  decisionRule:'Support only if held-out correctness is preserved and search work falls by at least 50%.',
  supportsHypothesis:'Correctness is preserved and search work falls by at least 50%.',
  falsifiesHypothesis:'Correctness differs or search work falls by less than 50%.',
  informationGain:90,cost:1,risk:1,irreversibility:0,delay:1,authorityReady:true,
  costCents:0,timeMinutes:10,reversibility:'REVERSIBLE',effects:{}
};

test('compiler creates a zero-effect preregistration without execution authority',()=>{
  const r=compileMoonshotExperiment({
    moonshotId:'founder-moonshot-0001',
    claimId:'minimal-intervention',
    hypothesis:'Causal relevance pruning preserves the minimum intervention while reducing search.',
    falsifier:'Any held-out case changes minimum intervention cardinality or fails to reduce search.',
    candidateProbes:[softwareProbe],
    costCeilingCents:0,timeCeilingMinutes:30
  });
  assert.equal(r.ok,true);
  assert.equal(r.status,'MOONSHOT_ZERO_EFFECT_EXPERIMENT_READY');
  assert.equal(r.executionAuthority,'NONE');
  assert.equal(r.preregistration.runnable,true);
  assert.match(r.preregistration.truthBoundary,/ONLY_OBSERVED_RESULTS/);
});

test('compiler refuses malformed non-discriminating probe contracts',()=>{
  const r=compileMoonshotExperiment({
    moonshotId:'m',claimId:'c',hypothesis:'h',falsifier:'f',
    candidateProbes:[{...softwareProbe,supportsHypothesis:'same',falsifiesHypothesis:'same'}]
  });
  assert.equal(r.ok,false);
});

test('replication contract cannot promote itself',()=>{
  const r=compileReplicationContract({
    experimentId:'exp-1',originalResultRef:'experiment:result-1',minimumReplications:2
  });
  assert.equal(r.ok,true);
  assert.equal(r.promotionAuthority,'NONE');
  assert.equal(r.minimumReplications,2);
});
