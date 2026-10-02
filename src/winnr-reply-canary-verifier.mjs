import { createStore } from './store.mjs';
import { pollImapForwardingAccount } from './uberimap.mjs';

const SUBJECTS=new Map([
  ['Re: UberBond Winnr runtime canary 2/3',2],
  ['Re: UberBond Winnr runtime canary 3/3',3]
]);

export async function verifyWinnrReplyCanaries({
  config,
  storeFactory=createStore,
  pollFn=pollImapForwardingAccount
}={}){
  if(!config?.encryptionKey)return {ok:false,status:'WINNR_REPLY_CANARY_VERIFY_REFUSED',reasonCodes:['encryption-key-required']};
  const store=storeFactory(config);
  try{
    await store.init();
    const accounts=(await store.list('accounts'))
      .filter(a=>String(a?.provider||'').toLowerCase()==='imap-forwarding'&&String(a?.slot||'').startsWith('winnr-imap:'));
    const found=new Set();
    const accountResults=[];
    for(const account of accounts){
      let poll;
      try{poll=await pollFn({account:{...account,lastImapUid:0},encryptionKey:config.encryptionKey,limit:100});}
      catch{poll={ok:false,status:'IMAP_PROBE_EXCEPTION',messages:[]};}
      for(const message of poll?.messages||[]){
        const ordinal=SUBJECTS.get(String(message?.subject||'').trim());
        if(ordinal)found.add(ordinal);
      }
      accountResults.push({accountId:account.id,ok:poll?.ok===true,status:poll?.status||'UNKNOWN'});
    }
    const foundOrdinals=[...found].sort((a,b)=>a-b);
    const ok=[2,3].every(n=>found.has(n));
    await store.log('winnr_reply_canary_verification',{
      ok,
      foundOrdinals,
      expectedOrdinals:[2,3],
      imapAccountsChecked:accounts.length,
      messageBodiesLogged:false,
      senderAddressesLogged:false,
      credentialsLogged:false
    });
    return {
      ok,
      status:ok?'WINNR_REPLY_CANARIES_INGESTIBLE':'WINNR_REPLY_CANARIES_NOT_CONFIRMED',
      foundOrdinals,
      expectedOrdinals:[2,3],
      imapAccountsChecked:accounts.length,
      accountResults,
      messageBodiesLogged:false,
      senderAddressesLogged:false,
      credentialsLogged:false
    };
  }finally{await store.close().catch(()=>{});}
}
