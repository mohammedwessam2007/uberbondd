import crypto from 'node:crypto';

export const DELIVERY_TRANSPORT_CONTRACT_VERSION = 'uberbond.delivery-transport.v1';
const ZERO_EFFECTS = Object.freeze({ customerMessages: 0, providerCalls: 0, spendCents: 0, deployments: 0, dnsChanges: 0, credentialChanges: 0, paymentMutations: 0, productionMutations: 0 });

function text(v, max=500) { const s=String(v??'').trim(); return s && s.length<=max ? s : null; }
function refs(values) { return [...new Set((Array.isArray(values)?values:[]).map(v=>text(v,500)).filter(Boolean))].sort(); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, extra={}) { return { ok:false, status:'REFUSED', reasonCodes:[...new Set(reasonCodes)], businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EFFECTS}, ...extra }; }

function identityOf({ tenantRef, orderRef, fulfillmentId, artifactRefs, provider }) {
  const identity = { tenantRef:text(tenantRef,200), orderRef:text(orderRef,200), fulfillmentId:text(fulfillmentId,200), artifactRefs:refs(artifactRefs), provider:text(provider,120)?.toUpperCase() || null };
  return { identity, digest:hash(identity) };
}

export async function attemptDelivery({ tenantRef, orderRef, fulfillmentId, artifactRefs, providerAdapter, attemptId, idempotencyKey, priorReceipts=[], date=new Date() }={}) {
  const reasons=[];
  const provider=text(providerAdapter?.name,120)?.toUpperCase();
  const attempt=text(attemptId,160);
  const key=text(idempotencyKey,240);
  const artifacts=refs(artifactRefs);
  if (!text(tenantRef,200)) reasons.push('tenant-ref-required');
  if (!text(orderRef,200)) reasons.push('order-ref-required');
  if (!text(fulfillmentId,200)) reasons.push('fulfillment-id-required');
  if (!artifacts.length) reasons.push('artifact-refs-required');
  if (!provider || typeof providerAdapter?.send !== 'function') reasons.push('provider-adapter-required');
  if (!attempt) reasons.push('attempt-id-required');
  if (!key) reasons.push('idempotency-key-required');
  if (reasons.length) return fail(reasons);

  const { identity, digest } = identityOf({ tenantRef, orderRef, fulfillmentId, artifactRefs:artifacts, provider });
  const prior = (Array.isArray(priorReceipts)?priorReceipts:[]).find(r => r?.attemptId===attempt || r?.idempotencyKey===key);
  if (prior) {
    if (prior.identityDigest !== digest || prior.attemptId !== attempt || prior.idempotencyKey !== key) {
      return fail(['delivery-attempt-identity-collision'], { attemptId:attempt, idempotencyKey:key });
    }
    if (['PROVIDER_CONFIRMED_DELIVERY','RECONCILIATION_REQUIRED'].includes(prior.status)) {
      return { ok:true, status:prior.status, result:'DUPLICATE_ATTEMPT_SUPPRESSED', receipt:structuredClone(prior), businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EFFECTS} };
    }
  }

  const observedAt = (date instanceof Date ? date : new Date(date)).toISOString();
  try {
    const result = await providerAdapter.send({ ...identity, attemptId:attempt, idempotencyKey:key });
    const providerReceiptId=text(result?.providerReceiptId,240);
    const providerMessageId=text(result?.providerMessageId,240);
    const confirmed = result?.confirmed === true && Boolean(providerReceiptId || providerMessageId);
    const status = confirmed ? 'PROVIDER_CONFIRMED_DELIVERY' : 'RECONCILIATION_REQUIRED';
    const receipt = { schemaVersion:DELIVERY_TRANSPORT_CONTRACT_VERSION, attemptId:attempt, idempotencyKey:key, identityDigest:digest, ...identity, status, providerReceiptId:providerReceiptId||null, providerMessageId:providerMessageId||null, observedAt, reconciliationRequired:!confirmed, acceptanceTruth:'NOT_INFERRED' };
    return { ok:true, status, result:confirmed?'DELIVERY_CONFIRMED_BY_PROVIDER':'PROVIDER_OUTCOME_UNCERTAIN', receipt, businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EFFECTS, providerCalls:1} };
  } catch (error) {
    const definitelyNoEffect = error?.definitelyNoEffect === true;
    const status = definitelyNoEffect ? 'FAILED_PRE_EFFECT' : 'RECONCILIATION_REQUIRED';
    const receipt = { schemaVersion:DELIVERY_TRANSPORT_CONTRACT_VERSION, attemptId:attempt, idempotencyKey:key, identityDigest:digest, ...identity, status, providerReceiptId:null, providerMessageId:null, observedAt, reconciliationRequired:!definitelyNoEffect, errorCode:text(error?.code,120)||'PROVIDER_ERROR', acceptanceTruth:'NOT_INFERRED' };
    return { ok:true, status, result:definitelyNoEffect?'SAFE_TO_RETRY_WITH_SAME_IDEMPOTENCY_KEY':'PROVIDER_OUTCOME_UNCERTAIN__DO_NOT_BLIND_RESEND', receipt, businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EFFECTS, providerCalls:1} };
  }
}

