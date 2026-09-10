import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFutureCapability, compileTemporalFoundryRaid } from '../src/temporal-foundry.mjs';

const capability={
  futureCapabilityName:'Ambient Coupled Cognition',
  terminalContract:'Relevant cognition is available with minimal explicit interaction while preserving founder sovereignty and truth boundaries.',
  horizonLabel:'historically labeled future capability',
  terminalFunctionIds:['serve'],
  functions:[
    {id:'context',label:'Authorized current context',weight:20,requires:[],realizationState:'PRESENT_VERIFIED',evidenceRefs:['source:existing-sensorium']},
    {id:'memory',label:'Persistent personal memory',weight:20,requires:[],realizationState:'PRESENT_COMPOSABLE',evidenceRefs:['source:existing-memory']},
    {id:'prefetch',label:'Predict and prepare likely useful cognition',weight:25,requires:['context','memory'],realizationState:'INTERNAL_PRIMITIVE_MISSING',evidenceRefs:[]},
    {id:'interface',label:'High-bandwidth invasive neural interface',weight:15,requires:[],realizationState:'EXTERNAL_OR_PHYSICAL_FLOOR',evidenceRefs:['evidence:requires-external-neurotechnology']},
    {id:'serve',label:'Deliver relevant cognition with low friction',weight:20,requires:['prefetch'],realizationState:'INTERNAL_PRIMITIVE_MISSING',evidenceRefs:[]}
  ]
};

function validRaid(requirementName='Predictive Context Prefetch Compiler'){
  return{
    futureCapability:capability,
    primitiveCandidate:{
      requirementName,
      name:'Compile context and memory into proactive cognition prefetch',
      unlockFunctionIds:['prefetch','serve'],
      evidenceRefs:['context:existing-sensorium-and-memory-primitives'],
      rationale:'Both internal missing functions are causally downstream of already evidenced present primitives and can be attacked without claiming the external neural-interface function.'
    }
  };
}

test('decomposes a far-future label into present, pullable, physical and unknown function weight',()=>{
  const out=analyzeFutureCapability(capability);
  assert.equal(out.ok,true);
  assert.equal(out.totalFunctionWeight,100);
  assert.equal(out.presentCapturedWeight,40);
  assert.equal(out.presentFunctionCaptureRatio,0.4);
  assert.equal(out.internallyPullableWeight,45);
  assert.equal(out.externalOrPhysicalFloorWeight,15);
  assert.match(out.futureLabelBoundary,/NOT_EVIDENCE/);
});

test('pulls function forward through one dependency-satisfied internal primitive without claiming physical completion',()=>{
  const out=compileTemporalFoundryRaid(validRaid());
  assert.equal(out.ok,true);
  assert.equal(out.status,'TEMPORAL_FOUNDRY_PRIMITIVE_READY');
  assert.equal(out.trustedEvidence.futureFunctionWeightPulledForward,45);
  assert.equal(out.trustedEvidence.presentFunctionCaptureRatio,0.4);
  assert.equal(out.trustedEvidence.projectedFunctionCaptureRatio,0.85);
  assert.equal(out.trustedEvidence.remainingExternalOrPhysicalFloorWeight,15);
  assert.equal(out.trustedEvidence.terminalContractPreserved,true);
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('present capability claims require evidence instead of future-function theater',()=>{
  const bad=structuredClone(capability);
  bad.functions.find(row=>row.id==='context').evidenceRefs=[];
  const out=analyzeFutureCapability(bad);
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('valid-future-function-decomposition-required'));
});

test('an external or physical floor cannot be relabeled as an internal primitive',()=>{
  const raid=validRaid();
  raid.primitiveCandidate.unlockFunctionIds=['interface'];
  const out=compileTemporalFoundryRaid(raid);
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.some(code=>code.includes('only-internal-missing-functions-may-be-pulled-forward:interface')));
});

test('a future function with an unresolved external dependency cannot count as pulled forward',()=>{
  const bad=structuredClone(capability);
  bad.functions.find(row=>row.id==='serve').requires=['prefetch','interface'];
  const raid=validRaid();
  raid.futureCapability=bad;
  const out=compileTemporalFoundryRaid(raid);
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.some(code=>code.includes('pull-forward-dependencies-not-satisfied:serve')));
});

test('future-function dependency cycles fail closed',()=>{
  const bad=structuredClone(capability);
  bad.functions.find(row=>row.id==='context').requires=['serve'];
  const out=analyzeFutureCapability(bad);
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('future-function-dependency-cycle-refused'));
});

test('horizon labels are descriptive and never become proof of duration',()=>{
  const exaggerated=structuredClone(capability);
  exaggerated.horizonLabel='year 2100 science fiction';
  const out=analyzeFutureCapability(exaggerated);
  assert.equal(out.ok,true);
  assert.equal(out.presentFunctionCaptureRatio,0.4);
  assert.match(out.futureLabelBoundary,/NOT_EVIDENCE/);
});
