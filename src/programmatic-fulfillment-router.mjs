import crypto from 'node:crypto';

export const PROGRAMMATIC_FULFILLMENT_POLICY_VERSION='uberbond.programmatic-fulfillment-router.v1';
const ACTIONS=new Set(['CREATE_WORKSPACE','CREATE_DASHBOARD_INVITE','PROVISION_API_CLIENT','QUEUE_SERVICE_DELIVERY','CREATE_MONITORING_SUBSCRIPTION']);
const text=(v,m=500)=>String(v??'').trim().slice(0,m);
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const secret=/(?:sk-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,}|api[_-]?key\s*[:=]|password\s*[:=]|access[_-]?token\s*[:=])/i;
function fail(reasonCodes,extra={}){return {ok:false,policyVersion:PROGRAMMATIC_FULFILLMENT_POLICY_VERSION,status:'BLOCKED',reasonCodes:[...new Set(reasonCodes)],businessEffectAuthority:'NONE',externalEffectLedger:{providerCalls:0,messages:0,spendCents:0,productionMutations:0},...extra};}
function sensitiveKeys(value, depth=0, seen=new WeakSet()){
 if(!value || typeof value!=='object' || depth>5) return [];
 if(seen.has(value)) return [];
 seen.add(value); const out=[];
 for(const [key,child] of Object.entries(value)){
  if(/(?:password|secret|token|authorization|cookie|credential|api[_-]?key|privatekey)/i.test(String(key))) out.push(String(key));
  if(child && typeof child==='object') out.push(...sensitiveKeys(child,depth+1,seen));
 }
 return [...new Set(out)].slice(0,20);
}

export function compileProgrammaticFulfillment(input={}){
  const payment=input.paymentTruth||{}, paymentState=String(payment.state||payment.status||'').toUpperCase(), paymentEventRef=text(payment.providerOccurrenceRef||payment.providerEventRef,240), paymentReceiptRef=text(payment.receiptRef,240), fulfillmentRef=text(input.fulfillmentRef,240), customerRef=text(input.customerRef,240), serviceSkuRef=text(input.serviceSkuRef,240), authorityReceiptRef=text(input.authorityReceiptRef,240), occurrenceKey=text(input.occurrenceKey,300);
  const rawSensitive=sensitiveKeys(input);
  const actions=(Array.isArray(input.actions)?input.actions:[]).slice(0,20).map((a,i)=>({type:String(a?.type??'').toUpperCase(),providerRef:text(a?.providerRef,160),configRef:text(a?.configRef,240),deliveryMode:String(a?.deliveryMode??'').toUpperCase(),contentRef:text(a?.contentRef,240)||null,index:i}));
  const reasons=[]; if(rawSensitive.length) reasons.push('raw-secret-or-token-field-prohibited'); if(!['CLEARED_PAYMENT','PAYMENT_RETAINED'].includes(paymentState)) reasons.push('canonical-cleared-payment-required'); if(!paymentEventRef) reasons.push('provider-payment-occurrence-ref-required'); if(!paymentReceiptRef) reasons.push('canonical-payment-receipt-ref-required'); if(payment.reversed===true||payment.disputed===true||payment.uncertain===true) reasons.push('payment-not-currently-safe-for-fulfillment'); if(!fulfillmentRef) reasons.push('fulfillment-ref-required'); if(!customerRef) reasons.push('customer-ref-required'); if(!serviceSkuRef) reasons.push('service-sku-ref-required'); if(!occurrenceKey) reasons.push('occurrence-key-required'); if(!authorityReceiptRef) reasons.push('fulfillment-authority-receipt-ref-required'); if(!actions.length) reasons.push('at-least-one-provisioning-action-required');
  for(const a of actions){ if(!ACTIONS.has(a.type)) reasons.push(`unsupported-action:${a.index}`); if(!a.providerRef) reasons.push(`provider-ref-required:${a.index}`); if(!a.configRef) reasons.push(`config-ref-required:${a.index}`); if(['CREATE_DASHBOARD_INVITE','PROVISION_API_CLIENT'].includes(a.type) && !['PROVIDER_INVITE','MAGIC_LINK','ONE_TIME_CLAIM'].includes(a.deliveryMode)) reasons.push(`secretless-access-delivery-required:${a.index}`); if(secret.test(JSON.stringify(a))) reasons.push(`raw-secret-or-token-prohibited:${a.index}`); }
  if(reasons.length)return fail(reasons,{prohibitedKeys:rawSensitive});
  const core={paymentEventRef,paymentReceiptRef,fulfillmentRef,customerRef,serviceSkuRef,occurrenceKey,actions:actions.map(({index,...a})=>a)};
  return {ok:true,policyVersion:PROGRAMMATIC_FULFILLMENT_POLICY_VERSION,status:'FULFILLMENT_PROVISIONING_PLAN_PREPARED',plan:{schemaVersion:'programmatic-fulfillment-plan-1.0.0',planId:`prov_${sha(core).slice(0,28)}`,idempotencyKey:`fulfill:${sha([paymentEventRef,serviceSkuRef,customerRef]).slice(0,32)}`,...core,authorityReceiptRef,retryLaw:'NO_BLIND_RETRY_AFTER_UNCERTAIN_PROVIDER_EFFECT; RECONCILE_FIRST',accessDeliveryLaw:'NO_RAW_LONG_LIVED_ACCESS_SECRET_IN_EMAIL; USE_PROVIDER_INVITE_MAGIC_LINK_OR_ONE_TIME_CLAIM',terminalTruthLaw:'PROVIDER_RECEIPT_REQUIRED_FOR_PROVISIONED_STATE'},businessEffectAuthority:'NONE',externalEffectLedger:{providerCalls:0,messages:0,spendCents:0,productionMutations:0}};
}

