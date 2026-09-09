import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFounderOpsRuntimeProbeReceipt, founderOpsRuntimeIdentity } from '../src/founder-ops-runtime-probe.mjs';

const SHA='a'.repeat(40);
const view=()=>({ok:true,status:'FOUNDER_OPS_READ_ONLY',businessEffectAuthority:'NONE',runtime:{platform:'VERCEL',environment:'production',sourceCommit:SHA,region:'iad1'},privacy:{rawPersonalCivilizationReachable:false,privateVaultDataIncluded:false,networkLifeStateAccessAuthorized:false}});
const base=()=>({expectedSourceCommit:SHA,httpStatus:200,view:view(),verifierRef:'verifier://external-probe',evidenceRef:'evidence://founder-ops/probe-1',observedAt:new Date('2026-09-09T02:00:00Z')});

test('canonical runtime identity binds source and named runtime fields',()=>{
 const a=founderOpsRuntimeIdentity(view().runtime); const b=founderOpsRuntimeIdentity({...view().runtime,region:'fra1'}); assert.match(a,/^runtime:[0-9a-f]{40}$/); assert.notEqual(a,b);
});

test('authenticated read-only view compiles exact C17 receipt shape',()=>{
 const r=compileFounderOpsRuntimeProbeReceipt(base()); assert.equal(r.ok,true,JSON.stringify(r)); assert.equal(r.evidenceClass,'OBSERVED_RUNTIME'); assert.equal(r.authenticatedReadSucceeded,true); assert.equal(r.privateLifeStateExposed,false); assert.equal(r.writeAuthorityGranted,false); assert.equal(r.businessEffectAuthority,'NONE');
});

test('source drift fails closed',()=>{const x=base();x.view.runtime.sourceCommit='b'.repeat(40);const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('control-plane-source-commit-mismatch'));});
test('non-200 response cannot mint authenticated runtime evidence',()=>{const r=compileFounderOpsRuntimeProbeReceipt({...base(),httpStatus:401});assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('authenticated-founder-ops-http-200-required'));});
test('private vault exposure kills receipt',()=>{const x=base();x.view.privacy.privateVaultDataIncluded=true;const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('private-vault-data-must-not-be-included'));});
test('network life-state authorization kills receipt even if payload omitted',()=>{const x=base();x.view.privacy.networkLifeStateAccessAuthorized=true;const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('network-life-state-access-must-not-be-authorized'));});
test('write/business authority inflation kills receipt',()=>{const x=base();x.view.businessEffectAuthority='SEND';const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('control-plane-business-authority-must-be-none'));});
test('runtime cannot self-verify',()=>{const x=base();x.verifierRef=founderOpsRuntimeIdentity(x.view.runtime);const r=compileFounderOpsRuntimeProbeReceipt(x);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('runtime-cannot-self-verify-control-plane'));});
