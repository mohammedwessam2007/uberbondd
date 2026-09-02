import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createFetchHandler } from '../api/webhooks/postal.mjs';
import { createMemoryPostalWebhookLedger } from '../src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs';

const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const publicKeyPem=keys.publicKey.export({type:'spki',format:'pem'});
const now=()=>new Date('2026-09-02T00:00:05.000Z');
function body(){return Buffer.from(JSON.stringify({event:'MessageSent',uuid:'evt-route',timestamp:1788300000,payload:{status:'Sent',message:{id:'p1',message_id:'<v9-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.test>',tag:'v9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',to:'buyer@example.com',from:'outreach@example.test',subject:'Evidence sprint',timestamp:1788300000}}}));}
function dnsBody(){return Buffer.from(JSON.stringify({event:'DomainDNSError',uuid:'dns-route',payload:{domain:'outreach.example.test',dns_checked_at:1788300000,spf_status:'OK',dkim_status:'Invalid',mx_status:'Missing',return_path_status:'OK'}}));}
function request(raw,{signature256='',legacySignature=''}={}){
  const headers={};
  if(signature256) headers['x-postal-signature-256']=signature256;
  if(legacySignature) headers['x-postal-signature']=legacySignature;
  return new Request('https://example.test/api/webhooks/postal',{method:'POST',headers,body:raw});
}
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

test('invalid SHA-256 signature is durably quarantined and returns 401',async()=>{
  const ledger=createMemoryPostalWebhookLedger();
  const raw=body();
  const response=await handler({ledger})(request(raw,{signature256:'not-valid'}));
  assert.equal(response.status,401);
  const payload=await response.json();
  assert.equal(payload.status,'QUARANTINED');
  assert.equal((await ledger.findByTag('v9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).length,1);
});

test('legacy X-Postal-Signature cannot authenticate a webhook by itself',async()=>{
  const ledger=createMemoryPostalWebhookLedger();
  const raw=body();
  const legacySignature=crypto.sign('sha1',raw,keys.privateKey).toString('base64');
  const response=await handler({ledger})(request(raw,{legacySignature}));
  const payload=await response.json();
  assert.equal(response.status,401);
  assert.equal(payload.status,'QUARANTINED');
  assert.equal(payload.businessEffectAuthority,'NONE');
});

test('valid X-Postal-Signature-256 event returns 200 and replay is idempotent',async()=>{
  const ledger=createMemoryPostalWebhookLedger();
  const raw=body();
  const signature256=crypto.sign('sha256',raw,keys.privateKey).toString('base64');
  const legacySignature=crypto.sign('sha1',raw,keys.privateKey).toString('base64');
  const first=await handler({ledger})(request(raw,{signature256,legacySignature}));
  const firstJson=await first.json();
  assert.equal(first.status,200);
  assert.equal(firstJson.status,'PERSISTED');
  assert.equal(firstJson.reconciliationRequired,true);
  assert.equal(firstJson.senderEvidenceAvailable,false);
  const second=await handler({ledger})(request(raw,{signature256,legacySignature}));
  const secondJson=await second.json();
  assert.equal(second.status,200);
  assert.equal(secondJson.status,'DUPLICATE');
  assert.equal(secondJson.duplicate,true);
});

test('authenticated DomainDNSError is persisted as sender evidence and never requests message reconciliation',async()=>{
  const ledger=createMemoryPostalWebhookLedger();
  const raw=dnsBody();
  const signature256=crypto.sign('sha256',raw,keys.privateKey).toString('base64');
  const response=await handler({ledger})(request(raw,{signature256}));
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.status,'PERSISTED');
  assert.equal(payload.senderEvidenceAvailable,true);
  assert.equal(payload.reconciliationRequired,false);
  assert.equal(payload.businessEffectAuthority,'NONE');
});

test('valid legacy signature plus invalid SHA-256 signature is quarantined',async()=>{
  const ledger=createMemoryPostalWebhookLedger();
  const raw=body();
  const legacySignature=crypto.sign('sha1',raw,keys.privateKey).toString('base64');
  const response=await handler({ledger})(request(raw,{signature256:'invalid',legacySignature}));
  const payload=await response.json();
  assert.equal(response.status,401);
  assert.equal(payload.status,'QUARANTINED');
});

test('body larger than 1 MiB is rejected',async()=>{
  const huge=Buffer.alloc(1024*1024+1,65);
  const response=await handler()(request(huge));
  assert.equal(response.status,413);
});