export function normalizeProvisioningReceipt(input={}){
 const rawSensitive=sensitiveKeys(input); const provider=text(input.provider,100), providerEventId=text(input.providerEventId,200), planId=text(input.planId,200), actionType=String(input.actionType??'').toUpperCase(), status=String(input.status??'').toUpperCase(), providerReceiptRef=text(input.providerReceiptRef,240), resourceRef=text(input.resourceRef,240), observedAt=new Date(input.observedAt||''), receivedAt=new Date(input.receivedAt||''); const reasons=[];
 if(rawSensitive.length)reasons.push('raw-secret-or-token-field-prohibited'); if(!provider)reasons.push('provider-required'); if(!providerEventId)reasons.push('provider-event-id-required'); if(!planId)reasons.push('plan-id-required'); if(!ACTIONS.has(actionType))reasons.push('invalid-action-type'); if(!['SUCCEEDED','FAILED','UNCERTAIN'].includes(status))reasons.push('invalid-status'); if(!providerReceiptRef)reasons.push('provider-receipt-ref-required'); if(status==='SUCCEEDED'&&!resourceRef)reasons.push('resource-ref-required-for-success'); if(!Number.isFinite(observedAt.getTime())||!Number.isFinite(receivedAt.getTime())||observedAt>new Date(receivedAt.getTime()+300000))reasons.push('valid-provider-times-required'); if(secret.test(JSON.stringify(input)))reasons.push('raw-secret-or-token-prohibited'); if(reasons.length)return fail(reasons,{prohibitedKeys:rawSensitive});
 return {ok:true,policyVersion:PROGRAMMATIC_FULFILLMENT_POLICY_VERSION,status:'PROVISIONING_RECEIPT_NORMALIZED',receipt:{schemaVersion:'programmatic-provisioning-receipt-1.0.0',eventId:`prov_evt_${sha([provider,providerEventId]).slice(0,28)}`,provider,providerEventId,planId,actionType,status,providerReceiptRef,resourceRef:resourceRef||null,observedAt:observedAt.toISOString(),receivedAt:receivedAt.toISOString(),retryDisposition:status==='SUCCEEDED'?'ALREADY_COMPLETED':status==='FAILED'?'SAFE_TO_REEVALUATE':'BLOCK_RETRY_UNTIL_RECONCILED'},businessEffectAuthority:'NONE'};
}
