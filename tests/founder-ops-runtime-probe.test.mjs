import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFounderOpsRuntimeProbeReceipt, founderOpsRuntimeIdentity, founderOpsTargetIdentity } from '../src/founder-ops-runtime-probe.mjs';

const SHA='a'.repeat(40);
const TARGET='https://uberbond.example.test/api/founder-ops';
const NOW=new Date('2026-09-09T02:00:01Z');
const view=()=>({ok:true,status:'FOUNDER_OPS_READ_ONLY',businessEffectAuthority:'NONE',runtime:{platform:'VERCEL',environment:'production',sourceCommit:SHA,region:'iad1'},privacy:{rawPersonalCivilizationReachable:false,privateVaultDataIncluded:false,networkLifeStateAccessAuthorized:false}});
const base=()=>({expectedSourceCommit:SHA,targetUrl:TARGET,httpStatus:200,view:view(),verifierRef:'verifier://external-probe',evidenceRef:'evidence://founder-ops/probe-1',providerCallObserved:true,observedAt:new Date('2026-09-09T02:00:00Z'),now:NOW});

test('canonical runtime identity binds source and named runtime fields',()=>{
 const a=founderOpsRuntimeIdentity(view().runtime); const b=founderOpsRuntimeIdentity({...view().runtime,region:'fra1'}); assert.match(a,/^runtime:[0-9a-f]{40}$/); assert.notEqual(a,b);
});

test('canonical target identity binds exact https target without secret-bearing URL surfaces',()=>{
 const a=founderOpsTargetIdentity(TARGET); const b=founderOpsTargetIdentity('https://other.example.test/api/founder-ops'); assert.match(a,/^target:[0-9a-f]{40}$/); assert.notEqual(a,b);
 for(const targetUrl of ['http://uberbond.example.test/api/founder-ops','https://user:pass@uberbond.example.test/api/founder-ops','https://uberbond.example.test/api/founder-ops?token=secret','https://uberbond.example.test/api/founder-ops#secret']) assert.equal(founderOpsTargetIdentity(targetUrl),null);
});

test('authenticated read-only view compiles exact C17 receipt shape with truthful probe effect',()=>{
 const r=compileFounderOpsRuntimeProbeReceipt(base()); assert.equal(r.ok,true,JSON.stringify(r)); assert.equal(r.evidenceClass,'OBSERVED_RUNTIME'); assert.equal(r.authenticatedReadSucceeded,true); assert.equal(r.privateLifeStateExposed,false); assert.equal(r.writeAuthorityGranted,false); assert.equal(r.businessEffectAuthority,'NONE'); assert.equal(r.externalEffectLedger.providerCalls,1); assert.equal(r.targetUrl,TARGET); assert.match(r.observedViewDigest,/^sha256:[0-9a-f]{64}$/);
});

test('a 200 view cannot mint runtime evidence without admitting the observed provider call',()=>{const r=compileFounderOpsRuntimeProbeReceipt({...base(),providerCallObserved:false});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('provider-call-observation-required'));assert.equal(r.externalEffectLedger.providerCalls,0);});
test('source drift fails closed',()=>{const x=base();x.view.runtime.sourceCommit='b'.repeat(40);const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('control-plane-source-commit-mismatch'));});
test('non-200 response cannot mint authenticated runtime evidence and preserves attempted call',()=>{const r=compileFounderOpsRuntimeProbeReceipt({...base(),httpStatus:401});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('authenticated-founder-ops-http-200-required'));assert.equal(r.externalEffectLedger.providerCalls,1);});
test('private vault exposure kills receipt',()=>{const x=base();x.view.privacy.privateVaultDataIncluded=true;const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('private-vault-data-must-not-be-included'));});
test('network life-state authorization kills receipt even if payload omitted',()=>{const x=base();x.view.privacy.networkLifeStateAccessAuthorized=true;const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('network-life-state-access-must-not-be-authorized'));});
test('write/business authority inflation kills receipt',()=>{const x=base();x.view.businessEffectAuthority='SEND';const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('control-plane-business-authority-must-be-none'));});
test('runtime and target cannot self-verify',()=>{for(const verifierRef of [founderOpsRuntimeIdentity(view().runtime),founderOpsTargetIdentity(TARGET)]){const x=base();x.verifierRef=verifierRef;const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);}});
test('future-dated observation cannot mint runtime evidence',()=>{const r=compileFounderOpsRuntimeProbeReceipt({...base(),observedAt:new Date('2026-09-09T03:00:00Z')});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('runtime-observation-must-not-be-future-dated'));});
test('same observed view replayed against another target produces a different receipt identity',()=>{const a=compileFounderOpsRuntimeProbeReceipt(base());const b=compileFounderOpsRuntimeProbeReceipt({...base(),targetUrl:'https://other.example.test/api/founder-ops'});assert.equal(a.ok,true);assert.equal(b.ok,true);assert.notEqual(a.targetIdentity,b.targetIdentity);assert.notEqual(a.receiptDigest,b.receiptDigest);});
test('safe view digest changes when runtime or privacy observation changes',()=>{const a=compileFounderOpsRuntimeProbeReceipt(base());const x=base();x.view.runtime.region='fra1';const b=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(a.ok,true);assert.equal(b.ok,true);assert.notEqual(a.observedViewDigest,b.observedViewDigest);});
