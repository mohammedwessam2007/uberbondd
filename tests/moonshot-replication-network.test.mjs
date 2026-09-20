import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileReplicationProtocol,
  evaluateReplicationNetwork,
  compileReplicationFrontier
} from '../src/moonshot-replication-network.mjs';

const protocol=compileReplicationProtocol({
  protocolId:'causal-v2-replication',
  experimentId:'causal-v2',
  minimumIndependentReplications:1,
  metrics:[
    {id:'agreement',path:'correctnessAgreementRate',comparator:'EXACT'},
    {id:'reduction',path:'medianReduction',comparator:'ABS_TOLERANCE',tolerance:0}
  ]
}).protocol;

const primary={
  experimentId:'causal-v2',
  implementation:{implementationId:'js-primary',language:'JavaScript',lineage:'PRIMARY'},
  result:{correctnessAgreementRate:1,medianReduction:18}
};

test('independent exact reproduction reaches reproduced without granting promotion authority',()=>{
  const result=evaluateReplicationNetwork({
    protocol,primary,
    replications:[{
      experimentId:'causal-v2',
      implementation:{implementationId:'python-independent',language:'Python',lineage:'INDEPENDENT'},
      result:{correctnessAgreementRate:1,medianReduction:18}
    }]
  });
  assert.equal(result.reproduced,true);
  assert.equal(result.status,'EXPERIMENT_REPRODUCED');
  assert.equal(result.promotionAuthority,'NONE');
});

test('same-lineage rerun does not count as independent replication',()=>{
  const result=evaluateReplicationNetwork({
    protocol,primary,
    replications:[{
      experimentId:'causal-v2',
      implementation:{implementationId:'js-rerun',language:'JavaScript',lineage:'SAME_LINEAGE'},
      result:{correctnessAgreementRate:1,medianReduction:18}
    }]
  });
  assert.equal(result.reproduced,false);
  assert.equal(result.nonIndependentCount,1);
});

test('contradictory independent result is preserved as conflict',()=>{
  const result=evaluateReplicationNetwork({
    protocol,primary,
    replications:[{
      experimentId:'causal-v2',
      implementation:{implementationId:'python-conflict',language:'Python',lineage:'INDEPENDENT'},
      result:{correctnessAgreementRate:0.9,medianReduction:18}
    }]
  });
  assert.equal(result.status,'REPLICATION_CONFLICT_REQUIRES_RESOLUTION');
  assert.equal(result.independentConflictCount,1);
  assert.equal(result.reproduced,false);
});

test('replication frontier prioritizes high-downstream demonstrated mechanisms',()=>{
  const result=compileReplicationFrontier({experiments:[
    {experimentId:'small',evidenceState:'SOFTWARE_DEMONSTRATED',downstreamCount:2,independentReplicationCount:0},
    {experimentId:'large',evidenceState:'SOFTWARE_DEMONSTRATED',downstreamCount:600,independentReplicationCount:0},
    {experimentId:'imagined',evidenceState:'IMAGINED',downstreamCount:10000}
  ]});
  assert.equal(result.ok,true);
  assert.equal(result.experiments[0].experimentId,'large');
  assert.equal(result.experiments.some(x=>x.experimentId==='imagined'),false);
});
