import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileInfiniteOpusMarket, selectCurrentPrice } from '../src/infinite-opus-market.mjs';
import {
  OPENROUTER_JEV_MODEL,
  OPENROUTER_JEV_MODEL_PAGE,
  compileOpenRouterJevPublicPriceRecord,
  augmentInfiniteOpusMarketWithDecisionRecord
} from '../src/openrouter-decision-market.mjs';

const observedAt='2026-10-07T13:00:00.000Z';
const fixture=`<html><body>
<h1>TypeSafe: Jev 1.13</h1>
<div>typesafe/jev-1.13</div>
<p>Jev 1.13 costs $0.042/M input tokens and $0.00/M output tokens.</p>
<p>Jev 1.13 has a 32,000 token context window.</p>
</body></html>`;

test('public Jev page compiles into a fixed-price Decisions record',()=>{
  const row=compileOpenRouterJevPublicPriceRecord(fixture,{verifiedAt:observedAt,ttlMs:600000});
  assert.equal(row.model,OPENROUTER_JEV_MODEL);
  assert.equal(row.inputUsdPerMillion,.042);
  assert.equal(row.outputUsdPerMillion,0);
  assert.equal(row.contextTokens,32000);
  assert.equal(row.maxOutputTokens,1);
  assert.equal(row.routeKind,'OPENROUTER_DECISIONS');
  assert.equal(row.routeEndpoint,'https://openrouter.ai/api/alpha/decisions');
  assert.equal(row.priceAdmission,'PUBLIC_PRICE_CANDIDATE');
  assert.equal(row.sourceRef,OPENROUTER_JEV_MODEL_PAGE);
  assert.equal(row.semanticAuthority,'NONE');
});

test('wrong or incomplete public pages fail closed instead of inventing price',()=>{
  assert.throws(()=>compileOpenRouterJevPublicPriceRecord(
    '<html>Jev costs $0.042/M input</html>',{verifiedAt:observedAt}
  ),/exact-jev-public-model-page-required/);
  assert.throws(()=>compileOpenRouterJevPublicPriceRecord(
    '<html>typesafe\/jev-1.13 Jev 1.13 current model</html>',{verifiedAt:observedAt}
  ),/fresh-fixed-jev-public-price-not-parseable/);
});

test('decision sidecar augments generic model market without changing existing records',()=>{
  const base=compileInfiniteOpusMarket({data:[{
    id:'openai/gpt-6.1-sol',
    canonical_slug:'openai/gpt-6.1-sol-20260929',
    pricing:{prompt:'0.000002',completion:'0.00001'},
    context_length:1050000,
    top_provider:{max_completion_tokens:128000},
    supported_parameters:[],
    architecture:{input_modalities:['text']}
  }]},{verifiedAt:observedAt,ttlMs:600000});
  const jev=compileOpenRouterJevPublicPriceRecord(fixture,{verifiedAt:observedAt,ttlMs:600000});
  const out=augmentInfiniteOpusMarketWithDecisionRecord(base,jev);
  assert.equal(out.records.length,2);
  assert.equal(out.records.some(x=>x.model==='openai/gpt-6.1-sol'),true);
  const selected=selectCurrentPrice(out,OPENROUTER_JEV_MODEL,Date.parse(observedAt)+1000);
  assert.equal(selected.inputUsdPerMillion,.042);
  assert.equal(selected.routeKind,'OPENROUTER_DECISIONS');
  assert.equal(out.decisionMarket.providerInferenceCallsPerformed,0);
  assert.equal(out.decisionMarket.spendUsd,0);
});

test('production market observer treats Jev public-page fetch as metadata only',()=>{
  const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function currentInfiniteOpusPublicMarket()');
  assert.ok(start>0);
  const window=source.slice(start,start+6500);
  assert.match(window,/OPENROUTER_JEV_MODEL_PAGE/);
  assert.match(window,/compileOpenRouterJevPublicPriceRecord/);
  assert.match(window,/augmentInfiniteOpusMarketWithDecisionRecord/);
  assert.match(window,/providerInferenceCallsPerformed:0/);
  assert.match(window,/spendUsd:0/);
  assert.doesNotMatch(window,/dispatchPaidCall/);
  assert.doesNotMatch(window,/\/api\/alpha\/decisions.*POST/);
});
