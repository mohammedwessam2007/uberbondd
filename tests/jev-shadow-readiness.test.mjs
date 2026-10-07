import test from 'node:test';
import assert from 'node:assert/strict';
import { compileInfiniteOpusMarket } from '../src/infinite-opus-market.mjs';
import { inspectJevShadowReadiness, TYPINGMIND_JEV_MODEL } from '../src/infinite-opus-typingmind-live.mjs';

const now=Date.parse('2026-10-07T12:00:00Z');
const market=compileInfiniteOpusMarket({data:[{
  id:TYPINGMIND_JEV_MODEL,
  canonical_slug:'typesafe/jev-1.13',
  pricing:{prompt:'0.000000042',completion:'0'},
  context_length:32000,
  top_provider:{max_completion_tokens:1},
  supported_parameters:[],
  architecture:{input_modalities:['text']}
}]},{verifiedAt:new Date(now).toISOString(),ttlMs:60*60*1000});

const auth={
  evidenceRef:'fixture://current-runtime',
  month:'2026-10',
  maxMonthlyMicrousd:20_000_000,
  expiresAt:'2026-11-01T00:00:00Z',
  crownRoutes:[]
};

test('JEV shadow readiness is independent of General Crown admission',()=>{
  const r=inspectJevShadowReadiness({
    paidAuthorization:auth,
    marketSnapshot:market,
    openRouterKeyPresent:true,
    now
  });
  assert.equal(r.ok,true);
  assert.equal(r.status,'JEV_SHADOW_READY');
  assert.equal(r.model,TYPINGMIND_JEV_MODEL);
  assert.equal(r.inputUsdPerMillion,.042);
  assert.equal(r.outputUsdPerMillion,0);
  assert.equal(r.contextTokens,32000);
  assert.equal(r.providerCallPerformed,false);
  assert.equal(r.spendAuthorizedByReadiness,false);
  assert.equal(r.semanticAuthority,'NONE');
  assert.equal(r.maySuppressCrown,false);
});

test('JEV readiness refuses missing runtime authority without provider calls',()=>{
  const r=inspectJevShadowReadiness({
    paidAuthorization:null,
    marketSnapshot:market,
    openRouterKeyPresent:true,
    now
  });
  assert.equal(r.ok,false);
  assert.ok(r.reasons.includes('current-20-dollar-runtime-authorization-required'));
  assert.equal(r.providerCallPerformed,false);
});
