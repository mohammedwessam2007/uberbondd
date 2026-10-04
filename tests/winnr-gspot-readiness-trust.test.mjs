import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGspot } from '../src/gspot.mjs';
import {
  evaluateWinnrSmtpReadinessTrust,
  WINNR_SMTP_READINESS_VERSION,
  WINNR_SMTP_READINESS_SETTING,
  SMTP_PROBE_READY_RECEIPT_HOLD_REASON
} from '../src/winnr-smtp-readiness-trust.mjs';

const NOW=Date.parse('2026-10-04T15:00:00Z');
const sender='winnr:slot-1';
const sha=v=>createHash('sha256').update(String(v)).digest('hex');
const iso=n=>new Date(n).toISOString();

const health=(over={})=>({id:'h1',inbox:sender,paused:true,pauseReason:SMTP_PROBE_READY_RECEIPT_HOLD_REASON,quarantined:false,...over});
const receipt=(over={})=>({
  schemaVersion:WINNR_SMTP_READINESS_VERSION,
  ok:true,status:'WINNR_SMTP_AUTH_NOOP_READY',checkedAt:iso(NOW),expiresAt:iso(NOW+75*60000),
  senderHealthHeldFailClosed:true,
  messagesSent:0,mailFromIssued:false,recipientsIssued:0,dataIssued:false,
  reputationObserved:false,inboxPlacementObserved:false,
  legalAuthorityGranted:false,prospectSendAuthorityGranted:false,automaticRetryAuthorized:false,
  results:[{
    ordinal:1,slotDigest:sha(sender),evaluated:true,classification:'READY',confirmed:true,state:'SMTP_AUTH_NOOP_CONFIRMED',
    providerCalls:1,providerSessionReceiptId:'smtp-noop:fixture',providerResponseDigest:'a'.repeat(64),
    messagesSent:0,mailFromIssued:false,recipientsIssued:0,dataIssued:false
  }],
  ...over
});

function storeWith({readiness=receipt(),senderHealth=[health()]}={}){
  const settings={[WINNR_SMTP_READINESS_SETTING]:structuredClone(readiness)};
  let lock=Promise.resolve();
  return {
    settings,senderHealth,
    async getSettings(){return structuredClone(settings);},
    async setSetting(k,v){settings[k]=structuredClone(v);return v;},
    async list(k){if(k==='senderHealth')return structuredClone(senderHealth);throw new Error(`unexpected-list:${k}`);},
    updateSettingAtomically(k,update){
      const work=lock.then(async()=>{settings[k]=structuredClone(await update(structuredClone(settings[k])));return settings[k];});
      lock=work.catch(()=>{});return work;
    }
  };
}

const fullEvidence=()=>({
  qualification:{eligible:true,outboundAuthority:'NONE'},proofRef:'proof:p1',proofDigest:'pd-p1',messageDigest:'md-p1',offerId:'agency-leak',messageValidated:true,
  effectPackageState:'READY_FOR_AUTHORIZATION',senderId:sender,senderHealthy:false,senderQuarantined:true,recipientHash:'rh-p1',suppressed:false
});

test('exact fresh zero-message receipt plus designated bridge hold is trusted',()=>{
  const out=evaluateWinnrSmtpReadinessTrust({senderId:sender,receipt:receipt(),health:health(),nowMs:NOW});
  assert.equal(out.applicable,true);
  assert.equal(out.trusted,true);
  assert.deepEqual(out.reasonCodes,[]);
});

