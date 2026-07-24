// 24/7 Continuous Revenue Core, section 7: Bounded Owner Authority.
//
// "Mohamed should approve a bounded campaign policy, not every message." This module is that
// policy object: the owner reviews and decides on it once (decideCampaignPolicy, mirroring
// approval.mjs's own decideApproval), and it bounds every prospective send named in the mission --
// exact campaign, offer, audience, channels, maximum prospects, maximum daily sends, sender
// identity, provider, budget ceiling, start and expiry, approved message rules. It does not
// replace approval.mjs's per-message approval (that gate still exists and is untouched); it is an
// additional, coarser-grained bound a caller can check before ever assembling a per-message
// approval in the first place.
//
// "No approval may become unlimited or permanent" is enforced structurally, not by convention:
// startAt/expiresAt are both required, expiresAt must be strictly after startAt, and the gap
// between them can never exceed MAX_POLICY_DURATION_DAYS -- there is no field combination that
// produces an open-ended policy, and expireStaleCampaignPolicies expires an *approved* policy past
// its own expiresAt exactly like approval.mjs expires a pending approval past its expiresAt.
import { id, now } from './store.mjs';
import { ALLOWED_CHANNELS } from './importer.mjs';
import { SERVICE_CATALOG } from './config.mjs';

export class CampaignPolicyError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'CampaignPolicyError';
    this.code = code;
  }
}

export const REQUIRED_TEXT_FIELDS = Object.freeze(['campaignName', 'offerKey', 'audience', 'senderIdentity']);
export const MAX_POLICY_DURATION_DAYS = 90;

// The mission's own required defaults: "outbound enabled=false, dry-run=true, live-send
// approval=false, provider=test, spend limit=0." `budgetCeilingCents` is the "spend limit" field --
// naming it once as the budget ceiling, not duplicated under two names for the same bound.
export const CAMPAIGN_POLICY_DEFAULTS = Object.freeze({
  outboundEnabled: false, dryRun: true, liveSendApproval: false, provider: 'test', budgetCeilingCents: 0
});

function normalizeText(value) { return String(value ?? '').trim(); }

/** Reports every reason a proposed policy would be refused, never just the first -- same
 * discipline as service-registry.mjs#validateServiceDefinition and channel-safety.mjs. Never
 * throws for a bad input; only createCampaignPolicy below throws, on `valid: false`. */
export function validateCampaignPolicy(input) {
  const problems = [];
  if (!input || typeof input !== 'object') return { valid: false, problems: ['not-an-object'] };

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!normalizeText(input[field])) problems.push(`blank-${field}`);
  }
  if (normalizeText(input.offerKey) && !SERVICE_CATALOG[input.offerKey]) problems.push('unknown-offer-key');

  if (!Array.isArray(input.channels) || input.channels.length === 0) problems.push('missing-channels');
  else if (input.channels.some(channel => !ALLOWED_CHANNELS.includes(channel))) problems.push('channel-not-globally-allowed');

  if (!Number.isInteger(input.maxProspects) || input.maxProspects <= 0) problems.push('invalid-maxProspects');
  if (!Number.isInteger(input.maxDailySends) || input.maxDailySends <= 0) problems.push('invalid-maxDailySends');

  if (!Array.isArray(input.approvedMessageRules) || input.approvedMessageRules.length === 0 || input.approvedMessageRules.some(rule => !normalizeText(rule))) {
    problems.push('missing-or-blank-approvedMessageRules');
  }

  const budgetCeilingCents = input.budgetCeilingCents === undefined ? CAMPAIGN_POLICY_DEFAULTS.budgetCeilingCents : input.budgetCeilingCents;
  if (!Number.isInteger(budgetCeilingCents) || budgetCeilingCents < 0) problems.push('invalid-budgetCeilingCents');

  const startMs = Date.parse(input.startAt);
  const expiryMs = Date.parse(input.expiresAt);
  if (!input.startAt || !Number.isFinite(startMs)) problems.push('missing-or-invalid-startAt');
  if (!input.expiresAt || !Number.isFinite(expiryMs)) problems.push('missing-or-invalid-expiresAt');
  if (Number.isFinite(startMs) && Number.isFinite(expiryMs)) {
    if (expiryMs <= startMs) problems.push('expiry-not-after-start');
    else if ((expiryMs - startMs) / 86400000 > MAX_POLICY_DURATION_DAYS) problems.push('duration-exceeds-maximum');
  }

  return { valid: problems.length === 0, problems };
}

/** Builds an unpersisted, `status: 'pending'` campaign policy record. The caller persists it
 * (`store.add('campaignPolicies', ...)`), matching model.mjs's own newX() constructors -- this
 * function validates and shapes, it does not touch the store. */
