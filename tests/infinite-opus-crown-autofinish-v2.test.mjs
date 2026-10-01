import test from 'node:test';
import assert from 'node:assert/strict';
import { runCrownAutoFinish } from '../scripts/infinite-opus-crown-autofinish.mjs';

function makeStore(seed={}){
  let settings=structuredClone(seed);
  return {
    transaction:async fn=>fn({
      getSettings:async()=>structuredClone(settings),
      setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v);}
    })
  };
}

test('v2 refuses unless the exact known v1 parser failure is present, with zero provider calls',async()=>{
  let calls=0;
  const priorFetch=globalThis.fetch;
  globalThis.fetch=async()=>{calls++;throw new Error('network-should-not-run');};
  try{
    const out=await runCrownAutoFinish({store:makeStore(),apiKey:'fake',paidAuthorization:{evidenceRef:'owner-test'},mainSha:'sha'});
    assert.equal(out.ok,false);
    assert.equal(out.status,'AUTOFINISH_V2_PRIOR_STATE_REFUSED');
    assert.equal(calls,0);
  } finally { globalThis.fetch=priorFetch; }
});

test('v2 crosses the retry gate only for the exact v1 parser failure and then fails closed on provider refusal',async()=>{
  let calls=0;
  const priorFetch=globalThis.fetch;
  globalThis.fetch=async()=>{calls++;return new Response('refused',{status:503});};
  try{
    const seed={infinite_opus_crown_autofinish_20261001_v1:{
      status:'FAILED_NO_AUTOMATIC_RETRY',reason:'sealed-json-parse-failed',newSpendUsd:0.010025
    }};
    const out=await runCrownAutoFinish({store:makeStore(seed),apiKey:'fake',paidAuthorization:{evidenceRef:'owner-test'},mainSha:'sha'});
    assert.equal(out.ok,false);
    assert.equal(out.status,'FAILED_NO_AUTOMATIC_RETRY');
    assert.match(out.reason,/provider-call-refused/);
    assert.equal(calls,1);
  } finally { globalThis.fetch=priorFetch; }
});


test('v2 never retries itself after any prior v2 attempt',async()=>{
  let calls=0;
  const priorFetch=globalThis.fetch;
  globalThis.fetch=async()=>{calls++;throw new Error('network-should-not-run');};
  try{
    const seed={
      infinite_opus_crown_autofinish_20261001_v1:{status:'FAILED_NO_AUTOMATIC_RETRY',reason:'sealed-json-parse-failed',newSpendUsd:0.010025},
      infinite_opus_crown_autofinish_20261001_v2:{status:'FAILED_NO_AUTOMATIC_RETRY',reason:'provider-call-refused',newSpendUsd:0}
    };
    const out=await runCrownAutoFinish({store:makeStore(seed),apiKey:'fake',paidAuthorization:{evidenceRef:'owner-test'},mainSha:'sha'});
    assert.equal(out.ok,false);
    assert.equal(out.status,'AUTOFINISH_V2_ALREADY_ATTEMPTED_NO_RETRY');
    assert.equal(calls,0);
  } finally { globalThis.fetch=priorFetch; }
});
