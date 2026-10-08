import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInfiniteOpusScoreboard} from '../src/infinite-opus-scoreboard.mjs';

test('never self-promote caller-asserted financial models to an economic result',()=>{
 const view=buildInfiniteOpusScoreboard({
  provableEconomics:{ok:true,status:'REFERENCE_COUNTERFACTUAL_ARITHMETIC_ONLY',
   referenceCompressionFactor:1000000,directFrontierReferenceMicrousd:1000000000000,
   avoidedReferenceMicrousd:999999999000,target33333xMet:true,certifiedExecutions:20000},
  runtimeSnapshot:{metrics:{referenceCompressionFactor:55555}}
 });
 assert.equal(view.REFERENCE_COMPRESSION_FACTOR,'UNKNOWN');
 assert.equal(view.CONSERVATIVE_REFERENCE_COST,'UNKNOWN');
 assert.equal(view.PROVABLE_AVOIDED_REFERENCE_COST,'UNKNOWN');
 assert.equal(view.TARGET_33333X_MET,'NOT_EMPIRICALLY_VERIFIED');
});

test('verified actual source-work and E3 counters remain distinct',()=>{
 const view=buildInfiniteOpusScoreboard({
  sourceWorkProgress:{verified:true,verifiedSourceCount:7,
   exactAnswersActuallyResolvedAndVerified:1333},
  nativeWorkProgress:{ok:true,status:'TRUSTED_NATIVE_EXECUTION_COUNTS_RECONCILED',
   certifiedPolicyWorkCompleted:0}
 });
 assert.equal(view.VERIFIED_EXACT_SOURCE_OPERATIONS,1333);
 assert.equal(view.VERIFIED_EXACT_SOURCE_FILES,7);
 assert.equal(view.NATIVE_E3_COMPLETED,0);
 assert.equal(view.REFERENCE_COMPRESSION_FACTOR,'UNKNOWN');
});

test('unreconciled or spoofed work progress does not enter the scoreboard',()=>{
 const view=buildInfiniteOpusScoreboard({
  sourceWorkProgress:{verified:false,exactAnswersActuallyResolvedAndVerified:9000000,
   verifiedSourceCount:500},
  nativeWorkProgress:{ok:false,certifiedPolicyWorkCompleted:6000000}
 });
 assert.equal(view.VERIFIED_EXACT_SOURCE_OPERATIONS,'UNKNOWN');
 assert.equal(view.VERIFIED_EXACT_SOURCE_FILES,'UNKNOWN');
 assert.equal(view.NATIVE_E3_COMPLETED,'UNKNOWN');
});
