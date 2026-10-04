import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberSmtpSubmissionTransport } from '../src/ubersmtp-submission-adapter.mjs';
import { probeSmtpFleetAccount } from '../src/uberfleet.mjs';
import { runWinnrSmtpReadinessProbe, SMTP_PROBE_FAILURE_PAUSE_REASON } from '../src/winnr-smtp-readiness.mjs';
import { encryptJson } from '../src/crypto.mjs';

const KEY='a'.repeat(64);
const account=(ordinal)=>({
  id:`smtp-${ordinal}`,
  slot:`winnr:slot-${ordinal}`,
  email:`sender${ordinal}@example.test`,
  provider:'smtp-relay',
  connected:true,
  tokens:encryptJson({kind:'smtp-basic',username:`u${ordinal}`,password:`p${ordinal}`},KEY),
  smtpRoute:{host:'smtp.example.test',port:465,secure:true,authorized:true,termsCompatible:true,evidenceRef:'fixture:terms'}
});

function fakeStore({health=[]}={}){
  const accounts=[account(1),account(2),account(3)];
  const senderHealth=health.map(x=>structuredClone(x));
  const settings={};
  const logs=[];
  return {
    accounts,senderHealth,settings,logs,
    async list(key){if(key==='accounts')return structuredClone(accounts);if(key==='senderHealth')return structuredClone(senderHealth);throw new Error(`unexpected-list:${key}`);},
    async setSenderPaused(inbox,paused,reason=''){
      let row=senderHealth.find(x=>x.inbox===inbox);
      if(!row){row={id:`sender_${inbox}`,inbox,hardBouncesToday:0,complaintsToday:0,failureStreak:0};senderHealth.push(row);}
      Object.assign(row,{paused:Boolean(paused),pauseReason:String(reason||'')});
      return structuredClone(row);
    },
    async setSetting(key,value){settings[key]=structuredClone(value);return value;},
    async log(event,detail){logs.push({event,detail:structuredClone(detail)});}
  };
}

test('SMTP transport probe authenticates and NOOPs without message commands',async()=>{
  let probeCalls=0,sendCalls=0,closeCalls=0;
  const transport=createUberSmtpSubmissionTransport({
    host:'smtp.example.test',port:465,secure:true,username:'u',password:'p',authorized:true,termsCompatible:true,evidenceRef:'fixture',
    smtpSessionFactory:async()=>({
      async probe(){probeCalls++;return{ok:true,code:250,response:'250 OK'};},
      async sendMessage(){sendCalls++;return{accepted:true,response:'250 queued'};},
      async close(){closeCalls++;}
    })
  });
  const result=await transport.probe();
  assert.equal(result.confirmed,true);
  assert.equal(result.state,'SMTP_AUTH_NOOP_CONFIRMED');
  assert.equal(result.providerCalls,1);
  assert.equal(probeCalls,1);
  assert.equal(sendCalls,0);
  assert.equal(closeCalls,1);
  assert.equal(result.messagesSent,0);
  assert.equal(result.mailFromIssued,false);
  assert.equal(result.recipientsIssued,0);
  assert.equal(result.dataIssued,false);
});

test('SMTP transport failure exposes only bounded stage and numeric response code',async()=>{
  const transport=createUberSmtpSubmissionTransport({
    host:'smtp.example.test',port:465,secure:true,username:'u',password:'p',authorized:true,termsCompatible:true,evidenceRef:'fixture',
    smtpSessionFactory:async()=>{
      const error=new Error('535 raw provider response containing secret-looking detail');
      error.code='SMTP_COMMAND_REJECTED';
      error.smtpStage='AUTH';
      error.smtpResponseCode=535;
      throw error;
    }
  });
  const result=await transport.probe();
  assert.equal(result.confirmed,false);
  assert.equal(result.errorClass,'SMTP_COMMAND_REJECTED');
  assert.equal(result.errorStage,'AUTH');
  assert.equal(result.smtpResponseCode,535);
  assert.equal(result.providerCalls,1);
  assert.equal(result.messagesSent,0);
  assert.equal(JSON.stringify(result).includes('raw provider response'),false);
});

