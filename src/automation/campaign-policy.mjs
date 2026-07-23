import crypto from 'node:crypto';
import { validateCampaignConfig, createCampaignRecord, CampaignConfigError, CAMPAIGN_CONFIG_SCHEMA } from '../campaign-config.mjs';

const BASE_CAMPAIGN_FIELDS = new Set(Object.keys(CAMPAIGN_CONFIG_SCHEMA.properties));

function baseCampaignFields(input) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => BASE_CAMPAIGN_FIELDS.has(key)));
}

export class CampaignPolicyError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'CampaignPolicyError';
    this.code = code;
  }
}

const POLICY_FIELDS = Object.freeze([
  'allowedChannelTypes', 'postalAddressConfirmed', 'paymentRailConfirmed',
  'pauseThresholds', 'expiresAt'
]);

function clean(value = '', max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validatePolicyExtras(input) {
  const channelTypes = input.allowedChannelTypes;
  if (!Array.isArray(channelTypes) || !channelTypes.length || channelTypes.length > 5) {
    throw new CampaignPolicyError('policy-channel-types-required');
  }
  const allowedChannels = new Set(['email']);
  const normalizedChannels = channelTypes.map(value => clean(value, 30).toLowerCase());
  if (!normalizedChannels.every(value => allowedChannels.has(value))) {
    throw new CampaignPolicyError('policy-channel-type-unsupported');
  }
  if (typeof input.postalAddressConfirmed !== 'boolean') throw new CampaignPolicyError('policy-postal-address-confirmation-required');
  if (typeof input.paymentRailConfirmed !== 'boolean') throw new CampaignPolicyError('policy-payment-rail-confirmation-required');
  const pauseThresholds = input.pauseThresholds || {};
  const { hardBounce, complaint, failure } = pauseThresholds;
  for (const [key, value] of Object.entries({ hardBounce, complaint, failure })) {
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new CampaignPolicyError(`policy-pause-threshold-invalid:${key}`);
  }
  const expiresAt = new Date(input.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) throw new CampaignPolicyError('policy-expiry-invalid');
  return {
    allowedChannelTypes: [...new Set(normalizedChannels)],
    postalAddressConfirmed: input.postalAddressConfirmed,
    paymentRailConfirmed: input.paymentRailConfirmed,
    pauseThresholds: { hardBounce, complaint, failure },
    expiresAt: expiresAt.toISOString()
  };
}

function computeSignature(policyBody, secret) {
  if (!secret || String(secret).length < 16) throw new CampaignPolicyError('policy-secret-not-configured');
  return crypto.createHmac('sha256', String(secret)).update(canonicalize(policyBody)).digest('hex');
}

/**
 * Validates a campaign policy input against both the existing campaign-config schema (niche,
 * geography, offer, price, caps, evidence/confidence thresholds, allowed hours, follow-up rule --
 * all already enforced by campaign-config.mjs) and the additional owner-facing policy fields spec
 * section E requires (channel types, postal/payment-rail confirmation, pause thresholds, expiry),
 * then signs the combined, versioned record with an HMAC so any later tampering with a stored
 * policy is detectable by verifyCampaignPolicy.
 */
export function signCampaignPolicy(input, cfg = {}, options = {}) {
  const secret = options.policySecret || cfg.automation?.policySecret || '';
  const campaign = createCampaignRecord(baseCampaignFields(input), options);
  const extras = validatePolicyExtras(input);
  const owner = clean(options.ownerId || 'owner', 120);
  const signedAt = options.signedAt || new Date().toISOString();
  const policyBody = {
    campaign,
    ...extras,
    evidenceThreshold: campaign.minimumEvidenceConfidence,
    confidenceThreshold: campaign.minimumEvidenceConfidence,
    followupRule: { maximumFollowups: campaign.maximumFollowups, followupDelayDays: campaign.followupDelayDays },
    allowedHours: { start: campaign.businessHourStart, end: campaign.businessHourEnd },
    policyVersion: campaign.configurationVersion,
    owner,
    signedAt
  };
  const signature = computeSignature(policyBody, secret);
  return { id: `policy_${campaign.campaignId}_v${policyBody.policyVersion}`, ...policyBody, signature, signatureAlgorithm: 'hmac-sha256' };
}

export function verifyCampaignPolicy(policy = {}, cfg = {}, options = {}) {
  const secret = options.policySecret || cfg.automation?.policySecret || '';
  // `id` and `signatureAlgorithm` are metadata added after signing, never part of the signed
  // body -- only strip the fields that were never included in the original computeSignature call.
  const { signature, id, signatureAlgorithm, ...policyBody } = policy;
  if (!signature) return { valid: false, reason: 'policy-not-signed' };
  let expected;
  try { expected = computeSignature(policyBody, secret); }
  catch (error) { return { valid: false, reason: error.code || 'policy-secret-not-configured' }; }
  const signatureBuffer = Buffer.from(String(signature), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const matches = signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  if (!matches) return { valid: false, reason: 'policy-signature-mismatch' };
  return { valid: true, reason: '' };
}

export function isCampaignPolicyActive(policy = {}, cfg = {}, now = new Date(), options = {}) {
  const verification = verifyCampaignPolicy(policy, cfg, options);
  if (!verification.valid) return { active: false, reason: verification.reason };
  if (!policy.campaign?.enabled) return { active: false, reason: 'policy-campaign-disabled' };
  const expiresAt = Date.parse(policy.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return { active: false, reason: 'policy-expired' };
  return { active: true, reason: '' };
}

export { CampaignConfigError, POLICY_FIELDS };
