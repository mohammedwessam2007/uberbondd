import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberSmtpSubmissionTransport } from '../src/ubersmtp-submission-adapter.mjs';

const factory=async()=>({
  sendMessage:async({raw})=>{assert.match(raw,/List-Unsubscribe:/);return{accepted:true,response:'250 2.0.0 queued as ABC123'};},
  close:async()=>{}
});

test('authorized SMTP submission turns provider 250 into bound receipt',async()=>{
  const t=createUberSmtpSubmissionTransport({host:'smtp.example',port:465,secure:true,username:'u',password:'p',authorized:true,termsCompatible:true,evidenceRef:'receipt:route',smtpSessionFactory:factory});
  assert.equal(t.ok,true);
  const r=await t.send({from:'m@uberbond.agency',to:'a@example.com',subject:'x',body:'hi',listUnsubscribe:'<https://u.example/x>'});
  assert.equal(r.confirmed,true);
  assert.match(r.providerReceiptId,/^smtp250:/);
  assert.match(r.providerResponse,/ABC123/);
});

test('non-loopback plaintext transport is refused',()=>{
  const t=createUberSmtpSubmissionTransport({host:'smtp.example',port:25,secure:false,authorized:true,termsCompatible:true,evidenceRef:'x'});
  assert.equal(t.ok,false);
  assert.ok(t.reasonCodes.includes('plaintext-smtp-only-allowed-on-loopback'));
});

test('authorization and terms are mandatory',()=>{
  const t=createUberSmtpSubmissionTransport({host:'127.0.0.1',port:25,secure:false,evidenceRef:'x'});
  assert.equal(t.ok,false);
  assert.ok(t.reasonCodes.includes('smtp-route-authorization-required'));
});
