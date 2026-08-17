// Represents distribution channels as real, comparable objects. Static
// catalog + a cfg-driven availability computation -- never marks a channel
// operational unless the actual config says it is. historicalOutcomes is
// always [] here: no channel in this system has ever produced a real
// outcome (see docs/PROMETHEUS_DISTRIBUTION_BRAIN.md for why this wasn't
// built out further before real data exists).
export const DISTRIBUTION_CHANNEL_REGISTRY_POLICY_VERSION = 'distribution-channel-registry-1.0.0';

const CHANNELS = Object.freeze([
  { id: 'direct-outbound', name: 'Direct cold outbound (Gmail)', authorityRequirements: ['deliverability-guard', 'v9-consequence-boundary'] },
  { id: 'partner', name: 'Partner / white-label referral', authorityRequirements: ['owner-negotiated-agreement'] },
  { id: 'referral', name: 'Existing-customer referral', authorityRequirements: ['at-least-one-real-customer'] },
  { id: 'meta-ads', name: 'Meta advertising', authorityRequirements: ['ad-account-credentials', 'real-spend-authorization'] },
  { id: 'google-ads', name: 'Google advertising', authorityRequirements: ['ad-account-credentials', 'real-spend-authorization'] },
  { id: 'seo', name: 'Organic SEO', authorityRequirements: [] },
  { id: 'aeo-geo', name: 'AI answer/generative-engine optimization', authorityRequirements: [] },
  { id: 'marketplace', name: 'Third-party marketplace listing', authorityRequirements: ['marketplace-account'] },
  { id: 'affiliate', name: 'Affiliate program', authorityRequirements: ['payout-mechanism'] },
  { id: 'creator', name: 'Creator partnership', authorityRequirements: ['owner-negotiated-agreement'] },
  { id: 'inbound-self-serve', name: 'Public self-serve intake (already live)', authorityRequirements: [] },
  { id: 'free-tool', name: 'Free tool / lead magnet', authorityRequirements: [] },
  { id: 'community', name: 'Community participation', authorityRequirements: ['owner-time'] },
  { id: 'retargeting', name: 'Retargeting', authorityRequirements: ['ad-account-credentials', 'real-spend-authorization'] }
]);

// Availability is computed from real config, never asserted statically.
// Only channels this codebase can actually verify are marked available;
// everything else is UNCONFIGURED/UNAVAILABLE by default.
function computeAvailability(id, cfg) {
  if (id === 'direct-outbound') return Boolean(cfg?.outbound?.enabled) && !cfg?.outbound?.dryRun;
  if (id === 'inbound-self-serve') return Boolean(cfg?.revenue?.publicIntake);
  return false; // every other channel requires infrastructure/credentials this codebase has never configured
}

export function listChannels(cfg = {}) {
  return CHANNELS.map(channel => ({
    ...channel,
    available: computeAvailability(channel.id, cfg),
    historicalOutcomes: [], // real: none exist anywhere in this system yet
    costModel: 'UNKNOWN', // never fabricated
    capacityNote: 'No real capacity model exists for this channel yet.'
  }));
}

export function getChannel(id, cfg = {}) {
  return listChannels(cfg).find(channel => channel.id === id) || null;
}

export const CHANNEL_IDS = CHANNELS.map(channel => channel.id);
