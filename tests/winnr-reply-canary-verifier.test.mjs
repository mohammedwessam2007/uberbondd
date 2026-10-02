import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyWinnrReplyCanaries } from '../src/winnr-reply-canary-verifier.mjs';

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