test('stale, wrong-slot, manual hold, quarantine and message-effect mutations all fail closed',()=>{
  const stale=evaluateWinnrSmtpReadinessTrust({senderId:sender,receipt:receipt({expiresAt:iso(NOW-1)}),health:health(),nowMs:NOW});
  assert.equal(stale.trusted,false);assert.ok(stale.reasonCodes.includes('readiness-expired'));

  const wrong=receipt();wrong.results[0].slotDigest=sha('winnr:other');
  const slot=evaluateWinnrSmtpReadinessTrust({senderId:sender,receipt:wrong,health:health(),nowMs:NOW});
  assert.equal(slot.trusted,false);assert.ok(slot.reasonCodes.includes('exact-slot-readiness-result-missing'));

  const manual=evaluateWinnrSmtpReadinessTrust({senderId:sender,receipt:receipt(),health:health({pauseReason:'manual-hold'}),nowMs:NOW});
  assert.equal(manual.trusted,false);assert.ok(manual.reasonCodes.includes('sender-not-on-receipt-hold'));

  const quarantined=evaluateWinnrSmtpReadinessTrust({senderId:sender,receipt:receipt(),health:health({quarantined:true}),nowMs:NOW});
  assert.equal(quarantined.trusted,false);assert.ok(quarantined.reasonCodes.includes('sender-quarantined'));

  const effect=receipt();effect.results[0].mailFromIssued=true;
  const mutated=evaluateWinnrSmtpReadinessTrust({senderId:sender,receipt:effect,health:health(),nowMs:NOW});
  assert.equal(mutated.trusted,false);assert.ok(mutated.reasonCodes.includes('exact-slot-message-effect-detected'));
});

test('G-SPOT reaches authorization-ready only by resolving the designated Winnr bridge hold with fresh exact evidence',async()=>{
  const store=storeWith();
  const g=createGspot({store,now:()=>NOW});
  const {run}=await g.plan({items:[{prospectId:'p1',offerId:'agency-leak',rank:1}]});
  const advanced=await g.advance(run.runId,async()=>fullEvidence());
  assert.equal(advanced.items[0].stage,'READY_FOR_AUTHORIZATION');
  assert.equal(advanced.items[0].evidence.winnrSmtpReadinessTrusted,true);
  const batch=await g.prepareBatch(run.runId,{perSenderCap:{[sender]:1}});
  assert.equal(batch.batch.items.length,1);
  assert.equal(batch.state,'AWAITING_OWNER_AUTHORIZATION');
});

test('receipt expiry between batch freeze and authorization revokes readiness',async()=>{
  let t=NOW;
  const store=storeWith({readiness:receipt({expiresAt:iso(NOW+2*60000)})});
  const g=createGspot({store,now:()=>t});
  const {run}=await g.plan({items:[{prospectId:'p1',offerId:'agency-leak'}]});
  await g.advance(run.runId,async()=>fullEvidence());
  const batch=await g.prepareBatch(run.runId,{perSenderCap:{[sender]:1},ttlMs:20*60000});
  t=NOW+3*60000;
  await assert.rejects(g.authorize(run.runId,{batchDigest:batch.batch.batchDigest,authorizedBy:'MOHAMED'}),/SENDER_READINESS_REVOKED/);
});

test('receipt expiry after authorization but before dispatch blocks before any effect',async()=>{
  let t=NOW;
  const store=storeWith({readiness:receipt({expiresAt:iso(NOW+2*60000)})});
  const g=createGspot({store,now:()=>t});
  const {run}=await g.plan({items:[{prospectId:'p1',offerId:'agency-leak'}]});
  await g.advance(run.runId,async()=>fullEvidence());
  const batch=await g.prepareBatch(run.runId,{perSenderCap:{[sender]:1},ttlMs:20*60000});
  await g.authorize(run.runId,{batchDigest:batch.batch.batchDigest,authorizedBy:'MOHAMED'});
  t=NOW+3*60000;
  let effects=0;
  const out=await g.dispatch(run.runId,async()=>{effects++;return{accepted:true};});
  assert.equal(out.messages,0);
  assert.equal(effects,0);
  const final=await g.get(run.runId);
  assert.equal(final.items[0].stage,'BLOCKED');
  assert.ok(final.items[0].blocks.includes('DISPATCH:sender-readiness-revoked'));
});

test('legacy unpaused Winnr health is never trusted without the bridge hold and fail-closed marker',()=>{
  const old=receipt({senderHealthHeldFailClosed:false});
  const out=evaluateWinnrSmtpReadinessTrust({senderId:sender,receipt:old,health:health({paused:false,pauseReason:''}),nowMs:NOW});
  assert.equal(out.trusted,false);
  assert.ok(out.reasonCodes.includes('readiness-fail-closed-marker-required'));
  assert.ok(out.reasonCodes.includes('sender-not-on-receipt-hold'));
});
