import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createInfiniteOpusRuntime } from '../src/infinite-opus-native-runtime.mjs';

const h=value=>'sha256:'+crypto.createHash('sha256').update(String(value)).digest('hex');
const now=Date.parse('2026-09-30T14:30:00Z');

function makeStore(){
  let settings={};
  return {
    transaction:async fn=>fn({
      transactionClient:false,
      getSettings:async()=>structuredClone(settings),
      setSetting:async(key,value)=>{settings={...settings,[key]:structuredClone(value)};}
    })
  };
}
const base=(overrides={})=>({
  requestFingerprint:h('same-request'),
  finalOutputHash:h('same-output'),
  crownAdmissionReceiptHash:h('crown-admission'),
  crownProviderRequestId:'gen-crown-1',
  observedUpstreamProvider:'Anthropic',
  authorityClass:'CROWN_VERIFIED_SEMANTIC_ACCEPT',
  builderCostMicrousd:1000,
  crownCostMicrousd:2000,
  sideEffectAuthority:'NONE',
  ...overrides
});

test('first Crown interaction stores only recurrence metadata with no reuse authority',async()=>{
  const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now});
  const r=await runtime.recordCrownInteraction(base());
  assert.equal(r.ok,true);
  assert.equal(r.status,'SINGLETON_CROWN_INTERACTION_SHADOW');
  assert.equal(r.semanticReuseAuthority,'NONE');
  assert.equal(r.recurrence.rawConversationPersisted,false);
  const snapshot=await runtime.snapshot();
  assert.equal(snapshot.crownInteractionFingerprints,1);
  assert.equal(snapshot.recurrentCrownCompilerCandidates,0);
});

test('same exact request and output becomes compiler candidate but never semantic authority',async()=>{
  const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now});
  await runtime.recordCrownInteraction(base());
  const second=await runtime.recordCrownInteraction(base({crownProviderRequestId:'gen-crown-2'}));
  assert.equal(second.status,'RECURRENT_EXACT_OUTPUT_SHADOW_COMPILER_CANDIDATE');
  assert.equal(second.recurrence.occurrences,2);
  assert.equal(second.recurrence.distinctOutputCount,1);
  assert.equal(second.recurrence.repeatedFrontierCostMicrousd,3000);
  assert.equal(second.semanticReuseAuthority,'NONE');
  const plan=await runtime.crownCapitalizationPlan();
  assert.equal(plan.candidateCount,1);
  assert.equal(plan.candidates[0].semanticReuseAuthority,'NONE');
  assert.equal(plan.candidates[0].rawConversationPersisted,false);
  assert.equal(plan.candidates[0].compilerPriorityMicrousd,3000);
});

test('recurrent output disagreement is surfaced as reconciliation debt, never silently cached',async()=>{
  const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now});
  await runtime.recordCrownInteraction(base());
  await runtime.recordCrownInteraction(base({crownProviderRequestId:'gen-crown-2'}));
  const third=await runtime.recordCrownInteraction(base({
    crownProviderRequestId:'gen-crown-3',
    finalOutputHash:h('different-output'),
    builderCostMicrousd:500,
    crownCostMicrousd:2500
  }));
  assert.equal(third.status,'RECURRENT_DIVERGENT_OUTPUT_SHADOW_REQUIRES_RECONCILIATION');
  assert.equal(third.recurrence.distinctOutputCount,2);
  assert.equal(third.semanticReuseAuthority,'NONE');
});

test('duplicate interaction receipt is idempotent and cannot inflate recurrence economics',async()=>{
  const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now});
  const first=await runtime.recordCrownInteraction(base());
  const duplicate=await runtime.recordCrownInteraction(base());
  assert.equal(duplicate.status,'IDEMPOTENT_CROWN_INTERACTION_RECORD');
  const plan=await runtime.crownCapitalizationPlan();
  assert.equal(plan.candidateCount,0);
  const snapshot=await runtime.snapshot();
  assert.equal(snapshot.crownInteractionFingerprints,1);
  assert.equal(first.recurrence.occurrences,1);
});

test('capitalization plan rejects unbounded reads and persists no prompt or answer text',async()=>{
  const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now});
  await runtime.recordCrownInteraction(base());
  await runtime.recordCrownInteraction(base({crownProviderRequestId:'gen-crown-2'}));
  await assert.rejects(()=>runtime.crownCapitalizationPlan({limit:1000}),/bounded-capitalization-plan-limit-required/);
  const plan=await runtime.crownCapitalizationPlan({limit:10});
  const encoded=JSON.stringify(plan);
  assert.equal(encoded.includes('same-request'),false);
  assert.equal(encoded.includes('same-output'),false);
  assert.match(encoded,/rawConversationPersisted/);
});
