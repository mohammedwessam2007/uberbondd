import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyWinnrReplyCanaries, classifyImapProbeException } from '../src/winnr-reply-canary-verifier.mjs';

function fakeStore(){
  const logs=[];
  return {
    logs,
    async init(){},
    async list(key){
      assert.equal(key,'accounts');
      return [
        {id:'imap-2',slot:'winnr-imap:two@example.test',provider:'imap-forwarding',lastImapUid:99},
        {id:'imap-3',slot:'winnr-imap:three@example.test',provider:'imap-forwarding',lastImapUid:100}
      ];
    },
    async log(type,detail){logs.push({type,detail});},
    async close(){}
  };
}

test('reply canary verifier proves both owner-controlled replies without returning bodies or addresses',async()=>{
  const store=fakeStore();
  const pollFn=async({account})=>({
    ok:true,status:'UBERIMAP_FETCH_CONFIRMED',
    messages:[{subject:account.id==='imap-2'?'Re: UberBond Winnr runtime canary 2/3':'Re: UberBond Winnr runtime canary 3/3',body:'secret body',fromEmail:'secret@example.test'}]
  });
  const result=await verifyWinnrReplyCanaries({
    config:{encryptionKey:'a'.repeat(64)},
    storeFactory:()=>store,
    pollFn
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.foundOrdinals,[2,3]);
  assert.equal(JSON.stringify(result).includes('secret body'),false);
  assert.equal(JSON.stringify(result).includes('secret@example.test'),false);
  assert.equal(store.logs[0].type,'winnr_reply_canary_verification');
  assert.equal(store.logs[0].detail.credentialsLogged,false);
});

test('transient IMAP connect exception receives one read-only retry',async()=>{
  const store=fakeStore();
  const calls=new Map();
  const pollFn=async({account})=>{
    const n=(calls.get(account.id)||0)+1;calls.set(account.id,n);
    if(n===1){const e=new Error('imap-connect-failed:4:ETIMEDOUT');e.code='IMAP_CONNECT_FAILED';throw e;}
    return {ok:true,status:'UBERIMAP_FETCH_CONFIRMED',messages:[{subject:account.id==='imap-2'?'Re: UberBond Winnr runtime canary 2/3':'Re: UberBond Winnr runtime canary 3/3'}]};
  };
  const result=await verifyWinnrReplyCanaries({config:{encryptionKey:'a'.repeat(64)},storeFactory:()=>store,pollFn});
  assert.equal(result.ok,true);
  assert.equal(result.accountResults.every(x=>x.attempts===2),true);
  assert.equal([...calls.values()].every(x=>x===2),true);
});

test('persistent IMAP exception reports only a sanitized failure class',async()=>{
  const store=fakeStore();
  const secret='p@ssword-do-not-log';
  const pollFn=async()=>{const e=new Error(`connect failed ${secret} 203.0.113.7`);e.code='ETIMEDOUT';throw e;};
  const result=await verifyWinnrReplyCanaries({config:{encryptionKey:'a'.repeat(64)},storeFactory:()=>store,pollFn});
  assert.equal(result.ok,false);
  assert.equal(result.accountResults.every(x=>x.errorClass==='ETIMEDOUT'&&x.attempts===2),true);
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(JSON.stringify(store.logs).includes(secret),false);
});

test('IMAP rejection classifier exposes only the bounded protocol step',()=>{
  const secret='do-not-echo-this';
  assert.equal(classifyImapProbeException(new Error(`imap-command-rejected:* NO ${secret}\r\nUB0001 NO auth failed`)),'IMAP_COMMAND_REJECTED_LOGIN');
  assert.equal(classifyImapProbeException(new Error(`imap-command-rejected:* FLAGS ()\r\nUB0002 BAD ${secret}`)),'IMAP_COMMAND_REJECTED_MAILBOX_OPEN');
  assert.equal(classifyImapProbeException(new Error(`imap-command-rejected:UB0003 NO ${secret}`)),'IMAP_COMMAND_REJECTED_SEARCH');
  assert.equal(classifyImapProbeException(new Error(`imap-command-rejected:UB0004 BAD ${secret}`)),'IMAP_COMMAND_REJECTED_FETCH');
  assert.equal(classifyImapProbeException(new Error(`imap-command-rejected:${secret}`)),'IMAP_COMMAND_REJECTED_UNKNOWN');
});

test('IMAP exception classifier does not echo raw provider messages',()=>{
  const e=new Error('authentication failed super-secret');
  assert.equal(classifyImapProbeException(e),'IMAP_PROBE_EXCEPTION');
});
