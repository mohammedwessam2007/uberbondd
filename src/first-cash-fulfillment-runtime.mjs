import crypto from 'node:crypto';

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { reconcilePaymentRenewalTruthFromStore } from './payment-renewal-truth.mjs';
import {
  createLeadPathSprint,
  advanceLeadPathSprint,
  LEAD_PATH_SPRINT_SKU
} from './lead-path-sprint-fulfillment.mjs';

export const FIRST_CASH_FULFILLMENT_RUNTIME_VERSION = 'uberbond.first-cash-fulfillment-runtime.v1.1.0';
export const FIRST_CASH_FULFILLMENT_JOB_TYPE = 'research.batch';

const cloneEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const digest = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

function blocked(reasonCodes, extra = {}) {
  return {
    ok: false,
    status: 'FIRST_CASH_FULFILLMENT_BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: cloneEffects(),
    ...extra
  };
}

function exactlyOne(rows) {
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

/**
 * Convert an already reconciled provider-origin PayPal payment into one
 * worker-drainable lead-path research mission.
 *
 * This function cannot create payment truth. It starts by reading the persisted
 * PayPal order witness and then recompiles canonical payment-renewal truth from
 * the store. Only the exact $450 lead-path SKU with a clean retained-payment
 * boundary can create a sprint.
 *
 * The complete INPUT_READY sprint state is persisted on the bound prospect
 * before enqueue. That makes worker continuation/recovery independent of the
 * ephemeral webhook call and prevents a generic report-delivery path from
 * mistaking paid-sprint research for an ordinary public audit.
 *
 * Immediate effects are repository/runtime-local: durable state, one durable
 * queue record and compact audit receipts. The existing research worker may
 * later perform bounded public-site research under its own authority and policy
 * gates. No customer message, delivery, spend, DNS change, credential mutation,
 * or commercial outcome is created here.
 */
export async function enqueueFirstCashFulfillment({
  store,
  queue,
  providerEventId,
  date = new Date(),
  reconcileTruth = reconcilePaymentRenewalTruthFromStore,
  createSprint = createLeadPathSprint,
  advanceSprint = advanceLeadPathSprint
} = {}) {
  if (!store || typeof store.list !== 'function' || typeof store.get !== 'function' || typeof store.log !== 'function' || typeof store.patch !== 'function') {
    return blocked(['store-required']);
  }
  if (!queue || typeof queue.enqueue !== 'function') return blocked(['durable-queue-required']);

  const eventId = text(providerEventId, 200);
  if (!eventId || /(?:^|[-_:])(sandbox|synthetic|fixture|fake|test)(?:[-_:]|$)/i.test(eventId)) {
    return blocked(['live-provider-event-id-required']);
  }

  const orders = await store.list('orders');
  const witnesses = (Array.isArray(orders) ? orders : []).filter(row =>
    text(row?.provider, 80).toLowerCase() === 'paypal'
    && text(row?.eventName, 120).toLowerCase() === 'order_created'
    && text(row?.providerEventId, 200) === eventId
  );
  const witness = exactlyOne(witnesses);
  if (!witness) {
    return blocked([
      witnesses.length > 1
        ? 'exactly-one-paypal-order-witness-required'
        : 'paypal-order-witness-required'
    ]);
  }

  const leadId = text(witness.leadId, 200);
  const prospectId = text(witness.prospectId, 200);
  if (!leadId || !prospectId) return blocked(['payment-witness-lead-prospect-binding-required']);

  const [lead, prospect] = await Promise.all([
    store.get('leads', leadId),
    store.get('prospects', prospectId)
  ]);
  if (!lead || !prospect) return blocked(['bound-lead-and-prospect-required']);
  if (text(lead.prospectId, 200) !== prospectId) return blocked(['lead-prospect-binding-mismatch']);

  const truth = await reconcileTruth(store, { leadId });
  if (!truth?.ok) {
    return blocked(['canonical-payment-truth-not-ok', ...(truth?.contradictions || [])], {
      paymentTruthStatus: truth?.status || null
    });
  }

  const created = createSprint({
    customerRef: `lead:${leadId}`,
    paymentLeadId: leadId,
    canonicalPaymentTruth: truth,
    at: new Date(date).toISOString()
  });
  if (!created?.ok) return blocked(['lead-path-sprint-create-failed', ...(created?.reasonCodes || [])]);

  const ready = advanceSprint({
    state: created,
    to: 'INPUT_READY',
    at: new Date(date).toISOString()
  });
  if (!ready?.ok || !ready?.state) return blocked(['lead-path-sprint-input-ready-failed', ...(ready?.reasonCodes || [])]);

  const truthDigest = text(truth.truthDigest, 128).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(truthDigest)) return blocked(['canonical-payment-truth-digest-required']);
  const dedupeKey = `first-cash-fulfillment:${digest(`${leadId}:${truthDigest}`).slice(0, 40)}`;
  const sprint = ready.state;

  const existingSprint = prospect?.firstCashFulfillment;
  if (existingSprint?.sprintId && existingSprint.sprintId !== sprint.sprintId) {
    return blocked(['conflicting-first-cash-sprint-already-bound']);
  }

  await store.patch('prospects', prospectId, {
    firstCashFulfillment: existingSprint || sprint,
    paidSprintDeliveryStatus: existingSprint?.status || sprint.status,
    paidSprintBoundAt: prospect?.paidSprintBoundAt || new Date(date).toISOString()
  });
  await store.patch('leads', leadId, {
    deliveryMode: 'paid-sprint',
    paidSprintId: sprint.sprintId,
    paidSprintSku: LEAD_PATH_SPRINT_SKU,
    paidSprintBoundAt: lead?.paidSprintBoundAt || new Date(date).toISOString()
  });

  const payload = {
    limit: 1,
    reason: 'paid-lead-path-sprint',
    leadId,
    prospectId,
    firstCashSprint: {
      sprintId: sprint.sprintId,
      status: sprint.status,
      sku: LEAD_PATH_SPRINT_SKU,
      canonicalPaymentTruthRef: sprint.canonicalPaymentTruthRef,
      provider: 'paypal',
      providerEventId: eventId,
      truthDigest
    }
  };

  const job = await queue.enqueue(FIRST_CASH_FULFILLMENT_JOB_TYPE, payload, {
    dedupeKey,
    maxAttempts: 3,
    recoveryPolicy: 'replay-safe'
  });
  if (!job?.id) return blocked(['durable-fulfillment-job-not-created'], { sprintPersisted: true, sprintId: sprint.sprintId });

  const previousReceipts = (await store.list('auditLog')).filter(row =>
    row?.type === 'first_cash_fulfillment_queued'
    && text(row?.detail?.dedupeKey, 240) === dedupeKey
  );
  if (!previousReceipts.length) {
    await store.log('first_cash_fulfillment_queued', {
      policyVersion: FIRST_CASH_FULFILLMENT_RUNTIME_VERSION,
      leadId,
      prospectId,
      sprintId: sprint.sprintId,
      sku: LEAD_PATH_SPRINT_SKU,
      provider: 'paypal',
      providerEventIdDigest: digest(eventId).slice(0, 32),
      paymentTruthDigest: truthDigest,
      canonicalPaymentTruthRef: sprint.canonicalPaymentTruthRef,
      jobId: job.id,
      jobType: FIRST_CASH_FULFILLMENT_JOB_TYPE,
      dedupeKey,
      status: sprint.status,
      immediateExternalEffects: 0
    });
  }

  return {
    ok: true,
    status: 'FIRST_CASH_FULFILLMENT_QUEUED',
    leadId,
    prospectId,
    sprintId: sprint.sprintId,
    sprintStatus: sprint.status,
    sku: LEAD_PATH_SPRINT_SKU,
    canonicalPaymentTruthRef: sprint.canonicalPaymentTruthRef,
    paymentTruthDigest: truthDigest,
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      dedupeKey: job.dedupeKey || dedupeKey
    },
    businessEffectAuthority: 'NONE',
    immediateExternalEffects: 0,
    externalEffectLedger: cloneEffects(),
    truthBoundary: 'QUEUED_RESEARCH_IS_NOT_DELIVERY_OR_CUSTOMER_ACCEPTANCE'
  };
}
