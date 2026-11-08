import crypto from 'node:crypto';
import { createXPayProviderEvidenceReader } from './xpay-provider-evidence.mjs';

const digest = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
const fail = errorCode => ({ cleared: false, terminal: false, errorCode, businessEffectAuthority: 'NONE' });
const bindingOf = row => ({ intentId: row.id, sessionId: row.providerSessionId,
  merchantId: row.providerMerchantId, amountMinor: row.amountCents, currency: row.currency,
  leadId: row.leadId, product: row.product, prospectId: row.prospectId || null });

// Opt-in seam only. Production dispatch must NOT bind this before independent
// live/legal/configuration checks and reversal-refresh integration are complete.
export function createXPayCanonicalVerifier({ store, secretKey, environment, fetchImpl,
  canonicalWritesAuthorized = false, now = () => new Date() } = {}) {
  const read = createXPayProviderEvidenceReader({ secretKey, environment, fetchImpl });
  const verifier = async event => {
    if (event?.provider !== 'xpay' || event?.objectType !== 'checkout.session') return fail('xpay-event-scope-mismatch');
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(event.eventName)) {
      return fail('xpay-event-name-unsupported');
    }
    if (!store?.transaction || !store?.list) return fail('xpay-transactional-store-required');
    const intents = (await store.list('orders')).filter(row => row.provider === 'xpay'
      && row.eventName === 'XPAY_SESSION_INTENT' && row.providerSessionId === event.objectId
      && row.environment === environment);
    if (intents.length !== 1) return fail('xpay-unique-server-intent-required');
    const intent = intents[0];
    const binding = bindingOf(intent);
    const result = await read({ binding });
    if (environment !== 'live') return { ...fail(result.ok ? 'xpay-test-evidence-only' : result.errorCode),
      sandboxVerified: result.ok === true, providerCalls: result.providerCalls };
    if (!canonicalWritesAuthorized) return fail('xpay-canonical-writes-not-authorized');
    const at = now().toISOString();
    // Any uncertain recheck invalidates usability of previous truth, never
    // fabricates a refund amount. Historical revenue remains historical.
    if (!result.ok) {
      try {
        await store.transaction(async tx => {
          for (const row of await tx.list('orders')) if (row.provider === 'xpay'
            && row.providerSessionId === event.objectId && row.eventName === 'order_created') {
            await tx.patch('orders', row.id, { status: 'uncertain', paymentTruthUsable: false,
              paymentTruthReason: result.errorCode, updatedAt: at });
          }
        });
      } catch { return fail('xpay-invalidation-not-durable'); }
      return fail(result.errorCode);
    }
    const e = result.evidence;
    const occurrence = `xpay:live:capture:${e.chargeId}`;
    const suffix = digest(occurrence);
    const ids = { order: `xpay_order_${suffix}`, audit: `xpay_audit_${suffix}`, revenue: `xpay_revenue_${suffix}` };
    const same = row => row?.provider === 'xpay' && row.providerSessionId === e.sessionId
      && row.providerMerchantId === e.merchantId && row.providerChargeId === e.chargeId
      && row.amountCents === e.amountMinor && row.currency === e.currency
      && row.leadId === e.leadId && row.product === e.product && row.intentId === e.intentId;
    try {
      await store.transaction(async tx => {
        // Prevent intent reassignment between network check and commit.
        const current = await tx.get('orders', intent.id);
        if (JSON.stringify(bindingOf(current || {})) !== JSON.stringify(binding)) throw new Error('binding-race');
        const existing = await tx.get('orders', ids.order);
        if (existing) {
          const revenue = await tx.get('revenueEvents', ids.revenue);
          const audit = await tx.get('auditLog', ids.audit);
          if (!same(existing) || !same(revenue) || !same(audit?.detail)) throw new Error('witness-contradiction');
          // A failed later recheck is not automatically undone by an old replay.
          if (existing.status !== 'paid' || existing.paymentTruthUsable !== true) throw new Error('truth-invalidated');
          return;
        }
        const common = { provider: 'xpay', providerSessionId: e.sessionId, providerMerchantId: e.merchantId,
          providerChargeId: e.chargeId, providerObjectId: e.chargeId, intentId: e.intentId,
          leadId: e.leadId, prospectId: intent.prospectId || null, product: e.product,
          amountCents: e.amountMinor, currency: e.currency, testMode: false, environment: 'LIVE', createdAt: at };
        await tx.add('orders', { ...common, id: ids.order, providerEventId: occurrence,
          eventName: 'order_created', status: 'paid', paymentTruthUsable: true, updatedAt: at });
        await tx.add('auditLog', { id: ids.audit, type: 'payment_classification', createdAt: at,
          detail: { ...common, classification: 'CLEARED_ONE_TIME_PAYMENT', shouldUnlock: false,
            shouldRecordRevenue: true, revenueKind: 'sale', sourceEventKey: event.providerEventKey } });
        await tx.add('revenueEvents', { ...common, id: ids.revenue, providerEventId: occurrence, kind: 'sale' });
      });
    } catch { return fail('xpay-canonical-witness-transaction-refused'); }
    // Writes are an opt-in internal seam, not fulfilment or live readiness.
    return { cleared: true, canonicalReceiptRef: ids.order, businessEffectAuthority: 'NONE',
      fulfillmentAuthorized: false, providerCalls: result.providerCalls };
  };
  Object.defineProperty(verifier, 'supportedProviders', { value: Object.freeze(['xpay']) });
  return verifier;
}
