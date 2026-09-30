import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileUberMindGatewayPlan, gatewayStatus, validateCockpitTask, verifyGatewayBearer, UBERMIND_COCKPIT_TASK_SCHEMA } from '../src/infinite-opus-gateway.mjs';

const understanding=()=>JSON.parse(fs.readFileSync(new URL('../config/infinite-opus-model-understanding.json',import.meta.url),'utf8'));
const base={schemaVersion:UBERMIND_COCKPIT_TASK_SCHEMA,taskId:'t1',taskClass:'RESEARCH',qualityClass:'Q_PREPARATION',sideEffectClass:'NONE',stakes:'LOW',estimatedInputTokens:1000,maxOutputTokens:100};

test('gateway bearer compare is constant-time compatible and requires a real scoped secret',()=>{
 const secret='uberbond-gateway-12345678901234567890';
 assert.equal(verifyGatewayBearer(secret,secret),true);
 assert.equal(verifyGatewayBearer('wrong',secret),false);
 assert.equal(verifyGatewayBearer(secret,'short'),false);
});

test('cockpit task refuses authority effects, secrets and unknown stakes',()=>{
 assert.equal(validateCockpitTask(base).ok,true);
 assert.equal(validateCockpitTask({...base,sideEffectClass:'SEND_EMAIL'}).ok,false);
 assert.equal(validateCockpitTask({...base,stakes:'UNKNOWN'}).ok,false);
 assert.equal(validateCockpitTask({...base,apiKey:'secret'}).ok,false);
});

test('E0-E4 route performs no model beauty contest and plans zero model calls',()=>{
 const r=compileUberMindGatewayPlan({task:{...base,qualityClass:'Q_CERTIFIED_BOUNDED',equivalenceClass:'E4',proofVerified:true,dependenciesCurrent:true,compositionVerified:true},modelUnderstanding:understanding()});
 assert.equal(r.ok,true);assert.equal(r.lane,'E0_E4_BY_CONSTRUCTION');assert.equal(r.modelCallsPlanned,0);
 assert.equal(r.qualityRetestRequired,false);assert.equal(r.semanticAuthority,'BY_CONSTRUCTION_EQUIVALENCE');
});

test('exact route bypasses Jev and models',()=>{
 const r=compileUberMindGatewayPlan({task:{...base,qualityClass:'Q_EXACT',exact:true,jevEligible:true},modelUnderstanding:understanding(),jev:{status:'READY',certified:true}});
 assert.equal(r.lane,'DETERMINISTIC_CODE_OR_SOLVER');assert.equal(r.modelCallsPlanned,0);assert.equal(r.jevMode,'NOT_NEEDED');
});

test('bounded fuzzy route exposes Jev as shadow, not semantic authority',()=>{
 const r=compileUberMindGatewayPlan({task:{...base,qualityClass:'Q_CERTIFIED_BOUNDED',jevEligible:true},modelUnderstanding:understanding(),jev:{status:'LIVE',certified:false}});
 assert.equal(r.jevMode,'SHADOW_ONLY');assert.equal(r.semanticAuthority,'NONE');
 assert.ok(r.executionOrder.includes('JEV_SHADOW_ROUTE_SIGNAL'));
});

test('frontier route orders standard Sol before Pro and Crown candidate last',()=>{
 const r=compileUberMindGatewayPlan({task:{...base,qualityClass:'Q_FRONTIER',taskClass:'NOVEL_STRATEGY'},modelUnderstanding:understanding()});
 assert.equal(r.lane,'CROWN_PAGE_FAULT');assert.equal(r.empiricalModelTestRequired,true);
 assert.deepEqual(r.candidateOrder,['openai/gpt-6.1-sol','openai/gpt-6.1-sol-pro','anthropic/claude-opus-5.5']);
 assert.equal(r.qualityRetestRequired,true);
});

test('gateway cost envelopes are tariff ceilings, never actual billing receipts',()=>{
 const r=compileUberMindGatewayPlan({task:base,modelUnderstanding:understanding()});
 assert.ok(r.costEnvelopes.length>=1);
 for(const row of r.costEnvelopes.filter(x=>x.ok))assert.equal(row.exactActualBill,false);
});

test('gateway status never upgrades source readiness into live claims',()=>{
 const r=gatewayStatus({modelUnderstanding:understanding(),jev:{status:'NOT_CONNECTED',certified:false},runtime:{paidConnected:false,proofLedgerConnected:true}});
 assert.equal(r.ok,true);assert.equal(r.status,'UBERMIND_GATEWAY_SOURCE_READY');assert.equal(r.semanticAuthority,'NONE');
 assert.equal(r.runtime.paidConnected,false);assert.equal(r.jev.certified,false);
});
