// Local-only distribution channel registry and fail-closed allocator.
//
// A channel record describes a possible route; it does not prove access,
// permission, deliverability, audience, or economics. Allocation is allowed
// to rank only channels backed by verified cleared-payment outcomes. Even
// then it returns a preparation plan and never sends, spends, posts, or calls
// a provider.

export const DISTRIBUTION_CHANNEL_POLICY_VERSION = 'distribution-channel-1.0.0';

export const DISTRIBUTION_CHANNEL_TYPES = Object.freeze([
  'INBOUND', 'PARTNER', 'REFERRAL', 'OWNED_CONTENT', 'SEO', 'MARKETPLACE',
  'AFFILIATE', 'PAID_SEARCH', 'PAID_SOCIAL', 'OUTBOUND', 'COMMUNITY',
  'CREATOR', 'API_ECOSYSTEM'
]);

const CHANNEL_STATUSES = new Set(['UNCONFIGURED', 'PREPARATION_ONLY', 'DISABLED']);
const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeDistributionChannel(candidate = {}) {
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, reason: 'malformed-channel' };
  }
  const id = String(candidate.id || '').trim();
  const type = String(candidate.type || '').trim().toUpperCase();
  const name = String(candidate.name || '').trim();
  if (!id || !name) return { ok: false, reason: 'channel-id-and-name-required' };
  if (!DISTRIBUTION_CHANNEL_TYPES.includes(type)) return { ok: false, reason: `unknown-channel-type:${type}` };
  const status = String(candidate.status || 'UNCONFIGURED').trim().toUpperCase();
  if (!CHANNEL_STATUSES.has(status)) return { ok: false, reason: `unsupported-channel-status:${status}` };
  return {
    ok: true,
    policyVersion: DISTRIBUTION_CHANNEL_POLICY_VERSION,
    id,
    type,
    name,
    status,
    authorization: 'OWNER_REQUIRED',
    capability: 'LOCAL_PREPARATION_ONLY',
    termsEvidence: candidate.termsEvidence || null,
    audienceEvidence: candidate.audienceEvidence || null,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function outcomeScore(outcome) {
  if (!outcome || outcome.truthLevel !== 'CLEARED_PAYMENT') return null;
  if (outcome.contributionMarginCents == null || outcome.ownerMinutes == null) return null;
  const margin = Number(outcome.contributionMarginCents);
  const ownerMinutes = Number(outcome.ownerMinutes);
  if (!Number.isFinite(margin) || !Number.isFinite(ownerMinutes) || ownerMinutes <= 0) return null;
  return margin / ownerMinutes;
}

// Fail-closed allocator. It never treats views, clicks, replies, or model
// estimates as commercial proof. A channel with no verified outcome history
// receives no allocation recommendation.
export function allocateDistribution({ experiment, channels = [], outcomes = [], date = new Date() } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!experiment || typeof experiment !== 'object' || experiment.ok !== true) {
    return {
      ok: false,
      policyVersion: DISTRIBUTION_CHANNEL_POLICY_VERSION,
      status: 'DENIED',
      timestamp,
      reasonCodes: ['commercial-experiment-required'],
      plans: [],
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  const normalized = [];
  const rejected = [];
  for (const candidate of Array.isArray(channels) ? channels.slice(0, 100) : []) {
    const channel = normalizeDistributionChannel(candidate);
    if (channel.ok) normalized.push(channel);
    else rejected.push({ status: 'REJECTED', reason: channel.reason });
  }

  const verifiedByChannel = new Map();
  for (const outcome of Array.isArray(outcomes) ? outcomes : []) {
    const score = outcomeScore(outcome);
    const channelId = String(outcome?.channelId || '').trim();
    if (score == null || !channelId) continue;
    const bucket = verifiedByChannel.get(channelId) || [];
    bucket.push(score);
    verifiedByChannel.set(channelId, bucket);
  }

  const plans = normalized.map(channel => {
    const scores = verifiedByChannel.get(channel.id) || [];
    const measured = scores.length
      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
      : null;
    return {
      channelId: channel.id,
      type: channel.type,
      status: scores.length ? 'MEASURED_PREPARATION_ONLY' : 'UNPROVEN',
      measuredContributionCentsPerOwnerMinute: measured,
      outcomeCount: scores.length,
      authorization: 'OWNER_REQUIRED',
      externalAction: 'DISABLED',
      spendCents: 0
    };
  }).sort((a, b) => (b.measuredContributionCentsPerOwnerMinute ?? -Infinity) - (a.measuredContributionCentsPerOwnerMinute ?? -Infinity) || a.channelId.localeCompare(b.channelId));

  const hasVerifiedOutcome = plans.some(plan => plan.outcomeCount > 0);
  const reasonCodes = [];
  if (!hasVerifiedOutcome) reasonCodes.push('no-verified-cleared-payment-outcome-history');
  if (experiment.status !== 'READY_FOR_OWNER_REVIEW') reasonCodes.push('experiment-not-ready-for-owner-review');

  return {
    ok: true,
    policyVersion: DISTRIBUTION_CHANNEL_POLICY_VERSION,
    status: hasVerifiedOutcome ? 'PREPARE_ONLY_RANKED' : 'DO_NOT_DISTRIBUTE',
    timestamp,
    experimentId: experiment.experimentId || null,
    plans,
    rejected,
    reasonCodes: unique(reasonCodes),
    evidenceRule: 'Only outcome.truthLevel=CLEARED_PAYMENT with measured contribution margin and owner minutes can rank a channel.',
    authorization: {
      externalActions: 'OWNER_REQUIRED',
      providerCalls: 'DISABLED',
      messages: 'DISABLED',
      spend: 'DISABLED'
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export async function logDistributionAllocation(store, allocation) {
  if (!store || typeof store.log !== 'function' || !allocation?.ok) return null;
  return store.log('distribution_allocation', {
    experimentId: allocation.experimentId,
    status: allocation.status,
    reasonCodes: allocation.reasonCodes,
    plans: allocation.plans,
    rejected: allocation.rejected,
    policyVersion: allocation.policyVersion,
    timestamp: allocation.timestamp,
    externalEffectLedger: allocation.externalEffectLedger
  });
}

export const DISTRIBUTION_CHANNEL_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
