// UberWarm: evidence-first sender reputation and ramp laboratory.
//
// This module never sends mail, manufactures warm-up traffic, changes DNS, or
// claims inbox placement. It turns already-observed mailbox/provider signals
// into conservative cold-send caps, quarantine decisions, and the next
// evidence UberBond needs before widening a sender.

export const UBERWARM_VERSION = 'uberbond.uberwarm.v1';

export const UBERWARM_STATES = Object.freeze([
  'BLOCKED',
  'WARMING',
  'LIMITED_CANARY',
  'RAMP',
  'HOLD',
  'QUARANTINED'
]);

export const DEFAULT_UBERWARM_POLICY = Object.freeze({
  minWarmupDays: 14,
  minObservedDeliveries: 25,
  maxComplaintRate: 0.002,
  maxHardBounceRate: 0.03,
  maxSpamPlacementRate: 0.20,
  minInboxPlacementRate: 0.75,
  canaryDailyCap: 5,
  rampIncrement: 5,
  maxColdDailyCap: 40
});

function clamp(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function finiteInt(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function asIso(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function normalizedPolicy(input = {}) {
  const base = DEFAULT_UBERWARM_POLICY;
  return {
    minWarmupDays: finiteInt(input.minWarmupDays, base.minWarmupDays, 1, 180),
    minObservedDeliveries: finiteInt(input.minObservedDeliveries, base.minObservedDeliveries, 1, 1000000),
    maxComplaintRate: clamp(input.maxComplaintRate, base.maxComplaintRate, 0, 1),
    maxHardBounceRate: clamp(input.maxHardBounceRate, base.maxHardBounceRate, 0, 1),
    maxSpamPlacementRate: clamp(input.maxSpamPlacementRate, base.maxSpamPlacementRate, 0, 1),
    minInboxPlacementRate: clamp(input.minInboxPlacementRate, base.minInboxPlacementRate, 0, 1),
    canaryDailyCap: finiteInt(input.canaryDailyCap, base.canaryDailyCap, 1, 1000),
    rampIncrement: finiteInt(input.rampIncrement, base.rampIncrement, 1, 1000),
    maxColdDailyCap: finiteInt(input.maxColdDailyCap, base.maxColdDailyCap, 1, 10000)
  };
}

function observedNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function baseResult({ state, mailboxId, address, reasons, coldSendCap = 0, score = 0, nextEvidence = [], timestamp }) {
  return {
    version: UBERWARM_VERSION,
    state,
    mailboxId: mailboxId || null,
    address: address || null,
    healthScore: Number(clamp(score).toFixed(4)),
    recommendedColdDailyCap: Math.max(0, Math.round(coldSendCap)),
    reasonCodes: [...new Set(reasons)],
    nextEvidence: [...new Set(nextEvidence)],
    timestamp,
    providerCalls: 0,
    messagesSent: 0,
    dnsChanges: 0,
    spendCents: 0,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}

export function evaluateUberWarmMailbox({ mailboxState = {}, observations = {}, policy = {}, now = new Date() } = {}) {
  const cfg = normalizedPolicy(policy);
  const timestamp = asIso(now);
  const mailboxId = mailboxState.mailboxId || null;
  const address = mailboxState.address || null;
  const reasons = [];
  const nextEvidence = [];

  const authenticated = mailboxState.authenticationStatus === 'AUTHENTICATED' || observations.authenticated === true;
  const paused = mailboxState.paused === true || observations.paused === true;
  const warmupStatus = String(mailboxState.warmupStatus || observations.warmupStatus || '').toUpperCase();
  const warmupDays = finiteInt(observations.warmupDays, 0, 0, 3650);

  if (!authenticated) reasons.push('mailbox-not-authenticated');
  if (paused) reasons.push('mailbox-paused');
  if (!authenticated || paused) {
    nextEvidence.push('authenticated-unpaused-mailbox-receipt');
    return baseResult({ state: paused ? 'QUARANTINED' : 'BLOCKED', mailboxId, address, reasons, nextEvidence, timestamp });
  }

  if (warmupStatus !== 'WARMUP_COMPLETE' || warmupDays < cfg.minWarmupDays) {
    reasons.push(warmupStatus !== 'WARMUP_COMPLETE' ? 'warmup-not-complete' : 'minimum-warmup-period-not-observed');
    nextEvidence.push('provider-observed-warmup-complete', `warmup-age-at-least-${cfg.minWarmupDays}-days`);
    return baseResult({ state: 'WARMING', mailboxId, address, reasons, nextEvidence, timestamp });
  }

  const delivered = finiteInt(observations.observedDeliveries, 0, 0, 1000000000);
  const complaintRate = observedNumber(observations.complaintRate);
  const hardBounceRate = observedNumber(observations.hardBounceRate);
  const spamPlacementRate = observedNumber(observations.spamPlacementRate);
  const inboxPlacementRate = observedNumber(observations.inboxPlacementRate);

  const severe = [];
  if (complaintRate != null && complaintRate > cfg.maxComplaintRate) severe.push('complaint-rate-above-policy');
  if (hardBounceRate != null && hardBounceRate > cfg.maxHardBounceRate) severe.push('hard-bounce-rate-above-policy');
  if (spamPlacementRate != null && spamPlacementRate > cfg.maxSpamPlacementRate) severe.push('spam-placement-rate-above-policy');
  if (inboxPlacementRate != null && inboxPlacementRate < cfg.minInboxPlacementRate) severe.push('inbox-placement-rate-below-policy');
  if (observations.uncertainProviderOutcome === true) severe.push('uncertain-provider-outcome');
  if (observations.duplicateReservationDetected === true) severe.push('duplicate-reservation-detected');

  if (severe.length) {
    return baseResult({
      state: 'QUARANTINED', mailboxId, address, reasons: severe,
      nextEvidence: ['fresh-provider-health-receipt', 'fresh-placement-observation', 'circuit-breaker-clearance'],
      timestamp
    });
  }

  const missing = [];
  if (delivered < cfg.minObservedDeliveries) missing.push('insufficient-observed-deliveries');
  if (complaintRate == null) missing.push('complaint-rate-unobserved');
  if (hardBounceRate == null) missing.push('hard-bounce-rate-unobserved');
  if (inboxPlacementRate == null && spamPlacementRate == null) missing.push('placement-unobserved');

  const providerCap = finiteInt(observations.providerDailyCap ?? mailboxState.currentDailyCap, cfg.maxColdDailyCap, 1, 1000000);
  const currentCap = finiteInt(mailboxState.currentDailyCap, cfg.canaryDailyCap, 0, 1000000);
  const absoluteCap = Math.min(providerCap, cfg.maxColdDailyCap);

  if (missing.length) {
    return baseResult({
      state: 'LIMITED_CANARY', mailboxId, address, reasons: missing,
      coldSendCap: Math.min(cfg.canaryDailyCap, absoluteCap),
      score: 0.45,
      nextEvidence: ['observed-bounce-and-complaint-rates', 'observed-placement-result', `at-least-${cfg.minObservedDeliveries}-observed-deliveries`],
      timestamp
    });
  }

  const complaintScore = 1 - clamp(complaintRate / Math.max(cfg.maxComplaintRate, Number.EPSILON));
  const bounceScore = 1 - clamp(hardBounceRate / Math.max(cfg.maxHardBounceRate, Number.EPSILON));
  const placementScore = inboxPlacementRate != null
    ? clamp((inboxPlacementRate - cfg.minInboxPlacementRate) / Math.max(1 - cfg.minInboxPlacementRate, Number.EPSILON), 0)
    : 1 - clamp(spamPlacementRate / Math.max(cfg.maxSpamPlacementRate, Number.EPSILON));
  const sampleScore = clamp(delivered / Math.max(cfg.minObservedDeliveries * 4, 1));
  const score = 0.30 * complaintScore + 0.30 * bounceScore + 0.25 * placementScore + 0.15 * sampleScore;

  const recommended = Math.min(absoluteCap, Math.max(cfg.canaryDailyCap, currentCap + cfg.rampIncrement));
  const atCeiling = recommended <= currentCap || currentCap >= absoluteCap;
  return baseResult({
    state: atCeiling ? 'HOLD' : 'RAMP', mailboxId, address,
    reasons: atCeiling ? ['healthy-at-current-policy-ceiling'] : ['healthy-observed-signals-support-bounded-ramp'],
    coldSendCap: atCeiling ? Math.min(currentCap, absoluteCap) : recommended,
    score,
    nextEvidence: ['continue-observing-deliveries-bounces-complaints-placement'],
    timestamp
  });
}

export function compileUberWarmFleet({ mailboxes = [], observationsByMailbox = {}, policy = {}, now = new Date() } = {}) {
  const decisions = (Array.isArray(mailboxes) ? mailboxes : []).map(mailbox => evaluateUberWarmMailbox({
    mailboxState: mailbox,
    observations: observationsByMailbox?.[mailbox.mailboxId] || {},
    policy,
    now
  }));
  const totalRecommendedDailyCap = decisions.reduce((sum, item) => sum + item.recommendedColdDailyCap, 0);
  const ready = decisions.filter(item => ['LIMITED_CANARY', 'RAMP', 'HOLD'].includes(item.state));
  return {
    version: UBERWARM_VERSION,
    mailboxCount: decisions.length,
    readyMailboxCount: ready.length,
    quarantinedMailboxCount: decisions.filter(item => item.state === 'QUARANTINED').length,
    totalRecommendedDailyCap,
    decisions,
    externalEffectAuthority: 'NONE',
    messagesSent: 0,
    note: 'Capacity is a policy recommendation derived from supplied observations, not proof of deliverability or permission to send.'
  };
}
