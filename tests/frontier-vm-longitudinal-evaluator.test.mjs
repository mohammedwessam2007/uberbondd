import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateFrontierVmLongitudinalRun } from '../src/frontier-vm-longitudinal-evaluator.mjs';

const ep=(i,overrides={})=>({
  episodeId:`e${i}`,
  taskArchetype:'research',
  phase:i<=10?'BURN_IN':'CERTIFIED',
  crownRevision:'crown-r1',
  baselineSuccess:true,
  candidateSuccess:true,
  baselineFrontierCostUsd:1,
  candidateFrontierCostUsd:i<=10?0.5:0.1,
  baselineAllInCostUsd:1,
  candidateAllInCostUsd:i<=10?0.6:0.2,
  semanticNodes:100,
  frontierNodes:i<=10?50:10,
  compiledHits:i<=10?20:70,
  deoptimizations:0,
  evidenceRef:`receipt://${i}`,
  ...overrides
});

test('longitudinal evaluator detects falling frontier residual with zero paired regressions',()=>{
  const episodes=Array.from({length:20},(_,i)=>ep(i+1));
  const out=evaluateFrontierVmLongitudinalRun({campaignId:'v5',episodes,minimumEpisodes:20});
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.qualityPass,true);
  assert.equal(out.overall.pairedRegressions,0);
  assert.ok(out.overall.referenceCompressionFactor>1);
  assert.ok(out.temporal.frontierResidualRatioDelta<0);
  assert.equal(out.status,'LONGITUDINAL_COMPRESSION_SIGNAL_OBSERVED');
});

test('one baseline-success candidate-failure is surfaced as a paired regression',()=>{
  const episodes=Array.from({length:20},(_,i)=>ep(i+1));
  episodes[12]={...episodes[12],candidateSuccess:false};
  const out=evaluateFrontierVmLongitudinalRun({campaignId:'v5-regression',episodes,minimumEpisodes:20});
  assert.equal(out.qualityPass,false);
  assert.equal(out.status,'QUALITY_REGRESSION_DETECTED__DEOPTIMIZE');
  assert.deepEqual(out.overall.regressionEpisodeIds,['e13']);
  assert.equal(out.automaticPromotionAuthorized,false);
});

test('post-succession experiment can require a second Crown revision phase',()=>{
  const noSuccession=Array.from({length:20},(_,i)=>ep(i+1));
  const refused=evaluateFrontierVmLongitudinalRun({
    campaignId:'need-succession',
    episodes:noSuccession,
    minimumEpisodes:20,
    requireCrownSuccessionPhase:true
  });
  assert.equal(refused.ok,false);
  assert.ok(refused.reasonCodes.includes('post-succession-phase-required'));

  const withSuccession=Array.from({length:20},(_,i)=>ep(i+1,
    i>=15?{phase:'POST_SUCCESSION',crownRevision:'crown-r2'}:{}
  ));
  const accepted=evaluateFrontierVmLongitudinalRun({
    campaignId:'with-succession',
    episodes:withSuccession,
    minimumEpisodes:20,
    requireCrownSuccessionPhase:true
  });
  assert.equal(accepted.ok,true);
  assert.equal(accepted.crownSuccessionObserved,true);
  assert.deepEqual(accepted.crownRevisions,['crown-r1','crown-r2']);
});

test('duplicate evidence refs are refused',()=>{
  const episodes=Array.from({length:4},(_,i)=>ep(i+1));
  episodes[1]={...episodes[1],evidenceRef:episodes[0].evidenceRef};
  const out=evaluateFrontierVmLongitudinalRun({campaignId:'dup',episodes,minimumEpisodes:4});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.some(x=>x.includes('independent-evidence-ref-required')));
});
