import test from 'node:test';
import assert from 'node:assert/strict';
import { PostalEffectAdapter, postalProviderEffectIdentity, postalEffectTag } from '../src/omnia-v9/integrations/providers/postal-effect-adapter.mjs';
import { createMemoryPostalWebhookLedger, createPostalReconciliationLookup } from '../src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs';

const now=()=>new Date('2026-09-02T00:00:00.000Z');
function adapter(overrides={}) {
  return new PostalEffectAdapter({
    baseUrl:'https://postal.example.test',apiKey:'test-secret',fromAddress:'outreach@example.test',messageIdDomain:'example.test',now,
    fetchImpl:async()=>({status:200,json:async()=>({status:'success',data:{message_id:'postal-generated',messages:{'buyer@example.com':{id:12,token:'secret-token'}}}})}),
    ...overrides
  });
}
function intent(){const executionId='exec-1';return{businessKey:'lead-1',executionId,providerEffectIdentity:postalProviderEffectIdentity(executionId,'example.test'),effectPayload:{to:'buyer@example.com',subject:'Evidence sprint',body:'Evidence-bound note.',listUnsubscribe:'https://example.test/unsubscribe/token'}};}

test('409, 429 and 5xx are UNCERTAIN and exactly one provider call occurs',async()=>{
  for(const status of [409,429,503]) {
    let calls=0;
    const a=adapter({fetchImpl:async()=>{calls+=1;return{status,json:async()=>({status:'error'})};}});
    const result=await a.dispatch(await a.prepare(intent()));
    assert.equal(result.classification,'UNCERTAIN');
    assert.equal(calls,1);
  }
});

test('bounded timeout becomes UNCERTAIN without retry',async()=>{
  let calls=0;
  const a=adapter({timeoutMs:100,fetchImpl:async(_url,opts)=>{calls+=1;return await new Promise((_resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason)));}});
  const result=await a.dispatch(await a.prepare(intent()));
  assert.equal(result.classification,'UNCERTAIN');
  assert.match(result.dispatchError,/timed out/i);
  assert.equal(calls,1);
});

test('dispatch sends one-click unsubscribe and never leaks Postal recipient token',async()=>{
  let request;
  const a=adapter({fetchImpl:async(_url,opts)=>{request=JSON.parse(opts.body);return{status:200,json:async()=>({status:'success',data:{message_id:'p',messages:{'buyer@example.com':{id:12,token:'do-not-return'}}}})};}});
  const result=await a.dispatch(await a.prepare(intent()));
  assert.equal(result.classification,'ACCEPTED');
  assert.equal(request.headers['List-Unsubscribe'],'<https://example.test/unsubscribe/token>');
  assert.equal(request.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  assert.equal(JSON.stringify(result).includes('do-not-return'),false);
});

test('reconciliation works without executionId but requires authenticated webhook provenance',async()=>{
  const prepared=await adapter().prepare(intent());
  const trusted={id:'12',tag:prepared.tag,messageId:prepared.messageId,to:prepared.to,from:prepared.from,status:'SENT',provenance:'AUTHENTICATED_POSTAL_WEBHOOK'};
  const accepted=await adapter({reconciliationLookupFn:async()=>[trusted]}).reconcile({businessKey:'lead-1',providerEffectIdentity:prepared.providerEffectIdentity,expectedTo:prepared.to,expectedFrom:prepared.from});
  assert.equal(accepted.lifecycle,'RECONCILED_ACCEPTED');
  const untrusted=await adapter({reconciliationLookupFn:async()=>[{...trusted,provenance:'CALLER_ASSERTION'}]}).reconcile({businessKey:'lead-1',providerEffectIdentity:prepared.providerEffectIdentity});
  assert.equal(untrusted.lifecycle,'AMBIGUOUS');
});

test('zero reconciliation matches stay UNCERTAIN and never authorize resend',async()=>{
  const prepared=await adapter().prepare(intent());
  const result=await adapter({reconciliationLookupFn:async()=>[]}).reconcile({businessKey:'lead-1',providerEffectIdentity:prepared.providerEffectIdentity});
  assert.equal(result.lifecycle,'UNCERTAIN');
});

test('bounce proves submission while preserving negative delivery evidence',async()=>{
  const prepared=await adapter().prepare(intent());
  const row={id:'12',tag:prepared.tag,messageId:prepared.messageId,status:'BOUNCED',provenance:'AUTHENTICATED_POSTAL_WEBHOOK'};
  const result=await adapter({reconciliationLookupFn:async()=>[row]}).reconcile({businessKey:'lead-1',providerEffectIdentity:prepared.providerEffectIdentity});
  assert.equal(result.lifecycle,'RECONCILED_ACCEPTED');
  assert.equal(result.detail.negativeDeliveryEvidence,true);
});

test('ledger is replay-idempotent and conflicting Postal ids synthesize separate rows',async()=>{
  const tag=postalEffectTag('exec-1');
  const ledger=createMemoryPostalWebhookLedger();
  const base={occurrenceKey:'postal:a',eventName:'MessageSent',lifecycle:'SENT',occurredAt:'2026-09-02T00:00:00.000Z',receivedAt:'2026-09-02T00:00:01.000Z',authenticated:true,quarantineReason:null,executionTagValid:true,executionTag:tag,postalMessageId:'p1',messageId:postalProviderEffectIdentity('exec-1','example.test'),to:'buyer@example.com',from:'outreach@example.test',subjectSha256:'a'.repeat(64),rawBodySha256:'b'.repeat(64),detailsDigest:'c'.repeat(64),provenance:'AUTHENTICATED_POSTAL_WEBHOOK',eligibleForReconciliation:true};
  assert.equal((await ledger.append(base)).duplicate,false);
  assert.equal((await ledger.append(base)).duplicate,true);
  await ledger.append({...base,occurrenceKey:'postal:b',postalMessageId:'p2'});
  const rows=await createPostalReconciliationLookup(ledger)({tag,messageId:base.messageId});
  assert.equal(rows.length,2);
});
