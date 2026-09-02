import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizePostalWebhookEvent, deriveCurrentPostalState } from '../src/omnia-v9/integrations/providers/postal-webhook-evidence.mjs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const publicKeyPem = publicKey.export({type:'spki',format:'pem'});
function body(overrides={}) {
  return Buffer.from(JSON.stringify({
    event:'MessageSent', uuid:'evt-1', timestamp:1788300000,
    payload:{status:'Sent',message:{id:'postal-1',token:'SECRET_CANARY',message_id:'<v9-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.test>',tag:'v9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',to:'buyer@example.com',from:'outreach@example.test',subject:'Evidence sprint',timestamp:1788300000}},
    ...overrides
  }));
}
function signed(raw) { return crypto.sign('sha256',raw,privateKey).toString('base64'); }
const receivedAt='2026-09-02T00:00:05.000Z';

test('authenticated Postal event is reconciliation eligible and strips raw token/body',()=>{
  const raw=body();
  const event=normalizePostalWebhookEvent({rawBody:raw,signatureBase64:signed(raw),publicKeyPem,receivedAt});
  assert.equal(event.authenticated,true);
  assert.equal(event.eligibleForReconciliation,true);
  assert.equal(event.lifecycle,'SENT');
  assert.equal(JSON.stringify(event).includes('SECRET_CANARY'),false);
  assert.equal(JSON.stringify(event).includes(raw.toString('utf8')),false);
});

test('unauthenticated or wrong-key event is quarantined and never reconciliation eligible',()=>{
  const raw=body();
  const other=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'pem'});
  for(const key of [publicKeyPem,other]) {
    const signature = key===publicKeyPem ? 'invalid-base64' : signed(raw);
    const event=normalizePostalWebhookEvent({rawBody:raw,signatureBase64:signature,publicKeyPem:key,receivedAt});
    assert.equal(event.authenticated,false);
    assert.equal(event.quarantineReason,'UNAUTHENTICATED');
    assert.equal(event.eligibleForReconciliation,false);
  }
});

test('unknown event and malformed tag are quarantined even with valid signature',()=>{
  for(const mutate of [
    value=>({...value,event:'MadeUp'}),
    value=>({...value,payload:{...value.payload,message:{...value.payload.message,tag:'bad-tag'}}})
  ]) {
    const parsed=JSON.parse(body().toString('utf8'));
    const raw=Buffer.from(JSON.stringify(mutate(parsed)));
    const event=normalizePostalWebhookEvent({rawBody:raw,signatureBase64:signed(raw),publicKeyPem,receivedAt});
    assert.equal(event.eligibleForReconciliation,false);
  }
});

test('out-of-order arrival cannot regress current state and distinct provider ids are contradictory',()=>{
  const base={authenticated:true,quarantineReason:null,eligibleForReconciliation:true,executionTag:'v9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',postalMessageId:'p1',occurrenceKey:'1'};
  const rows=[
    {...base,lifecycle:'BOUNCED',occurredAt:'2026-09-02T00:00:03.000Z'},
    {...base,lifecycle:'SENT',occurredAt:'2026-09-02T00:00:01.000Z',occurrenceKey:'2'}
  ];
  assert.equal(deriveCurrentPostalState(rows).state,'BOUNCED');
  const conflict=deriveCurrentPostalState([...rows,{...base,postalMessageId:'p2',lifecycle:'SENT',occurredAt:'2026-09-02T00:00:04.000Z',occurrenceKey:'3'}]);
  assert.equal(conflict.contradictory,true);
  assert.equal(conflict.state,'AMBIGUOUS');
});

test('later lower-rank lifecycle evidence cannot overwrite stronger submission/delivery evidence',()=>{
  const base={authenticated:true,quarantineReason:null,eligibleForReconciliation:true,executionTag:'v9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',postalMessageId:'p1'};
  const rows=[
    {...base,lifecycle:'BOUNCED',occurredAt:'2026-09-02T00:00:03.000Z',occurrenceKey:'bounce'},
    {...base,lifecycle:'DELAYED',occurredAt:'2026-09-02T00:00:10.000Z',occurrenceKey:'late-delay'},
    {...base,lifecycle:'SENT',occurredAt:'2026-09-02T00:00:11.000Z',occurrenceKey:'late-sent'}
  ];
  const state=deriveCurrentPostalState(rows);
  assert.equal(state.state,'BOUNCED');
  assert.equal(state.row.occurrenceKey,'bounce');
});

test('within the same lifecycle rank the newest occurredAt remains the deterministic winner',()=>{
  const base={authenticated:true,quarantineReason:null,eligibleForReconciliation:true,executionTag:'v9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',postalMessageId:'p1',lifecycle:'DELAYED'};
  const state=deriveCurrentPostalState([
    {...base,occurredAt:'2026-09-02T00:00:01.000Z',occurrenceKey:'older'},
    {...base,occurredAt:'2026-09-02T00:00:02.000Z',occurrenceKey:'newer'}
  ]);
  assert.equal(state.state,'DELAYED');
  assert.equal(state.row.occurrenceKey,'newer');
});
