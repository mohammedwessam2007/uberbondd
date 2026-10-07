import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileInfiniteOpusMarket, selectCurrentPrice } from '../src/infinite-opus-market.mjs';
import {
  compileOpenRouterJevDecisionEvidence,
  augmentInfiniteOpusMarketWithDecisionRecord,
  OPENROUTER_JEV_DECISION_MODEL,
  OPENROUTER_JEV_DECISION_PAGE,
  OPENROUTER_DECISIONS_ENDPOINT
} from '../src/openrouter-decision-market.mjs';

const verifiedAt='2026-10-07T13:20:00.000Z';
const page=({model=OPENROUTER_JEV_DECISION_MODEL,input='0.042',output='0',context='32K'}={})=>[
  'TypeSafe: Jev 1.13',
  model,
  'Jev is a structured decision model.',
  'In / Out Price',
  '$'+input+' / $'+output+' per 1M',
  'Context '+context,
  'Decisions API'
].join(' ');

test('current OpenRouter Decisions page compiles a bounded fixed Jev market record',()=>{
  const row=compileOpenRouterJevDecisionEvidence(page(),{verifiedAt,ttlMs:600000});
  assert.equal(row.model,OPENROUTER_JEV_DECISION_MODEL);
  assert.equal(row.marketClass,'DECISIONS_API');
  assert.equal(row.inputUsdPerMillion,.042);
  assert.equal(row.outputUsdPerMillion,0);
  assert.equal(row.contextTokens,32000);
  assert.equal(row.maxOutputTokens,1);
  assert.equal(row.routeEndpoint,OPENROUTER_DECISIONS_ENDPOINT);
  assert.equal(row.priceAdmission,'PUBLIC_PRICE_CANDIDATE');
  assert.equal(row.semanticAuthority,'NONE');
  assert.equal(row.accountCallabilityProven,false);
  assert.equal(row.verifiedAt,verifiedAt);
  assert.equal(row.expiresAt,'2026-10-07T13:30:00.000Z');
});

test('price, exact model, context, or Decisions-surface drift fails closed',()=>{
  assert.throws(()=>compileOpenRouterJevDecisionEvidence(page({model:'typesafe/jev-9'}),{verifiedAt}),/exact-jev-model-id-not-observed/);
  assert.throws(()=>compileOpenRouterJevDecisionEvidence(page({input:'0.043'}),{verifiedAt}),/jev-input-price-not-observed/);
  assert.throws(()=>compileOpenRouterJevDecisionEvidence(page({output:'0.01'}),{verifiedAt}),/jev-zero-output-price-not-observed/);
  assert.throws(()=>compileOpenRouterJevDecisionEvidence(page({context:'64K'}),{verifiedAt}),/jev-32k-context-not-observed/);
  assert.throws(()=>compileOpenRouterJevDecisionEvidence(page().replace('Decisions API','ordinary chat only').replace('structured decision model','chat model'),{verifiedAt}),/openrouter-decisions-surface-not-observed/);
});

test('supplemental Decisions record makes Jev selectable without pretending chat catalog contained it',()=>{
  const base=compileInfiniteOpusMarket({data:[{
    id:'openai/gpt-6.1-sol',
    canonical_slug:'sol-r1',
    pricing:{prompt:'0.000002',completion:'0.000010'},
    context_length:1050000,
    top_provider:{max_completion_tokens:128000},
    supported_parameters:[],
    architecture:{input_modalities:['text']}
  }]},{verifiedAt,ttlMs:600000});
  assert.equal(base.records.some(x=>x.model===OPENROUTER_JEV_DECISION_MODEL),false);
  const jev=compileOpenRouterJevDecisionEvidence(page(),{verifiedAt,ttlMs:600000});
  const augmented=augmentInfiniteOpusMarketWithDecisionRecord(base,jev);
  const selected=selectCurrentPrice(augmented,OPENROUTER_JEV_DECISION_MODEL,Date.parse('2026-10-07T13:25:00.000Z'));
  assert.equal(selected.inputUsdPerMillion,.042);
  assert.equal(augmented.recordCount,2);
  assert.equal(augmented.supplementalSources.length,1);
  assert.equal(augmented.publicCatalogProvesAccountCallability,false);
  assert.equal(augmented.providerInferenceCallsPerformed,0);
});

test('server uses the separate public Decisions surface and fail-soft supplemental observation',()=>{
  const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function currentInfiniteOpusPublicMarket()');
  assert.ok(start>0);
  const window=source.slice(start,start+5000);
  assert.match(window,/OPENROUTER_JEV_DECISION_PAGE/);
  assert.match(window,/compileOpenRouterJevDecisionEvidence/);
  assert.match(window,/augmentInfiniteOpusMarketWithDecisionRecord/);
  assert.match(window,/supplementalMarketErrors/);
  assert.match(window,/marketClass:'DECISIONS_API'/);
  assert.doesNotMatch(window,/dispatchPaidCall/);
  assert.doesNotMatch(window,/alpha\/decisions.*method:\s*'POST'/);
});

test('evidence source remains exact OpenRouter Jev page, never a stale September config',()=>{
  assert.equal(OPENROUTER_JEV_DECISION_PAGE,'https://openrouter.ai/typesafe/jev-1.13/api');
});
