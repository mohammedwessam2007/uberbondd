import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseUberLitRuntime } from '../src/uberlit-runtime-doctor.mjs';

const SHA='a'.repeat(40);
const RELEASE=`uberlit_${'b'.repeat(32)}`;
const now=2_000_000;
const pointer={sourceCommit:SHA,releaseId:RELEASE};
const liveness={status:'LIVE_WEALTH_ADVANCING',shouldRestart:false,autopilotEnabled:true,childAlive:true,sourceCommit:SHA,releaseId:RELEASE,heartbeatAt:new Date(now-2_000).toISOString(),wealthReceiptFresh:true,wealthReceiptAgeMs:3_000,privateValue:'must-not-copy'};
const healthy=override=>diagnoseUberLitRuntime({nowMs:now,expectedSourceCommit:SHA,pointer,liveness,wealthReceiptMtimeMs:now-3_000,...override});

test('healthy binds exact source release live worker and fresh wealth receipt',()=>{const x=healthy();assert.equal(x.ok,true);assert.equal(x.status,'UBERLIT_WEALTH_RUNTIME_HEALTHY');assert.deepEqual(x.reasonCodes,[]);});
test('missing liveness fails closed',()=>{const x=healthy({liveness:null});assert.equal(x.ok,false);assert.ok(x.reasonCodes.includes('liveness-missing'));});
test('stale heartbeat fails closed',()=>{const x=healthy({liveness:{...liveness,heartbeatAt:new Date(now-40_000).toISOString()}});assert.ok(x.reasonCodes.includes('liveness-heartbeat-stale'));});
test('source and release drift fail closed',()=>{const x=healthy({liveness:{...liveness,sourceCommit:'c'.repeat(40),releaseId:`uberlit_${'d'.repeat(32)}`}});assert.ok(x.reasonCodes.includes('liveness-source-mismatch'));assert.ok(x.reasonCodes.includes('liveness-release-mismatch'));});
test('missing or stale wealth receipt fails closed',()=>{assert.ok(healthy({wealthReceiptMtimeMs:null}).reasonCodes.includes('wealth-receipt-missing'));assert.ok(healthy({wealthReceiptMtimeMs:now-400_000}).reasonCodes.includes('wealth-receipt-stale'));});
test('restart request or non-advancing status is unhealthy',()=>{const x=healthy({liveness:{...liveness,status:'DEGRADED_STALE_WEALTH_RECEIPT',shouldRestart:true}});assert.ok(x.reasonCodes.some(value=>value.startsWith('liveness-status:')));assert.ok(x.reasonCodes.includes('liveness-restart-requested'));});
test('doctor never copies private liveness payload fields',()=>{const x=healthy();assert.equal(JSON.stringify(x).includes('must-not-copy'),false);assert.equal(x.externalEffectAuthority,'NONE');assert.match(x.truthBoundary,/DOES_NOT_PROVE_REVENUE/);});
