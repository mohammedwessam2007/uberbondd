import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {compileC21EvidenceCampaign} from '../src/c21-evidence-factory.mjs';
import {compileC21DimensionEvidence} from '../src/c21-dimension-evidence-producer.mjs';

const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const REV='candidate@1';
const ID='uberbond-main';
const DIM='adversarial robustness';
const frozen=compileC21EvidenceCampaign({candidateId:ID,candidateRevision:REV,frozenAt:'2026-09-12T20:00:00Z',rotationSaltDigest:'1'.repeat(64)});
assert.equal(frozen.ok,true);
const campaign=frozen.campaign;
const cell=campaign.cells.find(row=>row.dimension===DIM);

const components=[
  {componentId:'planner-a',revision:'model-a@1',lineageRef:'lineage:model-a',role:'PLANNER',capabilityState:'APPROVED',countsAsIndependentVote:true},
  {componentId:'critic-b',revision:'model-b@7',lineageRef:'lineage:model-b',role:'CRITIC',capabilityState:'APPROVED',countsAsIndependentVote:true},
  {componentId:'guard-tool',revision:'tool@4',lineageRef:'lineage:guard-tool',role:'TOOL',capabilityState:'ACTIVE',countsAsIndependentVote:false}
];
function compositionDigest(){
  const normalized=components.map(row=>({...row,role:String(row.role).toUpperCase(),capabilityState:String(row.capabilityState).toUpperCase(),countsAsIndependentVote:row.countsAsIndependentVote===true})).sort((a,b)=>a.componentId.localeCompare(b.componentId));
  return hash({compositionId:ID,revision:REV,components:normalized});
}
function arm(systemId,revision,score){return {systemId,revision,score,scoreInterval:{low:score-0.01,high:score+0.01},computeUnits:100,toolBudgetRef:'tool-budget:equal-v1',wallTimeMs:10_000,monetaryCostMicros:500_000,humanAssistanceMinutes:0};}
function family(id,current,candidate,protectedGate=false){return {familyId:id,measurementEvidenceRef:`observed:${id}:sealed`,measurementClass:'OBSERVED_EVALUATION',taskSetHash:hash({id,version:1}),protectedGate,baseline:arm('parent-main','parent@1',current-0.03),current:arm('parent-main','parent@1',current),candidate:arm(ID,REV,candidate)};}
function compound(){
  const digest=compositionDigest();
  return {
    compositionId:ID,compositionRevision:REV,components:structuredClone(components),claimedIndependentVotes:2,evaluationSubjectDigest:digest,
    independentEvaluation:{experimentId:'c21-producer-eval-1',generatorId:ID,evaluatorId:'sealed-evaluator',generatorLineageRef:`composition:${digest}`,evaluatorLineageRef:'lineage:sealed-evaluator',generatorContextRef:'context:development',evaluatorContextRef:'context:sealed',developmentCaseIds:['dev-1','dev-2'],holdoutCaseIds:['holdout-1','holdout-2','holdout-3'],candidateExposedCaseIds:[],generatorEvidenceRefs:['evidence:candidate-raw'],evaluatorEvidenceRefs:['evidence:evaluator-raw'],rubricOwner:'EVALUATOR_PREDECLARED',rubricRef:'rubric:c21-producer-v1'},
    baselineSelection:{selectedBaselineId:'parent-main',selectedRevision:'parent@1',selectionEvidenceRef:'evidence:baseline-frozen',selectionOwner:'EVALUATOR_PREDECLARED',frozenBeforeEvaluation:true,alternatives:[{id:'parent-main',revision:'parent@1',evidenceRef:'evidence:parent-main',strengthRank:20,accessible:true,eligible:true},{id:'weaker-baseline',revision:'old@1',evidenceRef:'evidence:old',strengthRank:10,accessible:true,eligible:true}]},
    currentSystemId:'parent-main',currentSystemRevision:'parent@1',minimumMeaningfulGain:0.05,maxAllowedRegression:0.02,
    families:[family('forged-revision',0.50,0.75,true),family('dirty-worktree',0.52,0.76),family('malformed-revision',0.51,0.74),family('clean-control',0.55,0.73)],
    freshContextRetention:{mechanism:{mechanismId:ID,revision:REV,applicabilityConditions:['declared task families','matched evaluation budgets'],counterexamples:['revoked component','unseen family regression'],provenanceRefs:['commit:candidate','evaluation:c21-producer-eval-1'],rollbackRef:'parent@1'},priorContextRef:'context:development',freshContextRef:'context:fresh-replay',rehydration:{mechanismLoadedFromArtifact:true,hiddenConversationStateUsed:false,contextRef:'context:fresh-replay',mechanismRevision:REV},capabilityState:'APPROVED',revocationState:{revoked:false},holdout:{baselineScore:0.55,retainedScore:0.72},regression:{oldTaskRegressionRate:0.01,maxAllowedRegressionRate:0.02},protectedGateRegressions:[]},
    revocationSnapshot:{snapshotRef:'revocation:2026-09-12T20:00:00Z',verifiedAt:'2026-09-12T20:00:00Z',verifierId:'revocation-auditor',verifierLineageRef:'lineage:revocation-auditor',components:components.map(row=>({componentId:row.componentId,revision:row.revision,evidenceRef:`registry:${row.componentId}`,revoked:false}))},
    observedAt:'2026-09-12T20:30:00Z',maxRevocationAgeMs:3_600_000,
    decisionPolicy:{abstainOnInsufficientEvidence:true,noRecommendationOnValueBoundary:true,escalationBudgetRef:'budget:c21-producer-v1',maxEscalationSteps:2}
  };
}
function envelope(overrides={}){
  return {campaign,dimension:DIM,compoundInput:compound(),externalBenchmark:{observed:true,synthetic:false,surface:cell.benchmarkSurfaces[0],evidenceRef:'external:red-team-suite:run-1'},privateHoldout:{observed:true,synthetic:false,surface:cell.benchmarkSurfaces[1],evidenceRef:'private:red-team-holdout:run-1'},resourceBudget:{verified:true,digest:'b'.repeat(64)},verifier:{id:'verifier:sealed-c21',lineageRef:'lineage:sealed-c21',independentEvaluatorRef:'evaluator-record:sealed-c21',independent:true},observedAt:'2026-09-12T20:31:00Z',contaminationStatus:'BOUNDED_DISCLOSED',...overrides};
}

