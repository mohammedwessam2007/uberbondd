import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberMailUberDosoTransport, ubermailOutboundGateMessage } from '../src/ubermail-uberdoso-bridge.mjs';
import { validRoutePackage, ALLOW_CONSENT } from './helpers/outbound-route-package.mjs';
const payload={idempotencyKey:'send:1',inboxId:'i',from:'mohamed@uberbond.agency',to:['a@example.com'],subject:'Hi',text:'Body'};

// Positive-path fixture: a declared smtp-relay route and a package the test helper builds for the exact bytes under test. The
// bridge still re-checks the package against those bytes before any governed dispatch.
const SMTP_ROUTE={provider:'smtp-relay',authorized:true,termsCompatible:true};
const BRIDGE_ACCOUNT={id:'i',slot:'i',email:'mohamed@uberbond.agency'};
const packageFor=p=>validRoutePackage({account:BRIDGE_ACCOUNT,message:ubermailOutboundGateMessage(p)});
const gatedTransport=governedDispatch=>createUberMailUberDosoTransport({governedDispatch,outboundRoute:SMTP_ROUTE,outboundConsentVerifier:ALLOW_CONSENT});

test('UberDoso bridge refuses missing or non-authoritative dispatch',async()=>{
  assert.equal((await createUberMailUberDosoTransport()(payload)).ok,false);
  const denied=await gatedTransport(async()=>({authorized:false,executed:false,accepted:false,reason:'v9-deny'}))(payload,{authorization:packageFor(payload)});
  assert.equal(denied.ok,false);assert.equal(denied.reason,'v9-deny');
});

test('UberDoso bridge preserves payload binding and authoritative receipt',async()=>{
  let seen;
  let dispatchCount=0;
  const transport=gatedTransport(async request=>{dispatchCount+=1;seen=request;return{authorized:true,executed:true,accepted:true,providerReferenceId:'postal-42',messageId:'<m42@uberbond.cloud>',payloadDigest:request.payloadDigest,authorizationDigest:'a'.repeat(64),policyDigest:'b'.repeat(64)};});
  // The bridge admits exactly one recipient, so the positive binding uses a single recipient with an attachment. The cc copy is
  // re-targeted below to its gated refusal: a second recipient is refused before any governed dispatch.
  const full={...payload,attachments:[{filename:'x.txt',size:1}]};
  const result=await transport(full,{authorization:packageFor(full)});
  assert.equal(result.ok,true);assert.equal(result.providerReferenceId,'postal-42');assert.equal(seen.operation,'OUTBOUND_EMAIL_SEND');assert.equal(seen.consequenceClass,'COMMUNICATE_EXTERNAL');assert.deepEqual(seen.to,['a@example.com']);assert.equal(seen.attachments.length,1);assert.match(seen.payloadDigest,/^[a-f0-9]{64}$/);
  const withCc={...full,cc:['cc@example.com']};
  const refusedCc=await transport(withCc,{authorization:packageFor(withCc)});
  assert.equal(refusedCc.ok,false);assert.equal(refusedCc.reason,'outbound-authorization-refused');assert.ok(refusedCc.reasonCodes.includes('single-recipient-required'));
  assert.equal(dispatchCount,1);
});

test('UberDoso bridge treats transport ambiguity or digest mismatch as uncertain',async()=>{
  const uncertain=await gatedTransport(async()=>({uncertain:true}))(payload,{authorization:packageFor(payload)});
  assert.equal(uncertain.uncertain,true);
  const mismatch=await gatedTransport(async()=>({authorized:true,executed:true,accepted:true,providerReferenceId:'x',payloadDigest:'bad'}))(payload,{authorization:packageFor(payload)});
  assert.equal(mismatch.uncertain,true);assert.equal(mismatch.reason,'provider-receipt-payload-digest-mismatch');
});