test('fleet probe decrypts credentials but issues no message',async()=>{
  let probed=0;
  const result=await probeSmtpFleetAccount({
    account:account(1),encryptionKey:KEY,
    transportFactory:({username,password})=>({ok:true,async probe(){probed++;assert.equal(username,'u1');assert.equal(password,'p1');return{confirmed:true,state:'SMTP_AUTH_NOOP_CONFIRMED',providerSessionReceiptId:'smtp-noop:x',providerResponseDigest:'b'.repeat(64),providerCalls:1,messagesSent:0};}})
  });
  assert.equal(result.classification,'READY');
  assert.equal(result.providerCalls,1);
  assert.equal(result.messagesSent,0);
  assert.equal(probed,1);
});

test('fleet and readiness receipt preserve bounded failure stage without raw provider text',async()=>{
  const store=fakeStore();
  const result=await runWinnrSmtpReadinessProbe({
    store,encryptionKey:KEY,quarantineOrdinalsText:'3',
    probeFn:async({account})=>account.slot.endsWith('1')
      ?{classification:'UNCERTAIN',state:'SMTP_AUTH_NOOP_FAILED',reasonCodes:['smtp-session-probe-failed'],errorClass:'SMTP_COMMAND_REJECTED',errorStage:'AUTH',smtpResponseCode:535,providerCalls:1,messagesSent:0}
      :{classification:'READY',state:'SMTP_AUTH_NOOP_CONFIRMED',providerSessionReceiptId:'r2',providerResponseDigest:'e'.repeat(64),providerCalls:1,messagesSent:0}
  });
  const failed=result.results.find(x=>x.ordinal===1);
  assert.equal(failed.errorClass,'SMTP_COMMAND_REJECTED');
  assert.equal(failed.errorStage,'AUTH');
  assert.equal(failed.smtpResponseCode,535);
  assert.equal(JSON.stringify(result).includes('@'),false);
  assert.equal(result.messagesSent,0);
});

test('local credential refusal is zero provider calls and never constructs transport',async()=>{
  let transportCalls=0;
  const broken={...account(1),tokens:'not-an-encrypted-token'};
  const result=await probeSmtpFleetAccount({
    account:broken,encryptionKey:KEY,
    transportFactory:()=>{transportCalls++;throw new Error('must-not-run');}
  });
  assert.equal(result.classification,'REJECTED');
  assert.equal(result.providerCalls,0);
  assert.equal(result.messagesSent,0);
  assert.equal(transportCalls,0);
});

test('controller probes non-quarantined accounts without manufacturing positive sender health',async()=>{
  const store=fakeStore();
  const calls=[];
  const result=await runWinnrSmtpReadinessProbe({
    store,encryptionKey:KEY,quarantineOrdinalsText:'3',now:new Date('2026-10-04T13:00:00Z'),
    probeFn:async({account})=>{calls.push(account.slot);return{classification:'READY',state:'SMTP_AUTH_NOOP_CONFIRMED',providerSessionReceiptId:`r-${account.id}`,providerResponseDigest:'c'.repeat(64),providerCalls:1,messagesSent:0};}
  });
  assert.equal(result.ok,true);
  assert.equal(result.checkedAccounts,2);
  assert.equal(result.providerContactedAccounts,2);
  assert.equal(result.readyAccounts,2);
  assert.equal(result.skippedProtectiveAccounts,1);
  assert.equal(result.providerCalls,2);
  assert.equal(result.providerCallsComplete,true);
  assert.deepEqual(calls,['winnr:slot-1','winnr:slot-2']);
  assert.equal(store.senderHealth.some(x=>x.inbox==='winnr:slot-1'),false);
  assert.equal(store.senderHealth.some(x=>x.inbox==='winnr:slot-2'),false);
  assert.equal(store.senderHealth.some(x=>x.inbox==='winnr:slot-3'),false);
  assert.equal(result.messagesSent,0);
  assert.equal(result.prospectSendAuthorityGranted,false);
  assert.equal(JSON.stringify(result).includes('@'),false);
});

