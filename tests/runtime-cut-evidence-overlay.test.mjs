import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeCutEvidenceOverlay } from '../src/runtime-cut-evidence-overlay.mjs';

const base={runtimeProofRequiredCuts:['SOURCE_REPOSITORY_HOST','DATABASE_STATE','WEB_RUNTIME_HOST','WORKER_SCHEDULER_PROCESS'],externalProviderCuts:['MODEL_PROVIDER']};

test('validated restart evidence closes only database and worker runtime cuts',()=>{
  const result=applyRuntimeCutEvidenceOverlay({cutSetReport:base,restartRecoveryEvidence:{accepted:true,evidenceRef:'runtime:test',receiptDigest:'sha256:test',sourceCommit:'a'.repeat(40)}});
  assert.deepEqual(result.runtimeProofRequiredCuts,['SOURCE_REPOSITORY_HOST','WEB_RUNTIME_HOST']);
  assert.deepEqual(result.runtimeEvidenceOverlay.closedRuntimeCuts,['DATABASE_STATE','WORKER_SCHEDULER_PROCESS']);
  assert.deepEqual(result.externalProviderCuts,['MODEL_PROVIDER']);
});

test('rejected or absent runtime evidence closes nothing',()=>{
  for(const evidence of [null,{accepted:false,evidenceRef:'runtime:forged'}]){
    const result=applyRuntimeCutEvidenceOverlay({cutSetReport:base,restartRecoveryEvidence:evidence});
    assert.deepEqual(result.runtimeProofRequiredCuts,base.runtimeProofRequiredCuts);
    assert.deepEqual(result.runtimeEvidenceOverlay.closedRuntimeCuts,[]);
  }
});
