import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createFetchHandler } from '../api/webhooks/postal.mjs';
import { createMemoryPostalWebhookLedger } from '../src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs';

const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const publicKeyPem=keys.publicKey.export({type:'spki',format:'pem'});
const now=()=>new Date('2026-09-02T00:00:05.000Z');
function body(){return Buffer.from(JSON.stringify({event:'MessageSent',uuid:'evt-route',timestamp:1788300000,payload:{status:'Sent',message:{id:'p1',message_id:'<v9-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.test>',tag:'v9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',to:'buyer@example.com',from:'outreach@example.test',subject:'Evidence sprint',timestamp:1788300000}}}));}
function request(raw,signature=''){return new Request('https://example.test/api/webhooks/postal',{method:'POST',headers:{'x-postal-signature':signature},body:raw});}
function handler({env={DATABASE_URL:'postgres://unused',POSTAL_WEBHOOK_PUBLIC_KEY:publicKeyPem},ledger=createMemoryPostalWebhookLedger()}={}) {
  return createFetchHandler({env,getPool:()=>({}),createLedger:()=>ledger,now});
}

test('missing public key or database refuses before trust is possible',async()=>{
  const raw=body();
  const missingKey=await handler({env:{DATABASE_URL:'postgres://unused'}})(request(raw));
  assert.equal(missingKey.status,503);
  const missingDb=await handler({env:{POSTAL_WEBHOOK_PUBLIC_KEY:publicKeyPem}})(request(raw));
  assert.equal(missingDb.status,503);
});

test('invalid signature is durably quarantined and returns 401',async()=>{
  const ledger=createMemoryPostalWebhookLedger();
  const raw=body();
  const response=await handler({ledger})(request(raw,'not-valid'));
  assert.equal(response.status,401);
  const payload=await response.json();
  assert.equal(payload.status,'QUARANTINED');
  assert.equal((await ledger.findByTag('v9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).length,1);
});

test('valid event returns 200 and replay is idempotent',async()=>{
  const ledger=createMemoryPostalWebhookLedger();
  const raw=body();
  const signature=crypto.sign('sha256',raw,keys.privateKey).toString('base64');
  const first=await handler({ledger})(request(raw,signature));
  const firstJson=await first.json();
  assert.equal(first.status,200);
  assert.equal(firstJson.status,'PERSISTED');
  assert.equal(firstJson.reconciliationRequired,true);
  const second=await handler({ledger})(request(raw,signature));
  const secondJson=await second.json();
  assert.equal(second.status,200);
  assert.equal(secondJson.status,'DUPLICATE');
  assert.equal(secondJson.duplicate,true);
});

test('body larger than 1 MiB is rejected',async()=>{
  const huge=Buffer.alloc(1024*1024+1,65);
  const response=await handler()(request(huge));
  assert.equal(response.status,413);
});
