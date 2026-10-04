import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRevenueSurfaceRuntime } from '../src/revenue-surface-runtime-self-check.mjs';

const response=(status,text='')=>({status,async text(){return text;}});

test('loopback self-check proves Constellation asset and unauthenticated revenue refusal',async()=>{
  const seen=[];
  const fetchFn=async url=>{
    seen.push(String(url));
    if(String(url).endsWith('/constellation.html'))return response(200,'<strong>REVENUE CONSTELLATION</strong><script src="/constellation-gspot.js"></script>');
    if(String(url).endsWith('/constellation-gspot.js'))return response(200,"post('/api/revenue/gspot/plan'); post('/api/revenue/gspot/prepare-batch');");
    if(String(url).endsWith('/api/revenue/money-queue'))return response(401,'{"error":"Unauthorized"}');
    return response(404,'');
  };
  const result=await inspectRevenueSurfaceRuntime({baseUrl:'http://127.0.0.1:10000',fetchFn});
  assert.equal(result.ok,true);
  assert.equal(result.status,'REVENUE_SURFACE_LIVE_SELF_CHECK_CONFIRMED');
  assert.equal(result.pageServed,true);
  assert.equal(result.controllerSafe,true);
  assert.equal(result.protectedRevenueRefused,true);
  assert.equal(result.credentialMaterialUsed,false);
  assert.equal(result.providerCalls,0);
  assert.equal(result.externalEffects,0);
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(seen.length,3);
});

test('self-check fails if convenience controller gains authorize or dispatch capability',async()=>{
  const fetchFn=async url=>{
    if(String(url).endsWith('/constellation.html'))return response(200,'REVENUE CONSTELLATION constellation-gspot.js');
    if(String(url).endsWith('/constellation-gspot.js'))return response(200,"/api/revenue/gspot/plan /api/revenue/gspot/prepare-batch /api/revenue/gspot/authorize");
    return response(401,'');
  };
  const result=await inspectRevenueSurfaceRuntime({baseUrl:'http://localhost:10000',fetchFn});
  assert.equal(result.ok,false);
  assert.equal(result.controllerSafe,false);
  assert.ok(result.reasonCodes.includes('one-button-controller-boundary-not-proven'));
});

test('self-check fails if protected revenue API answers unauthenticated 200',async()=>{
  const fetchFn=async url=>{
    if(String(url).endsWith('/constellation.html'))return response(200,'REVENUE CONSTELLATION constellation-gspot.js');
    if(String(url).endsWith('/constellation-gspot.js'))return response(200,"/api/revenue/gspot/plan /api/revenue/gspot/prepare-batch");
    return response(200,'{"items":[]}');
  };
  const result=await inspectRevenueSurfaceRuntime({baseUrl:'http://127.0.0.1:10000',fetchFn});
  assert.equal(result.ok,false);
  assert.equal(result.protectedRevenueRefused,false);
  assert.ok(result.reasonCodes.includes('unauthenticated-revenue-route-not-refused'));
});

test('self-check refuses any non-loopback target',async()=>{
  let called=false;
  const result=await inspectRevenueSurfaceRuntime({baseUrl:'https://example.com',fetchFn:async()=>{called=true;return response(200,'');}});
  assert.equal(result.ok,false);
  assert.equal(result.status,'REVENUE_SURFACE_SELFCHECK_REFUSED');
  assert.equal(called,false);
});
