import crypto from 'node:crypto';

export const SOVEREIGN_MONEY_MACHINE_PROOF_VERSION = 'uberbond.sovereign-money-machine-proof.v1';
export const MIN_ENDURANCE_MS = 24 * 60 * 60 * 1000;
export const MAX_PULSE_GAP_MS = 5 * 60 * 1000;
export const MAX_RECEIPT_AGE_MS = 10 * 60 * 1000;

const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const list = value => Array.isArray(value) ? value : [];
const int = value => Number.isSafeInteger(Number(value)) ? Number(value) : null;
const dateMs = value => {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
};
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

function classifyExternalEffect(receipt = {}) {
  const ledger = receipt.externalEffectLedger || receipt.externalEffects || {};
  const keys = ['providerCalls','messages','purchases','deployments','credentialChanges','dnsChanges','productionMutations','spendCents'];
  const present = keys.every(key => Object.hasOwn(ledger, key));
  const numeric = present && keys.every(key => Number.isSafeInteger(ledger[key]) && ledger[key] >= 0);
  const occurred = numeric && keys.some(key => ledger[key] > 0);
  return { present, numeric, occurred, ledger };
}

export function evaluateSovereignMoneyMachineProof(bundle = {}, { now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : dateMs(now);
  const reasons = [];
  const evidence = {};

  const sourceRevision = String(bundle.sourceRevision || '').trim();
  const sourceReady = /^[0-9a-f]{40}$/i.test(sourceRevision);
  if (!sourceReady) reasons.push('current-40-char-source-revision-required');
  evidence.sourceRevision = { proven: sourceReady, value: sourceRevision || null };

  const runtime = bundle.runtimeReceipt || {};
  const runtimeAt = dateMs(runtime.observedAt);
  const runtimeFresh = runtimeAt != null && nowMs != null && nowMs >= runtimeAt && nowMs - runtimeAt <= MAX_RECEIPT_AGE_MS;
  const runtimeReady = runtime.ready === true && runtime.status === 'SOVEREIGN_REVENUE_RUNTIME_READY' && runtimeFresh;
  if (!runtimeReady) reasons.push('fresh-ready-sovereign-runtime-receipt-required');
  evidence.runtime = { proven: runtimeReady, observedAt: runtime.observedAt || null, blockers: list(runtime.blockers) };

  const pulse = bundle.pulseReceipt || {};
  const pulseAt = dateMs(pulse.observedAt);
  const pulseFresh = pulseAt != null && nowMs != null && nowMs >= pulseAt && nowMs - pulseAt <= MAX_RECEIPT_AGE_MS;
  const pulseQueued = list(pulse.jobsQueued).length > 0;
  const pulseHealthy = pulse.status === 'FOUNDER_ECONOMIC_MISSION_PULSE_DISPATCHED' && pulseQueued && list(pulse.jobFailures).length === 0 && pulseFresh;
  if (!pulseHealthy) reasons.push('fresh-successful-economic-pulse-with-queued-jobs-required');
  evidence.pulse = { proven: pulseHealthy, jobsQueued: list(pulse.jobsQueued).length, observedAt: pulse.observedAt || null };

  const workerReceipts = list(bundle.workerReceipts);
  const realEffects = workerReceipts.filter(receipt => {
    const effect = classifyExternalEffect(receipt);
    return effect.present && effect.numeric && effect.occurred && nonEmpty(receipt.receiptRef || receipt.providerReceiptRef || receipt.id);
  });
  const externalEffectProven = realEffects.length > 0;
  if (!externalEffectProven) reasons.push('provider-origin-external-effect-receipt-required');
  evidence.externalEffects = { proven: externalEffectProven, receiptCount: realEffects.length };

  const payments = list(bundle.paymentReceipts).filter(receipt => {
    const amount = int(receipt.clearedAmountCents ?? receipt.amountCents);
    return receipt.providerOrigin === true
      && receipt.state === 'CLEARED'
      && amount != null && amount > 0
      && nonEmpty(receipt.providerEventId || receipt.providerReceiptRef)
      && list(receipt.evidenceRefs).length > 0;
  });
  const clearedPaymentProven = payments.length > 0;
  if (!clearedPaymentProven) reasons.push('positive-provider-origin-cleared-payment-required');
  evidence.payment = { proven: clearedPaymentProven, receiptCount: payments.length };

  const clearedIds = new Set(payments.map(p => p.id || p.paymentReceiptId || p.providerEventId).filter(Boolean));
  const deliveries = list(bundle.deliveryReceipts).filter(receipt => receipt.accepted === true
    && nonEmpty(receipt.id || receipt.deliveryReceiptRef)
    && list(receipt.evidenceRefs).length > 0
    && (!receipt.paymentReceiptId || clearedIds.has(receipt.paymentReceiptId)));
  const acceptedDeliveryProven = deliveries.length > 0;
  if (!acceptedDeliveryProven) reasons.push('accepted-paid-delivery-receipt-required');
  evidence.delivery = { proven: acceptedDeliveryProven, receiptCount: deliveries.length };

  const economics = bundle.economics || {};
  const revenue = int(economics.clearedRevenueCents);
  const variableCost = int(economics.variableCostCents);
  const profit = int(economics.clearedContributionProfitCents);
  const economicsConsistent = revenue != null && revenue > 0
    && variableCost != null && variableCost >= 0
    && profit != null && profit > 0
    && revenue - variableCost === profit
    && list(economics.evidenceRefs).length > 0;
  if (!economicsConsistent) reasons.push('positive-evidence-backed-cleared-contribution-profit-required');
  evidence.economics = { proven: economicsConsistent, clearedRevenueCents: revenue, variableCostCents: variableCost, clearedContributionProfitCents: profit };

  const endurance = bundle.endurance || {};
  const startedAt = dateMs(endurance.startedAt);
  const observedAt = dateMs(endurance.observedAt);
  const elapsedMs = startedAt != null && observedAt != null ? observedAt - startedAt : null;
  const maxGapMs = int(endurance.maxPulseGapMs);
  const pulseCount = int(endurance.consecutivePulseCount);
  const enduranceProven = elapsedMs != null && elapsedMs >= MIN_ENDURANCE_MS
    && maxGapMs != null && maxGapMs >= 0 && maxGapMs <= MAX_PULSE_GAP_MS
    && pulseCount != null && pulseCount >= 288
    && list(endurance.evidenceRefs).length > 0;
  if (!enduranceProven) reasons.push('24h-resident-endurance-with-bounded-pulse-gap-required');
  evidence.endurance = { proven: enduranceProven, elapsedMs, maxPulseGapMs: maxGapMs, consecutivePulseCount: pulseCount };

  const softwareChainProven = sourceReady && runtimeReady && pulseHealthy;
  const realWireProven = softwareChainProven && externalEffectProven && clearedPaymentProven && acceptedDeliveryProven && economicsConsistent;
  const fullyProven = realWireProven && enduranceProven;

  const status = fullyProven
    ? 'SOVEREIGN_MONEY_MACHINE_PROVEN_24H'
    : realWireProven
      ? 'SOVEREIGN_MONEY_MACHINE_REAL_WIRE_PROVEN_ENDURANCE_PENDING'
      : softwareChainProven
        ? 'SOVEREIGN_MONEY_MACHINE_SOFTWARE_CHAIN_PROVEN_REAL_WIRE_PENDING'
        : 'SOVEREIGN_MONEY_MACHINE_NOT_PROVEN';

  const receipt = {
    schemaVersion: SOVEREIGN_MONEY_MACHINE_PROOF_VERSION,
    status,
    proven: fullyProven,
    softwareChainProven,
    realWireProven,
    enduranceProven,
    evidence,
    reasonCodes: [...new Set(reasons)],
    truthBoundary: 'PROVEN requires current source identity, a fresh ready resident runtime receipt, a fresh successful economic pulse, provider-origin external effects, positive provider-origin CLEARED payment, accepted paid delivery, evidence-backed positive cleared contribution profit, and >=24h resident continuity. Sandbox payments, queued jobs, pipeline value, model assertions, synthetic fixtures, stale receipts, and silence never satisfy this proof.',
  };
  return { ...receipt, receiptDigest: digest(receipt) };
}
