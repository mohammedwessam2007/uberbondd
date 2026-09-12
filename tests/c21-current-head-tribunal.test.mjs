import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {freezeCurrentHeadCampaign,preflightCurrentHeadEvidence,evaluateCurrentHeadC21} from '../src/c21-current-head-tribunal.mjs';

const REV='2fbcd75ad41b8020d1bec2ceed75508503e184b1';
const AT='2026-09-12T19:30:00Z';
const OBS='2026-09-12T19:31:00Z';
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const frozen=freezeCurrentHeadCampaign({candidateRevision:REV,frozenAt:AT,rotationSaltDigest:'1'.repeat(64)});
assert.equal(frozen.ok,true);
const campaign=frozen.campaign;

function validCompound(){
  const compositionDigest='a'.repeat(64);
  const receipt={version:'uberbond.compound-intelligence-evaluation.v1.1',compositionId:'uberbond-main',compositionRevision:REV,compositionDigest};
  const receiptHash=sha(receipt);
  return {ok:true,version:'uberbond.compound-intelligence-evaluation.v1.1',status:'COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE',evidenceStage:'FRESH_CONTEXT_REPRODUCED_WITH_CROSS_DOMAIN_TRANSFER_SUPPORT',asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',generalityClaim:'WITHHELD__DEFINED_TASK_POPULATION_ONLY',compositionId:'uberbond-main',compositionRevision:REV,compositionDigest,receiptHash,receipt};
}

function validRow(dimension='self-improvement'){
  const cell=campaign.cells.find(c=>c.dimension===dimension);
  return {
    candidateId:'uberbond-main',candidateRevision:REV,dimension,
    observed:true,synthetic:false,evidenceRef:`observed:${dimension}`,
    independentEvaluatorRef:`independent:evaluator:${dimension}`,
    verifierId:'verifier:alpha',verifierLineageRef:'lineage:alpha',
    taskPopulationHash:cell.taskPopulationHash,observedAt:'2026-09-12T19:30:30Z',
    compoundEvaluation:validCompound(),baselineVerifiedAtEvaluationTime:true,
    thresholdFrozenBeforeEvaluation:true,freshContextHeldout:true,freshContextRetained:true,
    contaminationStatus:'CLEAN',evaluatorIndependent:true,
    matchedResourceBudgetVerified:true,resourceBudgetDigest:'b'.repeat(64),
    externalBenchmarkObserved:true,privateHoldoutObserved:true,
    externalBenchmarkSurface:cell.benchmarkSurfaces[0],privateHoldoutSurface:cell.benchmarkSurfaces[1],
    externalBenchmarkEvidenceRef:`external:${dimension}`,privateHoldoutEvidenceRef:`private:${dimension}`
  };
}

test('fresh exact-head campaign with no observed receipts stays at zero evidence',()=>{
  const result=evaluateCurrentHeadC21({campaign,currentRevision:REV,receipts:[],observedAt:OBS});
  assert.equal(result.ok,true);
  assert.equal(result.evaluation.counts.evidencedDimensions,0);
  assert.equal(result.evaluation.evidenceStage,'SYSTEM_LEVEL_ASI_EVIDENCE_NOT_ESTABLISHED');
  assert.equal(result.nextEvidenceCells.length,20);
});

test('stale candidate revision is refused before it can count',()=>{
  const row={...validRow(),candidateRevision:'stale'};
  const result=preflightCurrentHeadEvidence({campaign,currentRevision:REV,receipts:[row]});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('receipt-candidate-must-match-frozen-campaign'));
});

test('matched resources and both evidence surfaces are mandatory',()=>{
  const row={...validRow(),matchedResourceBudgetVerified:false,privateHoldoutObserved:false};
  const result=preflightCurrentHeadEvidence({campaign,currentRevision:REV,receipts:[row]});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('matched-resource-budget-proof-required'));
  assert.ok(result.reasonCodes.includes('external-benchmark-and-private-holdout-both-required'));
});

test('one structurally admissible observed dimension remains bounded and cannot imply ASI',()=>{
  const result=evaluateCurrentHeadC21({campaign,currentRevision:REV,receipts:[validRow()],observedAt:OBS});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.evaluation.counts.evidencedDimensions,1);
  assert.equal(result.evaluation.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(result.evaluation.evidenceStage,'SYSTEM_LEVEL_ASI_EVIDENCE_NOT_ESTABLISHED');
  assert.ok(result.evaluation.missingCriticalDimensions.includes('causal reasoning'));
});
