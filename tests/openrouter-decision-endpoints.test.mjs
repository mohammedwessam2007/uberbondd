import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENROUTER_JEV_MODEL,
  OPENROUTER_JEV_ENDPOINTS_API,
  compileOpenRouterJevEndpointPriceRecord
} from '../src/openrouter-decision-market.mjs';

const observedAt='2026-10-07T13:00:00.000Z';

test('Jev endpoint metadata produces a bounded fixed-price record',()=>{
  const payload={data:{
    id:OPENROUTER_JEV_MODEL,
    endpoints:[
      {status:0,model_id:OPENROUTER_JEV_MODEL,provider_name:'Provider A',context_length:32000,pricing:{prompt:'0.000000042',completion:'0'}},
      {status:0,model_id:OPENROUTER_JEV_MODEL,provider_name:'Provider B',context_length:32768,pricing:{prompt:'0.00000005',completion:'0'}}
    ]
  }};
  const row=compileOpenRouterJevEndpointPriceRecord(payload,{verifiedAt:observedAt,ttlMs:600000});
  assert.equal(row.model,OPENROUTER_JEV_MODEL);
  assert.equal(row.inputUsdPerMillion,.05);
  assert.equal(row.outputUsdPerMillion,0);
  assert.equal(row.contextTokens,32000);
  assert.equal(row.sourceRef,OPENROUTER_JEV_ENDPOINTS_API);
  assert.equal(row.pricingPolicy,'HIGHEST_ACTIVE_ENDPOINT_PRICE_RESERVED');
  assert.equal(row.callableOnOwnerAccount,'METADATA_OBSERVED_NOT_INFERENCE_PROVEN');
});

test('Jev endpoint metadata requires exact identity and numeric fixed prices',()=>{
  assert.throws(()=>compileOpenRouterJevEndpointPriceRecord({data:{
    id:'typesafe/other',endpoints:[]
  }},{verifiedAt:observedAt}),/exact-jev-endpoint-metadata-required/);
  assert.throws(()=>compileOpenRouterJevEndpointPriceRecord({data:{
    id:OPENROUTER_JEV_MODEL,endpoints:[{
      status:0,model_id:OPENROUTER_JEV_MODEL,context_length:32000,
      pricing:{prompt:'variable',completion:'0'}
    }]
  }},{verifiedAt:observedAt}),/fixed-jev-endpoint-price-required/);
});
