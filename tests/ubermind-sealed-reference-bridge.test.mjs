import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeHistoricalSealedReference} from '../src/ubermind-sealed-reference-bridge.mjs';
import {runUberMind890ProofCycle} from '../scripts/ubermind-890-evidence-cycle.mjs';
const row=()=>({
 status:'MEASURED_SOL_DOMINATES_OPUS_REFERENCE_ON_ALL_SEALED_TASKS',
 ok:true,taskCount:2,strictSameOrBetterEveryTask:true,
 sourceAttemptKey:'infinite_opus_crown_resume_20261002_r3',
 evaluatorCostUsd:.0245325,
 measuredCandidateCostCompressionFactor:2.002515,
 opusCandidateCostUsd:.063696,solCandidateCostUsd:.031808,
 perTask:[
  {taskIdHash:'sha256:0c8040503dde490065b5349f447121caa83c8f4957e1dc5be32d822ee97d615f',
   opus:{qualityScore:70,requiredRegressions:1,canonicalZeroLoss:false,costUsd:.036760},
   sol:{qualityScore:100,requiredRegressions:0,canonicalZeroLoss:true,costUsd:.018610},solSameOrBetter:true},
  {taskIdHash:'sha256:0a78e9e43960eab5b2d3c66bd866497272a0ba947d3f5512664d1bfc7899e9e1',
   opus:{qualityScore:75,requiredRegressions:0,canonicalZeroLoss:true,costUsd:.026936},
   sol:{qualityScore:90,requiredRegressions:0,canonicalZeroLoss:true,costUsd:.013198},solSameOrBetter:true}
 ]});
test('historical two-task trial is imported with exact costs and zero fresh admissions',()=>{
 const r=summarizeHistoricalSealedReference(row());
 assert.equal(r.ok,true);assert.equal(r.historicDistinctTaskCount,2);
 assert.equal(r.observedSolNonRegressions,2);
 assert.equal(r.observedOpusRequiredRegressions,1);
 assert.equal(r.solCandidateCostUsd,.031808);
 assert.equal(r.opusReferenceCostUsd,.063696);
 assert.equal(r.independentlyAuthenticatedHoldoutsAdded,0);
 assert.equal(r.crownAdmission,'NONE');
 assert.equal(r.sealedPayloadsOpened,false);
 assert.ok(r.proofInclusiveFactor>1&&r.proofInclusiveFactor<1.14);
});
test('actual current doctor keeps 2 historical tasks separate from fresh blind holdouts',()=>{
 const result=runUberMind890ProofCycle({historicalMeasuredReferenceDominance:row()});
 assert.equal(result.ok,true);assert.equal(result.historicalSealedDistinctTaskCount,2);
 assert.equal(result.actualIndependentFrontierHoldoutsInCycle,0);
 assert.equal(result.remainingFreshHoldoutsIfHistoricalPairIndependentlyAudited,71);
 assert.equal(result.global33333xConfirmed,false);
});
test('duplicate historical task identity refused without trusting scores',()=>{
 const z=row();z.perTask[1].taskIdHash=z.perTask[0].taskIdHash;
 const r=summarizeHistoricalSealedReference(z);
 assert.equal(r.ok,false);assert.equal(r.independentlyAuthenticatedHoldoutsAdded,0);
});
test('cost tamper breaks measured ratio contract',()=>{
 const z=row();z.perTask[0].sol.costUsd+=.001;
 const r=summarizeHistoricalSealedReference(z);
 assert.equal(r.ok,false);assert.equal(r.reason,'measured-paired-cost-or-grader-bill-mismatch');
});
test('quality regression cannot be rewritten as dominance',()=>{
 const z=row();z.perTask[1].sol.qualityScore=50;
 const r=summarizeHistoricalSealedReference(z);
 assert.equal(r.ok,false);
});
test('absent evidence is not zero observed tasks',()=>{
 const r=summarizeHistoricalSealedReference(null);
 assert.equal(r.ok,false);
 assert.equal(r.historicDistinctTaskCount,null);
 assert.equal(r.inferenceCallsPerformed,0);
});