export function createCampaignPolicy(input = {}) {
  const result = validateCampaignPolicy(input);
  if (!result.valid) throw new CampaignPolicyError('invalid-campaign-policy', result.problems.join(', '));
  return {
    id: id('policy'), status: 'pending',
    campaignName: normalizeText(input.campaignName), offerKey: input.offerKey, audience: normalizeText(input.audience),
    channels: [...input.channels], maxProspects: input.maxProspects, maxDailySends: input.maxDailySends,
    senderIdentity: normalizeText(input.senderIdentity),
    provider: normalizeText(input.provider) || CAMPAIGN_POLICY_DEFAULTS.provider,
    budgetCeilingCents: input.budgetCeilingCents === undefined ? CAMPAIGN_POLICY_DEFAULTS.budgetCeilingCents : input.budgetCeilingCents,
    startAt: input.startAt, expiresAt: input.expiresAt,
    approvedMessageRules: [...input.approvedMessageRules],
    outboundEnabled: input.outboundEnabled === true ? true : CAMPAIGN_POLICY_DEFAULTS.outboundEnabled,
    dryRun: input.dryRun === false ? false : CAMPAIGN_POLICY_DEFAULTS.dryRun,
    liveSendApproval: input.liveSendApproval === true ? true : CAMPAIGN_POLICY_DEFAULTS.liveSendApproval,
    reviewedBy: null, reviewedAt: null,
    data: {}
  };
}

function isPastExpiry(policy, nowMs = Date.now()) { return Date.parse(policy.expiresAt) <= nowMs; }

/** Mirrors approval.mjs#decideApproval exactly -- same status vocabulary, same "cannot re-decide,"
 * same "expired at decision time still counts as expired, not decidable." */
export async function decideCampaignPolicy(store, policyId, decision, { actor, nowMs = Date.now() } = {}) {
  if (!['approved', 'rejected'].includes(decision)) throw new CampaignPolicyError('invalid-decision', decision);
  const policy = await store.get('campaignPolicies', policyId);
  if (!policy) throw new CampaignPolicyError('campaign-policy-not-found', policyId);
  if (policy.status !== 'pending') throw new CampaignPolicyError('campaign-policy-not-pending', `current status: ${policy.status}`);
  if (isPastExpiry(policy, nowMs)) {
    await store.patch('campaignPolicies', policyId, { status: 'expired' });
    throw new CampaignPolicyError('campaign-policy-expired');
  }
  const updated = await store.patch('campaignPolicies', policyId, { status: decision, reviewedBy: actor || 'owner', reviewedAt: new Date(nowMs).toISOString() });
  await store.log('campaign_policy_decided', { policyId, decision, actor });
  return updated;
}

/**
 * Sweeps every non-terminal policy for expiry -- unlike approval.mjs's sweep (pending only), this
 * also expires an already-*approved* policy once its own expiresAt has passed, because an approved
 * policy is exactly the kind of standing authority the mission says must never become permanent.
 */
export async function expireStaleCampaignPolicies(store, nowMs = Date.now()) {
  const active = await store.list('campaignPolicies');
  let expired = 0;
  for (const policy of active) {
    if (!['pending', 'approved'].includes(policy.status)) continue;
    if (isPastExpiry(policy, nowMs)) { await store.patch('campaignPolicies', policy.id, { status: 'expired' }); expired += 1; }
  }
  if (expired) await store.log('campaign_policies_expired', { count: expired });
  return { expired };
}

/**
 * Checks one prospective send against an already-decided policy's bounds. Reports every violated
 * bound, not just the first. `prospectsSentSoFar`/`sentToday`/`spendSoFarCents` are counts the
 * caller supplies (this module does not itself scan sendRecords -- outbound.mjs's sendRecords has
 * no policyId linkage yet; wiring that is a disclosed follow-on, not fabricated as already done
 * here) so this function stays a pure, deterministic bound check, fully testable without a store.
 */
export function evaluateSendUnderPolicy(policy, { channel, prospectsSentSoFar = 0, sentToday = 0, spendSoFarCents = 0, estimatedCostCents = 0, nowMs = Date.now() } = {}) {
  const reasons = [];
  if (!policy) return { ok: false, reasons: ['no-policy'] };
  if (policy.status !== 'approved') reasons.push('policy-not-approved');
  if (Date.parse(policy.startAt) > nowMs) reasons.push('policy-not-yet-started');
  if (Date.parse(policy.expiresAt) <= nowMs) reasons.push('policy-expired');
  if (!policy.channels.includes(channel)) reasons.push('channel-not-in-policy');
  if (prospectsSentSoFar >= policy.maxProspects) reasons.push('max-prospects-reached');
  if (sentToday >= policy.maxDailySends) reasons.push('max-daily-sends-reached');
  if (spendSoFarCents + estimatedCostCents > policy.budgetCeilingCents) reasons.push('budget-ceiling-exceeded');
  if (!policy.outboundEnabled) reasons.push('outbound-disabled-by-policy');
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, dryRun: policy.dryRun !== false, requiresLiveSendApproval: policy.liveSendApproval !== true };
}
