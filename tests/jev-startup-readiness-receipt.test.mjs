import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('sealed measured experiment replay is opt-in after receipt persistence',()=>{
  assert.match(source,/UBERMIND_REPLAY_MEASURED_DOMINANCE/);
  assert.match(source,/===\s*'1'/);
  assert.match(source,/UBERMIND_MEASURED_REFERENCE_DOMINANCE_RECEIPT/);
  const receipt=source.slice(source.indexOf('UBERMIND_MEASURED_REFERENCE_DOMINANCE_RECEIPT')-2500,source.indexOf('UBERMIND_MEASURED_REFERENCE_DOMINANCE_RECEIPT')+4500);
  assert.match(receipt,/providerCallsPerformed:0/);
  assert.match(receipt,/hiddenPayloadsExposed:false/);
});

test('startup JEV readiness is inference-free and cannot create Crown authority',()=>{
  const i=source.indexOf('UBERMIND_JEV_SHADOW_READINESS');
  assert.ok(i>0);
  const w=source.slice(Math.max(0,i-2500),i+4500);
  assert.match(w,/inspectJevShadowReadiness/);
  assert.match(w,/currentInfiniteOpusPublicMarket/);
  assert.match(w,/crownAdmissionRequired:false/);
  assert.match(w,/providerInferenceCalls:0/);
  assert.match(w,/modelInferenceCalls:0/);
  assert.match(w,/spendAuthorizedByDiagnostic:false/);
  assert.match(w,/Crown suppression remains forbidden/);
  assert.doesNotMatch(w,/dispatchPaidCall/);
  assert.doesNotMatch(w,/\/alpha\/decisions/);
});
