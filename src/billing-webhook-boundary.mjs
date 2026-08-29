import crypto from 'node:crypto';

export const BILLING_WEBHOOK_POLICY_VERSION = 'uberbond.billing-webhook-boundary.v1';
const text=(v,m=300)=>String(v??'').trim().slice(0,m);
const sha=(v)=>crypto.createHash('sha256').update(v).digest('hex');
function safeEqual(a,b){
  const left=Buffer.from(String(a||''),'utf8'), right=Buffer.from(String(b||''),'utf8');
  return left.length===right.length && left.length>0 && crypto.timingSafeEqual(left,right);
}
function fail(reasonCodes,httpStatus=400){return {ok:false,policyVersion:BILLING_WEBHOOK_POLICY_VERSION,status:'REFUSED',httpStatus,reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',externalEffectLedger:{paymentMutations:0,fulfillmentEffects:0,messages:0,spendCents:0}};}

export function verifyLemonSqueezyWebhook(input={}){
  const rawBody = Buffer.isBuffer(input.rawBody) ? input.rawBody : Buffer.from(String(input.rawBody??''),'utf8');
  const signingSecret=text(input.signingSecret,200);
  const signature=text(input.signature,256).toLowerCase();
  const eventName=text(input.eventName,120).toLowerCase();
  if(!signingSecret) return fail(['billing-webhook-secret-not-configured'],503);
  if(!rawBody.length) return fail(['raw-body-required'],400);
  if(!signature) return fail(['signature-required'],401);
  const expected=crypto.createHmac('sha256',signingSecret).update(rawBody).digest('hex');
  if(!safeEqual(expected,signature)) return fail(['invalid-webhook-signature'],401);
  let payload;
  try{payload=JSON.parse(rawBody.toString('utf8'));}catch{return fail(['invalid-json'],400);}
  const metaEvent=text(payload?.meta?.event_name,120).toLowerCase();
  if(eventName && metaEvent && eventName!==metaEvent) return fail(['event-name-header-body-mismatch'],400);
  const canonicalEvent=eventName||metaEvent;
  const objectId=text(payload?.data?.id,160);
  const objectType=text(payload?.data?.type,100).toLowerCase();
  if(!canonicalEvent||!objectId||!objectType) return fail(['event-name-object-id-and-type-required'],400);
  const custom=payload?.meta?.custom_data && typeof payload.meta.custom_data==='object' ? payload.meta.custom_data : {};
  const allowedCustom={};
  for(const key of ['prospect_id','lead_id','customer_ref','service_sku_ref','fulfillment_ref','offer_ref']){
    const value=text(custom[key],240); if(value) allowedCustom[key]=value;
  }
  const providerEventKey=sha(`lemon_squeezy|${canonicalEvent}|${objectType}|${objectId}|${sha(rawBody)}`);
  return {
    ok:true,
    policyVersion:BILLING_WEBHOOK_POLICY_VERSION,
    status:'VERIFIED_WEBHOOK_READY_FOR_DURABLE_INBOX',
    httpStatus:200,
    event:{
      provider:'lemon_squeezy', providerEventKey, eventName:canonicalEvent, objectId, objectType,
      payloadHash:sha(rawBody), customData:allowedCustom,
      admissionLaw:'VERIFIED_WEBHOOK_IS_INPUT_EVIDENCE_ONLY; RECONCILE_CANONICAL_PAYMENT_TRUTH_BEFORE_FULFILLMENT'
    },
    businessEffectAuthority:'NONE',
    externalEffectLedger:{paymentMutations:0,fulfillmentEffects:0,messages:0,spendCents:0}
  };
}