test('local refusal is evaluated as failure even though provider was not contacted',async()=>{
  const store=fakeStore();
  const result=await runWinnrSmtpReadinessProbe({
    store,encryptionKey:KEY,quarantineOrdinalsText:'3',
    probeFn:async({account})=>account.slot.endsWith('1')
      ?{classification:'REJECTED',reasonCodes:['local-refusal'],providerCalls:0,messagesSent:0}
      :{classification:'READY',state:'SMTP_AUTH_NOOP_CONFIRMED',providerSessionReceiptId:'r2',providerResponseDigest:'e'.repeat(64),providerCalls:1,messagesSent:0}
  });
  assert.equal(result.ok,false);
  assert.equal(result.checkedAccounts,2);
  assert.equal(result.providerContactedAccounts,1);
  assert.equal(result.readyAccounts,1);
  assert.equal(result.failedAccounts,1);
  assert.equal(result.providerCalls,1);
  assert.equal(result.providerCallsLowerBound,1);
  assert.equal(result.results.find(x=>x.ordinal===1)?.providerCallState,'NOT_CONTACTED');
  assert.equal(store.senderHealth.find(x=>x.inbox==='winnr:slot-1')?.paused,true);
});

test('unexpected probe throw preserves unknown provider crossing instead of inventing a call',async()=>{
  const store=fakeStore();
  const result=await runWinnrSmtpReadinessProbe({
    store,encryptionKey:KEY,quarantineOrdinalsText:'2,3',
    probeFn:async()=>{throw new Error('unexpected');}
  });
  assert.equal(result.ok,false);
  assert.equal(result.checkedAccounts,1);
  assert.equal(result.failedAccounts,1);
  assert.equal(result.providerCalls,null);
  assert.equal(result.providerCallsLowerBound,0);
  assert.equal(result.providerCallsComplete,false);
  assert.equal(result.providerCallUnknownAccounts,1);
  assert.equal(result.results[0].providerCallState,'UNKNOWN');
});

test('probe failure protective-pauses, later success clears only the probe-created pause',async()=>{
  const store=fakeStore({health:[{id:'manual',inbox:'winnr:slot-2',paused:true,pauseReason:'manual-hold'}]});
  const failed=await runWinnrSmtpReadinessProbe({
    store,encryptionKey:KEY,quarantineOrdinalsText:'3',
    probeFn:async({account})=>account.slot.endsWith('1')?{classification:'UNCERTAIN',reasonCodes:['down'],providerCalls:1,messagesSent:0}:{classification:'READY',providerCalls:1,messagesSent:0}
  });
  assert.equal(store.senderHealth.find(x=>x.inbox==='winnr:slot-1')?.paused,true);
  assert.equal(store.senderHealth.find(x=>x.inbox==='winnr:slot-1')?.pauseReason,SMTP_PROBE_FAILURE_PAUSE_REASON);
  assert.equal(store.senderHealth.find(x=>x.inbox==='winnr:slot-2')?.pauseReason,'manual-hold');
  assert.equal(failed.checkedAccounts,1);

  await runWinnrSmtpReadinessProbe({
    store,encryptionKey:KEY,quarantineOrdinalsText:'3',
    probeFn:async()=>({classification:'READY',state:'SMTP_AUTH_NOOP_CONFIRMED',providerSessionReceiptId:'r',providerResponseDigest:'d'.repeat(64),providerCalls:1,messagesSent:0})
  });
  assert.equal(store.senderHealth.find(x=>x.inbox==='winnr:slot-1')?.paused,false);
  assert.equal(store.senderHealth.find(x=>x.inbox==='winnr:slot-1')?.pauseReason,'');
  assert.equal(store.senderHealth.find(x=>x.inbox==='winnr:slot-2')?.paused,true);
  assert.equal(store.senderHealth.find(x=>x.inbox==='winnr:slot-2')?.pauseReason,'manual-hold');
});
