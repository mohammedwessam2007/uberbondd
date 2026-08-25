import { COMMERCIAL_OUTCOME_POLICY_VERSION } from '../../commercial-outcome.mjs';
import {
  baseReceipt,
  digest,
  hasContactLikeFields,
  iso,
  key,
  list,
  publicHttpsUrl,
  text,
  unique,
  isSuppressed
} from './policy.mjs';

export const REFERRAL_LEDGER_POLICY_VERSION = 'overnight-distribution.referral-ledger-1.0.0';

export const REFERRAL_EVIDENCE_CLASSES = Object.freeze([
  'VERIFIED_FACT', 'BUYER_SIGNAL', 'OWNER_ATTESTED'
]);

export const COMMISSION_TRUTH_LEVELS = Object.freeze([
  'CHECKOUT_STARTED', 'PAYMENT_ATTEMPTED', 'PROVIDER_OBSERVED',
  'CLEARED_PAYMENT', 'REFUND_OR_DISPUTE'
]);

export const ATTRIBUTION_CLASSES = Object.freeze(['ATTRIBUTED', 'INFERRED']);

function reject(reason, extra = {}) {
  return baseReceipt({ status: 'REJECTED', reasonCodes: [reason], extra });
}

function integer(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function currency(value) {
  const normalized = text(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : '';
}

function outcomeIdFor(eventId) {
  return `out_${digest({ policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION, eventId }).slice(0, 24)}`;
}

function validateCommercialProof({ eventId, truthLevel, paymentProof, amountCents, currencyCode }) {
  if (!['CLEARED_PAYMENT', 'REFUND_OR_DISPUTE'].includes(truthLevel)) return { ok: true, proof: null };
  if (!paymentProof || typeof paymentProof !== 'object') return { ok: false, reason: 'commercial-payment-proof-required' };
  const providerEventId = text(paymentProof.providerEventId, 300);
  const outcomeEventId = text(paymentProof.outcomeEventId || paymentProof.eventId || eventId, 300);
  const outcomeId = text(paymentProof.outcomeId, 220);
  if (!providerEventId || !outcomeId) return { ok: false, reason: 'provider-and-outcome-proof-required' };
  if (paymentProof.policyVersion !== COMMERCIAL_OUTCOME_POLICY_VERSION) return { ok: false, reason: 'commercial-outcome-policy-proof-required' };
  if (outcomeId !== outcomeIdFor(outcomeEventId)) return { ok: false, reason: 'commercial-outcome-id-does-not-recompute' };
  if (paymentProof.amountCents != null && integer(paymentProof.amountCents) !== amountCents) return { ok: false, reason: 'payment-proof-amount-mismatch' };
  if (paymentProof.currency != null && currency(paymentProof.currency) !== currencyCode) return { ok: false, reason: 'payment-proof-currency-mismatch' };
  return {
    ok: true,
    proof: { providerEventId, outcomeEventId, outcomeId, policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION }
  };
}

/** Register a referral route without contacting the partner or referred account. */
export function normalizeReferralCandidate(input = {}, { now = new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reject('referral-object-required');
  if (hasContactLikeFields(input)) return reject('contact-data-not-accepted-in-referral');

  const partnerId = text(input.partnerId, 180);
  const accountId = text(input.accountId || input.targetAccountId, 180);
  const offerId = text(input.offerId, 180);
  const accountDomain = key(input.accountDomain || input.domain, 180).replace(/^www\./, '');
  const evidenceClass = text(input.evidenceClass, 80).toUpperCase();
  const evidenceRefs = list(input.evidenceRefs, 30, 240);
  if (!partnerId) return reject('referral-partner-id-required');
  if (!accountId) return reject('referral-account-id-required');
  if (!offerId) return reject('referral-offer-id-required');
  if (!REFERRAL_EVIDENCE_CLASSES.includes(evidenceClass)) return reject(`referral-evidence-required:${evidenceClass || 'EMPTY'}`);
  if (!evidenceRefs.length && evidenceClass !== 'OWNER_ATTESTED') return reject('referral-evidence-reference-required');
  const sourceUrl = input.sourceUrl == null ? null : publicHttpsUrl(input.sourceUrl);
  if (input.sourceUrl && !sourceUrl) return reject('referral-source-url-must-be-public-https');
  if (['VERIFIED_FACT', 'BUYER_SIGNAL'].includes(evidenceClass) && !sourceUrl) return reject('referral-external-source-url-required');
  const observedAt = iso(input.observedAt, now);
  if (!observedAt) return reject('referral-observed-time-required');

  const referralKey = digest({ partnerId, accountId, offerId });
  const referral = {
    version: REFERRAL_LEDGER_POLICY_VERSION,
    referralId: text(input.referralId, 180) || `ref_${referralKey.slice(0, 24)}`,
    referralKey,
    partnerId,
    accountId,
    accountDomain,
    offerId,
    evidenceClass,
    evidenceRefs: unique([...evidenceRefs, ...(sourceUrl ? [sourceUrl] : [])]),
    observedAt,
    status: 'REGISTERED_PREPARATION_ONLY',
    contactAuthority: 'NONE',
    partnerContact: 'DISABLED',
    externalAction: 'DISABLED',
    referralDigest: digest({ referralKey, evidenceClass, evidenceRefs, sourceUrl, observedAt })
  };
  return baseReceipt({ status: 'PREPARE_ONLY', date: now, extra: { referral } });
}

function existingReferralRecord(item, now) {
  if (item?.version === REFERRAL_LEDGER_POLICY_VERSION && item.referralKey) return item;
  const normalized = normalizeReferralCandidate(item, { now });
  return normalized.ok ? normalized.referral : null;
}

export function registerReferral({ referral: rawReferral, existing = [], suppressions = [], date = new Date() } = {}) {
  const normalized = rawReferral?.version === REFERRAL_LEDGER_POLICY_VERSION
    ? { ok: true, referral: rawReferral }
    : normalizeReferralCandidate(rawReferral, { now: date });
  if (!normalized.ok) return normalized;
  const referral = normalized.referral;
  const suppressionValues = [referral.referralId, referral.referralKey, referral.partnerId, referral.accountId, referral.accountDomain];
  if (isSuppressed(suppressionValues, suppressions)) {
    return baseReceipt({
      status: 'BLOCKED',
      reasonCodes: ['suppressed-referral'],
      date,
      extra: { referral: null, suppressedReferralKey: referral.referralKey }
    });
  }

  const existingRecords = (Array.isArray(existing) ? existing : [])
    .map(item => existingReferralRecord(item, date))
    .filter(Boolean);
  const prior = existingRecords.find(item => item.referralKey === referral.referralKey);
  if (prior) {
    return baseReceipt({
      status: 'DUPLICATE',
      reasonCodes: ['duplicate-referral'],
      date,
      extra: { ok: false, referral: null, existingReferralId: prior.referralId, referralKey: referral.referralKey }
    });
  }

  return baseReceipt({
    status: 'REGISTERED_PREPARATION_ONLY',
    date,
    extra: { referral, duplicate: false }
  });
}

export function compileReferralRegistry({ referrals = [], existing = [], suppressions = [], date = new Date() } = {}) {
  const records = [];
  const duplicates = [];
  const rejected = [];
  const baseline = Array.isArray(existing) ? existing.slice(0, 500) : [];
  for (const raw of Array.isArray(referrals) ? referrals.slice(0, 500) : []) {
    const result = registerReferral({ referral: raw, existing: [...baseline, ...records], suppressions, date });
    if (result.status === 'REGISTERED_PREPARATION_ONLY') records.push(result.referral);
    else if (result.status === 'DUPLICATE') duplicates.push({ referralKey: result.referralKey, existingReferralId: result.existingReferralId });
    else rejected.push({ referralId: text(raw?.referralId, 180) || null, reasonCodes: result.reasonCodes });
  }
  return baseReceipt({
    status: 'PREPARATION_ONLY',
    date,
    extra: {
      referrals: records,
      duplicates,
      rejected,
      counts: { registered: records.length, duplicates: duplicates.length, rejected: rejected.length },
      note: 'Referral registration records a local route hypothesis. It does not contact a partner, contact a prospect, or prove revenue.'
    }
  });
}

function normalizeCommissionEvent(input = {}, { now = new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reject('commission-event-object-required');
  if (hasContactLikeFields(input)) return reject('contact-data-not-accepted-in-commission-event');
  const eventId = text(input.eventId, 220);
  const referralId = text(input.referralId, 180);
  const partnerId = text(input.partnerId, 180);
  const truthLevel = text(input.truthLevel, 80).toUpperCase();
  const amountCents = input.amountCents == null ? null : integer(input.amountCents);
  const currencyCode = input.currency == null ? '' : currency(input.currency);
  const commissionRateBps = integer(input.commissionRateBps);
  const attributionClass = text(input.attributionClass || 'ATTRIBUTED', 40).toUpperCase();
  if (!eventId) return reject('commission-event-id-required');
  if (!referralId) return reject('commission-referral-id-required');
  if (!partnerId) return reject('commission-partner-id-required');
  if (!COMMISSION_TRUTH_LEVELS.includes(truthLevel)) return reject(`unsupported-commission-truth-level:${truthLevel || 'EMPTY'}`);
  if (amountCents != null && (!Number.isSafeInteger(amountCents) || amountCents <= 0)) return reject('commission-amount-invalid');
  if (['CLEARED_PAYMENT', 'REFUND_OR_DISPUTE'].includes(truthLevel) && amountCents == null) return reject('economic-amount-required');
  if (amountCents != null && !currencyCode) return reject('economic-currency-required');
  if (commissionRateBps == null || commissionRateBps < 0 || commissionRateBps > 10000) return reject('commission-rate-invalid');
  if (!ATTRIBUTION_CLASSES.includes(attributionClass)) return reject('direct-attribution-not-accepted');
  const observedAt = iso(input.occurredAt || input.observedAt, now);
  if (!observedAt) return reject('commission-event-time-required');

  const proof = validateCommercialProof({
    eventId,
    truthLevel,
    paymentProof: input.paymentProof,
    amountCents,
    currencyCode
  });
  if (!proof.ok) return reject(proof.reason);

  const commissionCents = truthLevel === 'CLEARED_PAYMENT'
    ? Math.floor(amountCents * commissionRateBps / 10000)
    : truthLevel === 'REFUND_OR_DISPUTE'
      ? -Math.floor(amountCents * commissionRateBps / 10000)
      : 0;
  const event = {
    version: REFERRAL_LEDGER_POLICY_VERSION,
    eventId,
    referralId,
    partnerId,
    truthLevel,
    amountCents,
    currency: currencyCode || null,
    commissionRateBps,
    commissionCents,
    attributionClass,
    attributionEvidenceRefs: list(input.attributionEvidenceRefs, 30, 240),
    paymentProof: proof.proof,
    occurredAt: observedAt,
    economicStatus: truthLevel === 'CLEARED_PAYMENT'
      ? 'COMMISSION_ACCRUED_FROM_CLEARED_PAYMENT'
      : truthLevel === 'REFUND_OR_DISPUTE'
        ? 'COMMISSION_REVERSED_FROM_REFUND_OR_DISPUTE'
        : 'PENDING_NO_COMMISSION',
    externalAction: 'DISABLED'
  };
  return baseReceipt({ status: 'PREPARE_ONLY', date: now, extra: { event } });
}

function addTotals(totals, event) {
  if (!event.currency) return;
  const row = totals[event.currency] || { grossClearedPaymentCents: 0, refundOrDisputeCents: 0, netPaymentCents: 0, commissionCents: 0 };
  if (event.truthLevel === 'CLEARED_PAYMENT') {
    row.grossClearedPaymentCents += event.amountCents;
    row.netPaymentCents += event.amountCents;
  } else if (event.truthLevel === 'REFUND_OR_DISPUTE') {
    row.refundOrDisputeCents += event.amountCents;
    row.netPaymentCents -= event.amountCents;
  }
  row.commissionCents += event.commissionCents;
  totals[event.currency] = row;
}

/** Build an idempotent, currency-separated, evidence-bound commission ledger. */
export function buildCommissionLedger({ events = [], referrals = [], date = new Date() } = {}) {
  const registered = new Map((Array.isArray(referrals) ? referrals : [])
    .map(item => [text(item?.referralId, 180), item])
    .filter(([id]) => Boolean(id)));
  const seen = new Set();
  const entries = [];
  const duplicates = [];
  const rejected = [];
  const totals = {};

  for (const raw of Array.isArray(events) ? events.slice(0, 1000) : []) {
    const identity = [text(raw?.eventId, 220), text(raw?.paymentProof?.providerEventId, 300), text(raw?.paymentProof?.outcomeId, 220)].filter(Boolean).join('|');
    if (identity && seen.has(identity)) {
      duplicates.push({ eventId: text(raw?.eventId, 220) || null, identity });
      continue;
    }
    const result = normalizeCommissionEvent(raw, { now: date });
    if (!result.ok) {
      rejected.push({ eventId: text(raw?.eventId, 220) || null, reasonCodes: result.reasonCodes });
      continue;
    }
    const event = result.event;
    if (!registered.has(event.referralId)) {
      rejected.push({ eventId: event.eventId, reasonCodes: ['referral-not-registered'] });
      continue;
    }
    if (identity) seen.add(identity);
    entries.push({
      ...event,
      referralKey: registered.get(event.referralId).referralKey,
      partnerId: registered.get(event.referralId).partnerId,
      attribution: {
        class: event.attributionClass,
        referralId: event.referralId,
        evidenceRefs: event.attributionEvidenceRefs
      }
    });
    addTotals(totals, event);
  }

  return baseReceipt({
    status: 'PREPARATION_ONLY',
    date,
    extra: {
      entries,
      duplicates,
      rejected,
      totals,
      counts: { entries: entries.length, duplicates: duplicates.length, rejected: rejected.length },
      revenueRule: 'Only CLEARED_PAYMENT entries accrue commission. Checkout, attempts, provider observations, and model claims remain pending and carry zero commission.',
      currencyRule: 'Currencies remain separate. No implicit FX conversion is performed.'
    }
  });
}

export const normalizeCommissionEventForTest = normalizeCommissionEvent;