export function compileFulfillmentDeliveryEvent(receipt, { eventId, at }={}) {
  if (!receipt || receipt.status !== 'PROVIDER_CONFIRMED_DELIVERY') return fail(['provider-confirmed-delivery-receipt-required']);
  if (!Array.isArray(receipt.artifactRefs) || !receipt.artifactRefs.length) return fail(['delivery-artifact-refs-required']);
  return { ok:true, event:{ eventId:text(eventId,160) || `delivery:${receipt.attemptId}`, type:'DELIVERY_RECORDED', at:text(at,80)||receipt.observedAt, artifactRefs:receipt.artifactRefs.map(ref => ref.startsWith('artifact:')?ref:`artifact:${ref}`), evidenceClass:'EXTERNAL_PROVIDER', evidenceRef:`receipt:${receipt.providerReceiptId || receipt.providerMessageId}` }, acceptanceTruth:'NOT_INFERRED', businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EFFECTS} };
}

export function evaluateAcceptanceWindow({ deliveredAt, now=new Date(), acceptanceWindowMs=7*86400000, followupCount=0, maxFollowups=2, suppressed=false }={}) {
  const delivered = new Date(deliveredAt||'');
  const reference = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(delivered.getTime()) || !Number.isFinite(reference.getTime())) return fail(['valid-delivery-and-reference-time-required']);
  const max = Number(maxFollowups);
  const count = Number(followupCount);
  if (!Number.isSafeInteger(max) || max<0 || max>20 || !Number.isSafeInteger(count) || count<0) return fail(['bounded-followup-count-required']);
  const windowMs = Number(acceptanceWindowMs);
  if (!Number.isSafeInteger(windowMs) || windowMs<0) return fail(['valid-acceptance-window-required']);
  const elapsed = reference.getTime()-delivered.getTime();
  if (elapsed < 0) return fail(['reference-time-precedes-delivery']);
  let status;
  if (suppressed) status='FOLLOWUP_SUPPRESSED';
  else if (count>=max) status = elapsed>=windowMs ? 'WINDOW_ELAPSED_WITHOUT_ACCEPTANCE' : 'WAITING_FOR_CUSTOMER';
  else if (elapsed>=windowMs) status='WINDOW_ELAPSED_WITHOUT_ACCEPTANCE';
  else status='FOLLOWUP_MAY_BE_DUE';
  return { ok:true, status, accepted:false, acceptanceTruth:'NOT_INFERRED_FROM_SILENCE_OR_TIME', followupAllowed:!suppressed && count<max && elapsed<windowMs, remainingFollowups:Math.max(0,max-count), businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EFFECTS} };
}

export function compileLateCustomerEvent({ evidenceClass, evidenceRef, decision, eventId, at }={}) {
  const cls=text(evidenceClass,80)?.toUpperCase();
  const ref=text(evidenceRef,500);
  const choice=text(decision,80)?.toUpperCase();
  if (cls!=='EXTERNAL_CUSTOMER' || !ref) return fail(['external-customer-evidence-required']);
  const type = choice==='ACCEPTED' ? 'CUSTOMER_ACCEPTED' : choice==='REJECTED' ? 'CUSTOMER_REJECTED' : choice==='REVISION_REQUESTED' ? 'REVISION_REQUESTED' : null;
  if (!type) return fail(['recognized-customer-decision-required']);
  return { ok:true, event:{ eventId:text(eventId,160)||`customer:${hash([ref,choice]).slice(0,16)}`, type, at:text(at,80)||new Date().toISOString(), evidenceClass:'EXTERNAL_CUSTOMER', evidenceRef:ref }, businessEffectAuthority:'NONE', externalEffectLedger:{...ZERO_EFFECTS} };
}
