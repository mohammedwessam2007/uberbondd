import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSystemLevelAsiEvidence, CANONICAL_ASI_DIMENSIONS } from '../src/system-level-asi-evidence.mjs';

const D=i=>(String(i).repeat(64)).slice(0,64).replace(/[^0-9a-f]/g,'a');
const baseRow=(dimension,i)=>({
  dimension,
  evidenceRef:`evidence://c21/${i}`,
  independentEvaluatorRef:`evaluator://independent/${i}`,
  verifierId:`verifier-${i%4}`,
  verifierLineageRef:`lineage://verifier/${i%4}`,
  taskPopulationHash:D((i%9)+1),
  observedAt:'2026-09-09T02:00:00Z',
  baselineVerifiedAtEvaluationTime:true,
  thresholdFrozenBeforeEvaluation:true,
  freshContextHeldout:true,
  freshContextRetained:true,
  contaminationStatus:'CLEAN',
  evaluatorIndependent:true,
  compoundEvaluation:{
    ok:true,
    status:'COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE',
    evidenceStage:'FRESH_CONTEXT_REPRODUCED_WITH_CROSS_DOMAIN_TRANSFER_SUPPORT',
    asiStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    compositionDigest:'a'.repeat(64),
    compositionId:'uberbond.candidate',
    compositionRevision:'candidate@1',
    generalityClaim:'WITHHELD__DEFINED_TASK_POPULATION_ONLY'
  }
});
const rows=()=>CANONICAL_ASI_DIMENSIONS.map((d,i)=>({...baseRow(d,i),taskPopulationHash:(i.toString(16).padStart(64,'0'))}));
const run=(dimensions=rows())=>evaluateSystemLevelAsiEvidence({candidateId:'uberbond.candidate',candidateRevision:'candidate@1',dimensions,observedAt:'2026-09-09T02:30:00Z'});

test('all canonical dimensions can earn strong-within-defined-scope evidence while ASI remains not established',()=>{
  const r=run();
  assert.equal(r.ok,true);
  assert.equal(r.evidenceStage,'SYSTEM_LEVEL_ASI_EVIDENCE_STRONG_WITHIN_DEFINED_SCOPE');
  assert.equal(r.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(r.selfModificationAuthority,'NONE');
});

test('missing a critical dimension prevents partial stage even with many other dimensions',()=>{
  const r=run(rows().filter(x=>x.dimension!=='adversarial robustness'));
  assert.equal(r.ok,true);
  assert.equal(r.evidenceStage,'SYSTEM_LEVEL_ASI_EVIDENCE_NOT_ESTABLISHED');
});

test('subset covering critical dimensions and enough breadth can only earn partial evidence',()=>{
  const keep=new Set(['causal reasoning','planning under uncertainty','long-horizon coherence','transfer between domains','self-improvement','adversarial robustness','calibrated refusal and ignorance detection','novel problem solving','scientific discovery','software engineering','mathematical reasoning','forecasting']);
  const r=run(rows().filter(x=>keep.has(x.dimension)));
  assert.equal(r.evidenceStage,'SYSTEM_LEVEL_ASI_EVIDENCE_PARTIAL');
  assert.equal(r.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});

test('duplicate evidence cannot be cloned across dimensions',()=>{
  const x=rows(); x[1].evidenceRef=x[0].evidenceRef;
  const r=run(x); assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('one-observed-evidence-record-cannot-be-cloned-across-dimensions'));
});

test('task population reuse cannot inflate cross-domain breadth',()=>{
  const x=rows(); x[1].taskPopulationHash=x[0].taskPopulationHash;
  const r=run(x); assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('task-population-hash-reuse-across-dimensions-refused'));
});

test('stale evidence is refused',()=>{
  const x=rows(); x[0].observedAt='2025-01-01T00:00:00Z';
  assert.equal(run(x).ok,false);
});

test('wrong candidate C13 evidence is refused',()=>{
  const x=rows(); x[0].compoundEvaluation={...x[0].compoundEvaluation,compositionId:'other'};
  assert.equal(run(x).ok,false);
});

test('fresh-context retention must be explicit',()=>{
  const x=rows(); x[0].freshContextRetained=false;
  assert.equal(run(x).ok,false);
});

test('post-hoc threshold freezing is refused',()=>{
  const x=rows(); x[0].thresholdFrozenBeforeEvaluation=false;
  assert.equal(run(x).ok,false);
});

test('baseline must be verified at evaluation time',()=>{
  const x=rows(); x[0].baselineVerifiedAtEvaluationTime=false;
  assert.equal(run(x).ok,false);
});

test('correlated verifier identities cannot satisfy independence minimum',()=>{
  const x=rows().map(r=>({...r,verifierId:'same',verifierLineageRef:'lineage://same'}));
  const r=run(x); assert.equal(r.ok,true); assert.equal(r.evidenceStage,'SYSTEM_LEVEL_ASI_EVIDENCE_NOT_ESTABLISHED');
});

test('unexpected dimensions are refused instead of expanding denominator ad hoc',()=>{
  const x=rows(); x.push({...baseRow('telepathy',99),taskPopulationHash:'f'.repeat(64)});
  const r=run(x); assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('only-canonical-c21-dimensions-may-count'));
});
