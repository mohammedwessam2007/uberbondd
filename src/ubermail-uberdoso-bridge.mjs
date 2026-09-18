import crypto from 'node:crypto';

export const UBERMAIL_UBERDOSO_BRIDGE_VERSION='uberbond.ubermail-uberdoso-bridge.v1';
const text=(v,max=4000)=>String(v??'').trim().slice(0,max);
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

export function createUberMailUberDosoTransport({governedDispatch}={}){
  return async function uberDosoSend(payload={}){
    if(typeof governedDispatch!=='function')return{ok:false,status:503,reason:'governed-uberdoso-dispatch-not-configured'};
    const idempotencyKey=text(payload.idempotencyKey,300);
    if(!idempotencyKey)return{ok:false,status:409,reason:'idempotency-key-required'};
    const recipients=[...(Array.isArray(payload.to)?payload.to:[payload.to]),...(Array.isArray(payload.cc)?payload.cc:[]),...(Array.isArray(payload.bcc)?payload.bcc:[])].filter(Boolean);
    if(!recipients.length)return{ok:false,status:400,reason:'recipient-required'};
    const envelope={
      schemaVersion:'ubermail.uberdoso-dispatch-request.v1',
      operation:'OUTBOUND_EMAIL_SEND',
      consequenceClass:'COMMUNICATE_EXTERNAL',
      idempotencyKey,
      inboxId:text(payload.inboxId,300),
      from:text(payload.from,320).toLowerCase(),
      to:Array.isArray(payload.to)?payload.to:[payload.to].filter(Boolean),
      cc:Array.isArray(payload.cc)?payload.cc:[],
      bcc:Array.isArray(payload.bcc)?payload.bcc:[],
      replyTo:Array.isArray(payload.replyTo)?payload.replyTo:[],
      subject:text(payload.subject,998),
      text:payload.text==null?'':String(payload.text),
      html:payload.html==null?null:String(payload.html),
      attachments:Array.isArray(payload.attachments)?payload.attachments:[],
      headers:payload.headers&&typeof payload.headers==='object'&&!Array.isArray(payload.headers)?structuredClone(payload.headers):{},
      inReplyTo:text(payload.inReplyTo,500)||null,
      forwardOf:text(payload.forwardOf,500)||null
    };
    envelope.payloadDigest=hash(JSON.stringify(envelope));
    let result;
    try{result=await governedDispatch(envelope);}catch(error){return{ok:false,uncertain:true,status:502,reason:'governed-dispatch-error:'+text(error?.message||error,500)};}
    if(result?.uncertain===true||String(result?.lifecycle||'').toUpperCase()==='UNCERTAIN')return{ok:false,uncertain:true,status:502,reason:'governed-dispatch-outcome-uncertain'};
    if(result?.authorized!==true||result?.executed!==true||result?.accepted!==true){return{ok:false,status:Number(result?.status)||403,reason:text(result?.reason||'authoritative-governed-dispatch-required',500)};}
    if(result?.payloadDigest&&result.payloadDigest!==envelope.payloadDigest)return{ok:false,uncertain:true,status:502,reason:'provider-receipt-payload-digest-mismatch'};
    const providerReferenceId=text(result.providerReferenceId||result.messageId,500);
    if(!providerReferenceId)return{ok:false,uncertain:true,status:502,reason:'accepted-dispatch-missing-provider-reference'};
    return{ok:true,providerReferenceId,messageId:text(result.messageId,500)||providerReferenceId,transport:'uberdoso-governed',receipt:{authorizationDigest:text(result.authorizationDigest,128)||null,policyDigest:text(result.policyDigest,128)||null,providerReferenceId,payloadDigest:envelope.payloadDigest}};
  };
}
