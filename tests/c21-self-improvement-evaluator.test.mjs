import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWholeSystemSelfImprovement } from '../scripts/c21-self-improvement-evaluator.mjs';

const D='a'.repeat(64);
const family=(id,current=100,candidate=20)=>({
  familyId:id,
  currentLatenciesNs:Array.from({length:21},()=>current),
  candidateLatenciesNs:Array.from({length:21},()=>candidate),
  currentSemanticDigest:'b'.repeat(64),
  candidateSemanticDigest:'b'.repeat(64),
  currentAuthorityDigest:'c'.repeat(64),
  candidateAuthorityDigest:'c'.repeat(64),
  currentTruthBoundaryDigest:'d'.repeat(64),
  candidateTruthBoundaryDigest:'d'.repeat(64),
  wallTimeBudgetMs:5000,
  monetaryCostMicros:0,
  humanAssistanceMinutes:0,
  externalTools:'NONE'
});
const run=(families=[
  family('MILLION_WORMHOLE_GLOBAL_PRIOR_TOPK'),
  family('OPPORTUNITY_BUILD_DISTANCE_BATCH'),
  family('CAPABILITY_GRAPH_TOPOLOGY_BATCH')
])=>evaluateWholeSystemSelfImprovement({
  contractDigest:D,
  expectedContractDigest:D,
  candidateId:'UBERBOND_WHOLE_SYSTEM_C21_20260911',
  expectedCandidateId:'UBERBOND_WHOLE_SYSTEM_C21_20260911',
  candidateRevision:'1'.repeat(40),
  taskPopulationHash:'2'.repeat(64),
  families
});

test('predeclared evaluator supports robust gain across at least two of three families',()=>{
  const result=run();
  assert.equal(result.ok,true);
  assert.equal(result.supported,true);
  assert.equal(result.robustImprovedFamilies,3);
  assert.equal(result.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});

test('semantic drift is refused even when latency looks faster',()=>{
  const rows=[family('MILLION_WORMHOLE_GLOBAL_PRIOR_TOPK'),family('OPPORTUNITY_BUILD_DISTANCE_BATCH'),family('CAPABILITY_GRAPH_TOPOLOGY_BATCH')];
  rows[0].candidateSemanticDigest='e'.repeat(64);
  const result=run(rows);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('MILLION_WORMHOLE_GLOBAL_PRIOR_TOPK:semantic-identity-required'));
});

test('wrong candidate identity cannot enter the frozen exam',()=>{
  const result=evaluateWholeSystemSelfImprovement({contractDigest:D,expectedContractDigest:D,candidateId:'OTHER',expectedCandidateId:'UBERBOND_WHOLE_SYSTEM_C21_20260911',candidateRevision:'1'.repeat(40),taskPopulationHash:'2'.repeat(64),families:[family('A'),family('B'),family('C')]});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('frozen-candidate-id-mismatch'));
});

test('budget mismatch is refused rather than rewarded',()=>{
  const rows=[family('A'),family('B'),family('C')];
  rows[1].wallTimeBudgetMs=6000;
  const result=run(rows);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('B:frozen-matched-budget-required'));
});
