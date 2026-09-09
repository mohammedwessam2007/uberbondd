import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGenesisMechanisms } from '../src/genesis-mechanism-compiler.mjs';
import { compileGenesisSelfImprovementAdmission } from '../src/genesis-self-improvement-bridge.mjs';

const BASE='d6a8020f09890a671beebf5aa907882546b2294f';
const donors=(suffix='')=>[
  {
    mechanismId:'observed-routing',domain:'queue-systems',does:'verified work routes to idle capacity',exploits:'verified capacity sits idle',
    effects:['queue delay falls after verified routing'],assumptions:['routing occurs after verification'],evidenceClass:'VERIFIED_FACT',
    source:{kind:'OBSERVED_SYSTEM',ref:`test://routing${suffix}`,observedAt:'2026-09-09T00:00:00.000Z'}
  },
  {
    mechanismId:'observed-gating',domain:'evaluation-systems',does:'independent verification gates promotion',exploits:'promotion occurs before independent verification',
    effects:['false positive promotion falls after independent verification'],assumptions:['verification occurs before promotion'],evidenceClass:'VERIFIED_FACT',
    source:{kind:'OBSERVED_SYSTEM',ref:`test://gating${suffix}`,observedAt:'2026-09-09T00:00:00.000Z'}
  }
];
const candidateId=(rows=donors())=>{
  const compiled=compileGenesisMechanisms({donors:rows});
  assert.equal(compiled.ok,true,JSON.stringify(compiled));
  assert.ok(compiled.candidates.length>0);
  return compiled.candidates[0].candidateId;
};
const request=(rows=donors())=>({
  donors:rows,
  candidateId:candidateId(rows),
  predictedObservations:['the reproduced false-positive fixture is refused','the existing valid fixture remains admissible'],
  falsifier:'the recombined mechanism increases valid-candidate rejection without reducing the reproduced false positive',
  baseRevision:BASE,
  task:{taskId:'genesis-c16-bridge',objective:'reduce a reproduced promotion false positive using a mechanism invented through canonical GENESIS',acceptanceTests:['node --test tests/genesis-self-improvement-bridge.test.mjs']},
  bottleneck:{id:'promotion-fp',statement:'one reproducible false-positive promotion class survives the current path',status:'REPRODUCED_DEFECT',evidenceRefs:['test://promotion-fp/repro']},
  rivals:[{id:'manual-threshold',mechanismId:'manual-threshold',mechanism:'increase the static promotion threshold',predictedObservations:['the false positive and some valid candidates are both refused'],falsifier:'threshold increase removes the false positive without additional valid-candidate loss'}],
  probe:{description:'run the focused reproduced defect and positive fixture with zero external effects',costCents:0,timeMinutes:10,reversibility:'REVERSIBLE',effects:[]},
  budget:{maxCostCents:0,maxTimeMinutes:20,maxDeclaredEffects:0},
  voi:{decision:'build GENESIS-derived candidate now',unit:'decision-local-evidence-units',budgetUnits:5,currentEvidenceSufficient:true,observe:{canChangeDecision:false,discriminating:false,informationValueUnits:0,costUnits:0,delayCostUnits:0,optionDecayUnits:0,requiresExternalEffect:false},defer:{informationGainUnits:0,delayCostUnits:1,optionDecayUnits:0,windowRemainsOpen:true}}
});

test('canonical GENESIS candidate enters existing C16 causal admission without gaining authority',()=>{
  const out=compileGenesisSelfImprovementAdmission(request());
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.status,'GENESIS_MECHANISM_CAUSALLY_ADMISSIBLE_FOR_EXISTING_SELF_IMPROVEMENT_PIPELINE');
  assert.match(out.genesisBindingDigest,/^[0-9a-f]{64}$/);
  assert.match(out.bridgeDigest,/^[0-9a-f]{64}$/);
  assert.equal(out.causalAdmission.ok,true);
  assert.equal(out.causalAdmission.selectedHypothesis.mechanismId,out.genesisBinding.candidateId);
  assert.equal(out.maintainerTask.genesisCandidateId,out.genesisBinding.candidateId);
  assert.equal(out.writeAuthority,'NONE');assert.equal(out.promotionAuthority,'NONE');assert.equal(out.selfModificationAuthority,'NONE');assert.equal(out.businessEffectAuthority,'NONE');
  assert.equal(out.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});