test('full successful C13 result is preserved in a durable C21 raw packet',()=>{
  const result=compileC21DimensionEvidence(envelope());
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.status,'C21_DIMENSION_EVIDENCE_PACKET_COMPILED');
  assert.equal(result.c21Row.compoundEvaluation.status,'COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE');
  assert.equal(result.rawPacket.compoundEvaluation.receiptHash,result.c21Row.compoundEvaluation.receiptHash);
  assert.equal(result.rawPacket.externalBenchmark.evidenceRef,'external:red-team-suite:run-1');
  assert.equal(result.rawPacket.privateHoldout.evidenceRef,'private:red-team-holdout:run-1');
  assert.match(result.packetDigest,/^[0-9a-f]{64}$/);
  assert.equal(result.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});

test('wrong candidate revision is refused before C13 can count',()=>{
  const input=envelope(); input.compoundInput.compositionRevision='other';
  const result=compileC21DimensionEvidence(input);
  assert.equal(result.ok,false); assert.ok(result.reasonCodes.includes('compound-input-must-bind-frozen-candidate'));
});

test('synthetic or missing benchmark surfaces cannot become evidence',()=>{
  const input=envelope(); input.externalBenchmark={...input.externalBenchmark,synthetic:true}; input.privateHoldout={...input.privateHoldout,observed:false};
  const result=compileC21DimensionEvidence(input);
  assert.equal(result.ok,false); assert.ok(result.reasonCodes.includes('observed-external-benchmark-bound-to-frozen-surface-required')); assert.ok(result.reasonCodes.includes('observed-private-holdout-bound-to-frozen-surface-required'));
});

test('one artifact cannot masquerade as both external and private evidence',()=>{
  const input=envelope(); input.privateHoldout={...input.privateHoldout,evidenceRef:input.externalBenchmark.evidenceRef};
  const result=compileC21DimensionEvidence(input);
  assert.equal(result.ok,false); assert.ok(result.reasonCodes.includes('external-and-private-evidence-must-be-distinct'));
});

test('collapsed verifier independence is refused',()=>{
  const input=envelope(); input.verifier={...input.verifier,independent:false};
  const result=compileC21DimensionEvidence(input);
  assert.equal(result.ok,false); assert.ok(result.reasonCodes.includes('independent-verifier-identity-lineage-and-evaluator-ref-required'));
});

test('C13 synthetic family provenance is rejected even when outer envelope looks valid',()=>{
  const input=envelope(); input.compoundInput.families[0].measurementClass='SYNTHETIC';
  const result=compileC21DimensionEvidence(input);
  assert.equal(result.ok,false); assert.ok(result.reasonCodes.includes('authenticated-c13-gain-evidence-required'));
  assert.equal(result.compoundEvaluation.ok,false);
});
