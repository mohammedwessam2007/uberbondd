import crypto from 'node:crypto';
import { gateOutboundRoute, refuseOutboundRoute } from './outbound-send-authorization.mjs';

export const UBERMAIL_UBERDOSO_BRIDGE_VERSION='uberbond.ubermail-uberdoso-bridge.v1';
const text=(v,max=4000)=>String(v??'').trim().slice(0,max);
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

// Live-route gate helpers. The UberMail API and this bridge derive the decision input from the same transport payload, so the
// approval the API requests and the decision the bridge re-checks bind identical bytes. Exactly one recipient is admitted: the
// suppression and do-not-contact checks read a single recipient, so a multi-recipient send cannot be decided.
const toList=v=>v==null?[]:Array.isArray(v)?v:[v];
export function ubermailOutboundRecipients(payload={}){
  const p=payload&&typeof payload==='object'?payload:{};
  return [...toList(p.to),...toList(p.cc),...toList(p.bcc)].filter(Boolean);
}
export function ubermailRecipientRefusal(payload={}){
  return ubermailOutboundRecipients(payload).length===1?null:refuseOutboundRoute(['single-recipient-required']);
}
export function ubermailOutboundGateMessage(payload={}){
  const p=payload&&typeof payload==='object'?payload:{};
  const {authorization:_authorization,...outbound}=p;
  const recipients=ubermailOutboundRecipients(p);
  const body=p.text==null?'':String(p.text);
  return{...outbound,from:text(p.from,320).toLowerCase(),to:recipients.length===1?String(recipients[0]):'',subject:p.subject==null?'':String(p.subject),body,text:body};
}
// The sender identity is the inbox. The route is whatever the operator declared for this transport; an undeclared route has no provider.
export function ubermailOutboundAccount({inboxId,email,route=null}={}){
  return{id:text(inboxId,300),slot:text(inboxId,300),email:text(email,320).toLowerCase(),provider:text(route?.provider,80)||null,smtpRoute:{authorized:route?.authorized===true,termsCompatible:route?.termsCompatible===true}};
}
export function gateUberMailOutbound({payload={},authorization=null,route=null,consentVerifier=undefined}={}){
  const shape=ubermailRecipientRefusal(payload);
  if(shape)return shape;
  const account=ubermailOutboundAccount({inboxId:payload?.inboxId,email:payload?.from,route});
  return gateOutboundRoute({account,message:{...ubermailOutboundGateMessage(payload),authorization:authorization||undefined},consentVerifier,routeProvider:account.provider||'none'});
}

export function createUberMailUberDosoTransport({governedDispatch,outboundRoute=null,outboundConsentVerifier=undefined}={}){
  return async function uberDosoSend(payload={},options={}){
    if(typeof governedDispatch!=='function')return{ok:false,status:503,reason:'governed-uberdoso-dispatch-not-configured'};
    const idempotencyKey=text(payload.idempotencyKey,300);
    if(!idempotencyKey)return{ok:false,status:409,reason:'idempotency-key-required'};
    const recipients=[...(Array.isArray(payload.to)?payload.to:[payload.to]),...(Array.isArray(payload.cc)?payload.cc:[]),...(Array.isArray(payload.bcc)?payload.bcc:[])].filter(Boolean);
    if(!recipients.length)return{ok:false,status:400,reason:'recipient-required'};
    // Gate before the envelope, the governed dispatch and any credential. The package arrives out of band in options, never in the payload.
    const refusal=gateUberMailOutbound({payload,authorization:options?.authorization,route:outboundRoute,consentVerifier:outboundConsentVerifier});
    if(refusal)return{ok:false,status:403,reason:'outbound-authorization-refused',reasonCodes:refusal.reasonCodes};
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
