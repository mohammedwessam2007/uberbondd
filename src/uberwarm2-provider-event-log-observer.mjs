/**
 * Observes Winnr's authenticated webhook DELIVERY ATTEMPT metadata.
 * No webhook is created, replayed, enabled, disabled or acknowledged here.
 * A provider delivery-log entry is NOT a signature-verified original event.
 * In particular a zero-count in a bounded delivery-log page is NOT proof of
 * zero historical bounces/complaints. Protective signals can only add holds;
 * never confer authorization, clear suppression or initiate sending.
 */
export const UBERWARM2_EVENT_LOG_VERSION = 'uberbond.uberwarm2-provider-event-log-observer.v1';
const knownEvents = new Set(['email.bounced','email.complained']);
const exactId = x => typeof x === 'string' && /^[A-Za-z0-9._:-]{1,240}$/.test(x);
const count = x => Number.isSafeInteger(x) && x >= 0 ? x : null;
const sha = x => typeof x === 'string' && /^sha256:[a-f0-9]{64}$/.test(x);
function receipt(status, {webhookCount=null,disabledWebhookCount=null,bounceDeliveryAttempts=0,complaintDeliveryAttempts=0,
  failedDeliveryAttempts=0,verifiedProviderList=false,verifiedProviderDeliveryRead=false,providerCalls=0,
  deliveryPageMayHaveMore=true}={}) {
  return Object.freeze({version:UBERWARM2_EVENT_LOG_VERSION,status,webhookCount,disabledWebhookCount,
    bounceDeliveryAttempts,complaintDeliveryAttempts,failedDeliveryAttempts,verifiedProviderList,
    verifiedProviderDeliveryRead,observedAttemptPageOnly:true,deliveryPageMayHaveMore,
    adverseEventOperatorReviewRequired:bounceDeliveryAttempts>0||complaintDeliveryAttempts>0||failedDeliveryAttempts>0,
    currentSenderClearance:false,recipientSuppressionCleared:false,
    providerCalls,sends:0,spendCents:0,sendAuthority:'NONE'});
}
const validResult = r => r?.ok===true && sha(r?.receipt?.responseDigest);

export async function observeUberWarm2ProviderEventLog({listWebhooks,getWebhookDeliveries,now=new Date()}={}) {
  const ms=new Date(now).getTime();
  if(!Number.isFinite(ms)||ms<0||typeof listWebhooks!=='function'||typeof getWebhookDeliveries!=='function')
    return receipt('EVENT_LOG_READERS_OR_CLOCK_UNAVAILABLE');
  let hooks;
  try { hooks=await listWebhooks(); } catch {return receipt('EVENT_LOG_ENDPOINT_READ_FAILED',{providerCalls:1});}
  // Winnr documents an account ceiling of ten endpoints. No pagination object
  // is accepted for the bounded endpoint list; an explicit continuation is not.
  if(!validResult(hooks)||!Array.isArray(hooks.data)||hooks.data.length>10||
    hooks.pagination?.has_more===true||
    (hooks.pagination?.has_more!==undefined&&typeof hooks.pagination.has_more!=='boolean'))
    return receipt('EVENT_LOG_ENDPOINT_INVENTORY_UNVERIFIED',{providerCalls:1});
  const ids=new Set();let disabled=0;
  for(const h of hooks.data){
    if(!h||!exactId(h.id)||ids.has(h.id)||typeof h.status!=='string')
      return receipt('EVENT_LOG_ENDPOINT_IDENTITY_AMBIGUOUS',{providerCalls:1});
    ids.add(h.id);
    if(h.status!=='enabled') disabled++;
  }
  if(hooks.data.length===0) return receipt('EVENT_LOG_ENDPOINTS_ABSENT',
    {webhookCount:0,disabledWebhookCount:0,verifiedProviderList:true,providerCalls:1});
  // One endpoint per 5-minute run, sorted so the scan survives reordered pages.
  const selected=[...ids].sort()[Math.floor(ms/300000)%ids.size];
  let result;
  try { result=await getWebhookDeliveries({webhookId:selected,limit:25}); }
  catch {return receipt('EVENT_LOG_DELIVERY_READ_FAILED',
    {webhookCount:ids.size,disabledWebhookCount:disabled,verifiedProviderList:true,providerCalls:2});}
  if(!validResult(result)||!Array.isArray(result.data)||result.data.length>25||
    (result.pagination?.has_more!==undefined&&typeof result.pagination.has_more!=='boolean'))
    return receipt('EVENT_LOG_DELIVERY_PAGE_UNVERIFIED',
      {webhookCount:ids.size,disabledWebhookCount:disabled,verifiedProviderList:true,providerCalls:2});
  let bounces=0,complaints=0,failures=0;
  for(const d of result.data){
    if(!d||typeof d!=='object'||Array.isArray(d))return receipt('EVENT_LOG_DELIVERY_ROW_UNVERIFIED',
      {webhookCount:ids.size,disabledWebhookCount:disabled,verifiedProviderList:true,providerCalls:2});
    // Vendor delivery-log metadata only. This does not authenticate the underlying
    // original event payload or establish which mailbox caused it.
    const event=d.event_type??d.eventType??d.type;
    if(typeof event!=='string'||event.length>120)return receipt('EVENT_LOG_EVENT_TYPE_UNVERIFIED',
      {webhookCount:ids.size,disabledWebhookCount:disabled,verifiedProviderList:true,providerCalls:2});
    if(knownEvents.has(event)){
      if(event==='email.bounced')bounces++;
      else complaints++;
    }
    const outcome=d.outcome??d.status;
    const code=d.http_status??d.httpStatus;
    if((typeof outcome==='string' && ['failed','error','timeout','rejected','retrying'].includes(outcome.toLowerCase())) ||
       (code!==undefined&&code!==null&&count(code)!==null&&code>=400))failures++;
  }
  return receipt('EVENT_LOG_PROVIDER_ATTEMPTS_OBSERVED',{
    webhookCount:ids.size,disabledWebhookCount:disabled,bounceDeliveryAttempts:bounces,
    complaintDeliveryAttempts:complaints,failedDeliveryAttempts:failures,
    verifiedProviderList:true,verifiedProviderDeliveryRead:true,providerCalls:2,
    deliveryPageMayHaveMore:result.pagination?.has_more!==false
  });
}
