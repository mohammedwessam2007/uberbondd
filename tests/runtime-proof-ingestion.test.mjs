import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRestartRecoveryReceipt } from '../src/deploy-restart-recovery-receipt.mjs';
import { validateRestartRecoveryRuntimeEvidence } from '../src/runtime-proof-ingestion.mjs';

const sha='a'.repeat(40);
const receipt=()=>compileRestartRecoveryReceipt({sourceCommit:sha,environment:'POSTGRES',crashExitCode:91,replaySafeRecovered:1,replacementClaimCount:1,reconcileDeadLettered:true,reconcileReplacementClaimCount:0,cleanupOk:true,commands:['node scripts/deploy-restart-recovery-drill.mjs']});

test('exact canonical restart receipt can become runtime evidence without authority',()=>{
  const result=validateRestartRecoveryRuntimeEvidence({receipt:receipt(),expectedSourceCommit:sha,evidenceRef:'runtime:test'});
  assert.equal(result.accepted,true);
  assert.equal(result.status,'EXACT_SOURCE_RESTART_RECOVERY_RUNTIME_EVIDENCE_ACCEPTED');
  assert.equal(result.businessEffectAuthority,'NONE');
});

test('stale source receipt cannot close a current runtime cut',()=>{
  const result=validateRestartRecoveryRuntimeEvidence({receipt:receipt(),expectedSourceCommit:'b'.repeat(40),evidenceRef:'runtime:test'});
  assert.equal(result.accepted,false);
  assert.ok(result.reasonCodes.includes('restart-recovery-source-mismatch'));
});

test('mutated receipt cannot close a runtime cut',()=>{
  const forged=receipt();
  forged.observed.replacementClaimCount=2;
  const result=validateRestartRecoveryRuntimeEvidence({receipt:forged,expectedSourceCommit:sha,evidenceRef:'runtime:test'});
  assert.equal(result.accepted,false);
  assert.ok(result.reasonCodes.includes('canonical-restart-recovery-receipt-required'));
});
