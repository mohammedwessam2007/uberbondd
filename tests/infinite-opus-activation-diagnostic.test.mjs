import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectInfiniteOpusActivationEnvironment } from '../src/infinite-opus-activation-diagnostic.mjs';

const now=Date.parse('2026-09-30T18:00:00Z');

test('activation diagnostic reports only redacted presence/current state',()=>{
 const env={
   OPENROUTER_API_KEY:'sk-or-v1-'+'x'.repeat(40),
   UBERMIND_TYPINGMIND_GATEWAY_TOKEN:'g'.repeat(48),
   INFINITE_OPUS_PAID_AUTHORIZATION_JSON:JSON.stringify({
     evidenceRef:'owner://authorization',month:'2026-09',maxMonthlyMicrousd:20_000_000,
     expiresAt:'2026-10-01T00:00:00Z',
     crownRoutes:['openrouter:anthropic/claude-opus-5.5']
   }),
   INFINITE_OPUS_CROWN_ADMISSION_JSON:JSON.stringify({
     exactModelId:'anthropic/claude-opus-5.5',taskClassRole:'GENERAL_CROWN',
     routeIdentity:'openrouter:auto-provider-zdr-deny-required-parameters-v1',
     expiresAt:'2026-10-01T00:00:00Z'
   })
 };
 const out=inspectInfiniteOpusActivationEnvironment(env,{now});
 assert.equal(out.status,'INFINITE_OPUS_ACTIVATION_ENV_PRESENT_AND_CURRENT');
 assert.equal(out.runtimeOpenRouterKeyPresent,true);
 assert.equal(out.typingMindGatewayTokenPresent,true);
 assert.equal(out.paidAuthorization.current,true);
 assert.equal(out.crownAdmission.current,true);
 assert.equal(out.secretValuesExposed,false);
 const serialized=JSON.stringify(out);
 assert.equal(serialized.includes(env.OPENROUTER_API_KEY),false);
 assert.equal(serialized.includes(env.UBERMIND_TYPINGMIND_GATEWAY_TOKEN),false);
});

test('activation diagnostic fail-closes absent or stale authority without provider calls',()=>{
 const out=inspectInfiniteOpusActivationEnvironment({
   OPENROUTER_API_KEY:'',
   UBERMIND_TYPINGMIND_GATEWAY_TOKEN:'',
   INFINITE_OPUS_PAID_AUTHORIZATION_JSON:'{"month":"2026-08"}',
   INFINITE_OPUS_CROWN_ADMISSION_JSON:'not-json'
 },{now});
 assert.equal(out.status,'INFINITE_OPUS_ACTIVATION_ENV_BLOCKED');
 assert.ok(out.blockers.includes('runtime-openrouter-key-absent'));
 assert.ok(out.blockers.includes('typingmind-gateway-token-absent'));
 assert.ok(out.blockers.includes('paid-authorization-not-current-or-not-bounded'));
 assert.ok(out.blockers.includes('crown-admission-absent'));
 assert.equal(out.providerCallPerformed,false);
 assert.equal(out.spendAuthorizedByDiagnostic,false);
});