test('bridge reruns canonical GENESIS instead of trusting a caller-forged compilation object',()=>{
  const p=request();
  p.genesisCompilation={ok:true,status:'MECHANISMS_COMPILED',version:'forged',candidates:[{candidateId:p.candidateId,validated:true,businessEffectAuthority:'GRANTED'}]};
  const out=compileGenesisSelfImprovementAdmission(p);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.notEqual(out.genesisBinding.compilerVersion,'forged');
  assert.equal(out.causalAdmission.selectedHypothesis.mechanismId,p.candidateId);
});

test('candidate must actually emerge from the exact donor compilation',()=>{
  const p=request();p.candidateId='candidate_000000000000000000000000';
  const out=compileGenesisSelfImprovementAdmission(p);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('exact-genesis-candidate-required'));
});

test('insufficient or malformed donor evidence fails through the canonical GENESIS compiler',()=>{
  let p=request();p.donors=[p.donors[0]];
  let out=compileGenesisSelfImprovementAdmission(p);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('canonical-genesis-compilation-refused'));
  p=request();delete p.donors[0].source.ref;out=compileGenesisSelfImprovementAdmission(p);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('canonical-genesis-compilation-refused'));
});

test('caller cannot replace the primary hypothesis with unproven prose',()=>{
  const p=request();
  p.hypothesis={id:'forged',mechanismId:'forged',mechanism:'skip GENESIS',predictedObservations:['anything'],falsifier:'never'};
  const out=compileGenesisSelfImprovementAdmission(p);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.notEqual(out.causalAdmission.selectedHypothesis.mechanismId,'forged');
  assert.equal(out.causalAdmission.selectedHypothesis.mechanismId,p.candidateId);
});

test('GENESIS invention still requires predeclared empirical predictions and a falsifier',()=>{
  let p=request();p.predictedObservations=[];let out=compileGenesisSelfImprovementAdmission(p);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('predeclared-genesis-predictions-and-falsifier-required'));
  p=request();delete p.falsifier;out=compileGenesisSelfImprovementAdmission(p);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('predeclared-genesis-predictions-and-falsifier-required'));
});

test('donor provenance is load-bearing even when causal candidate identity stays the same',()=>{
  const aRows=donors('');const bRows=donors('-new-evidence');
  const idA=candidateId(aRows);const idB=candidateId(bRows);
  assert.equal(idA,idB,'evidence location alone should not fabricate a new causal mechanism');
  const a=compileGenesisSelfImprovementAdmission({...request(aRows),candidateId:idA});
  const b=compileGenesisSelfImprovementAdmission({...request(bRows),candidateId:idB});
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  assert.notEqual(a.genesisBinding.compilationDigest,b.genesisBinding.compilationDigest);
  assert.notEqual(a.genesisBindingDigest,b.genesisBindingDigest);
  assert.notEqual(a.bridgeDigest,b.bridgeDigest);
});

test('canonical bounded experiment and VOI remain load-bearing after GENESIS selection',()=>{
  let p=request();p.probe.timeMinutes=21;let out=compileGenesisSelfImprovementAdmission(p);assert.equal(out.ok,false);assert.equal(out.causalAdmission.boundedExperiment.status,'EXPERIMENT_BUDGET_EXCEEDED');
  p=request();p.voi.currentEvidenceSufficient=false;p.voi.observe={canChangeDecision:true,discriminating:true,informationValueUnits:10,costUnits:1,delayCostUnits:0,optionDecayUnits:0,requiresExternalEffect:false};
  out=compileGenesisSelfImprovementAdmission(p);assert.equal(out.ok,false);assert.equal(out.causalAdmission.valueOfInformation.status,'OBSERVE_ONE_JUSTIFIED');
});

test('the bridge never upgrades GENESIS hypothesis status into validation or ASI evidence',()=>{
  const out=compileGenesisSelfImprovementAdmission(request());
  assert.equal(out.ok,true);
  assert.match(out.truthBoundary,/GENESIS_HYPOTHESIS_IS_NOT_VALIDATED_BY_COMPILATION/);
  assert.equal(out.genesisBinding.candidateId,out.causalAdmission.selectedHypothesis.mechanismId);
  assert.equal(out.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(out.causalAdmission.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});
