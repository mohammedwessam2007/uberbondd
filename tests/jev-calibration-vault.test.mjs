import test from 'node:test';
import assert from 'node:assert/strict';
import { recordJevCalibrationObservation, readJevCalibrationSummary } from '../src/jev-calibration-vault.mjs';

const makeStore=()=>{
  let settings={};
  return {
    transaction:async fn=>fn({
      getSettings:async()=>structuredClone(settings),
      setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}
    }),
    dump:()=>structuredClone(settings)
  };
};

test('JEV calibration stores only safe control/outcome metadata and cannot self-promote',async()=>{
  const store=makeStore();
  const out=await recordJevCalibrationObservation(store,{
    requestFingerprint:'sha256:fixture-request',
    sessionRoot:'sha256:fixture-session',
    jevModel:'typesafe/jev-1.13',
    jevModelRevision:'typesafe/jev-1.13-20260917',
    jevAnswers:{
      task_shape:{choice:'research',confidence:.9},
      hard_reasoning:{score:2,confidence:.8},
      crown_necessity:{noul:.95}
    },
    selectedWriterId:'solPro',
    writerModel:'openai/gpt-6.1-sol-pro',
    crownOutcome:'CROWN_ACCEPTED_BUILDER',
    jevCostMicrousd:42,
    writerCostMicrousd:13000,
    criticCostMicrousd:0,
    crownCostMicrousd:2000,
    jevProviderRequestId:'jev-1',
    writerProviderRequestId:'writer-1',
    crownProviderRequestId:'crown-1'
  },Date.parse('2026-10-07T12:00:00Z'));
  assert.equal(out.ok,true);
  const summary=await readJevCalibrationSummary(store);
  assert.equal(summary.totalObservations,1);
  assert.equal(summary.acceptedWithoutMutation,1);
  assert.equal(summary.promotionState,'SHADOW');
  assert.equal(summary.promotionEligible,false);
  assert.equal(summary.crownSuppressionAuthority,'NONE');
  assert.equal(summary.rawPayloadsStored,false);

  const raw=JSON.stringify(store.dump());
  assert.doesNotMatch(raw,/raw prompt|candidate answer|crown answer/i);
});

test('JEV calibration distinguishes patch and rewrite supervision',async()=>{
  const store=makeStore();
  const base={
    sessionRoot:'s',jevModel:'typesafe/jev-1.13',jevAnswers:{hard_reasoning:{score:1}},
    selectedWriterId:'sol',writerModel:'openai/gpt-6.1-sol',
    jevCostMicrousd:10,writerCostMicrousd:100,crownCostMicrousd:100
  };
  await recordJevCalibrationObservation(store,{...base,requestFingerprint:'r1',crownOutcome:'CROWN_PATCHED_BUILDER'},1);
  await recordJevCalibrationObservation(store,{...base,requestFingerprint:'r2',crownOutcome:'CROWN_REWROTE'},2);
  const summary=await readJevCalibrationSummary(store);
  assert.equal(summary.totalObservations,2);
  assert.equal(summary.patched,1);
  assert.equal(summary.rewritten,1);
  assert.equal(summary.acceptedWithoutMutation,0);
});

test('JEV calibration is idempotent for the exact provider evidence tuple',async()=>{
  const store=makeStore();
  const row={
    requestFingerprint:'r',sessionRoot:'s',jevModel:'typesafe/jev-1.13',
    selectedWriterId:'sol',writerModel:'openai/gpt-6.1-sol',
    crownOutcome:'CROWN_ACCEPTED_BUILDER',
    jevProviderRequestId:'j',writerProviderRequestId:'w',crownProviderRequestId:'c'
  };
  const a=await recordJevCalibrationObservation(store,row,1);
  const b=await recordJevCalibrationObservation(store,row,2);
  assert.equal(a.observationId,b.observationId);
  assert.equal(b.status,'JEV_CALIBRATION_IDEMPOTENT');
  assert.equal((await readJevCalibrationSummary(store)).totalObservations,1);
});
