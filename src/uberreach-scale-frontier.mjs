import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERREACH_SCALE_FRONTIER_VERSION = 'uberbond.uberreach-scale-frontier.v1';

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const cleanDomain = value => String(value ?? '').trim().toLowerCase();

function zero(extra = {}) {
  return {
    version: UBERREACH_SCALE_FRONTIER_VERSION,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function profileCapacity(profile = {}) {
  const inboxesPerDomain = finite(profile.maxMailboxesPerDomain);
  const coldPerInbox = finite(profile.maxColdDailyPerMailbox);
  if (!Number.isInteger(inboxesPerDomain) || inboxesPerDomain <= 0 || coldPerInbox == null || coldPerInbox < 0) {
    return { ok: false, reasonCodes: ['fresh-numeric-cold-capacity-profile-required'] };
  }
  return {
    ok: true,
    inboxesPerDomain,
    coldPerInbox,
    theoreticalColdPerDomain: Math.floor(inboxesPerDomain * coldPerInbox)
  };
}

function eligibleRoots(roots = []) {
  const seen = new Set();
  const accepted = [];
  const rejected = [];
  for (const root of Array.isArray(roots) ? roots : []) {
    const domain = cleanDomain(root?.domain || root?.root || root);
    const reasons = [];
    if (!domain || !domain.includes('.')) reasons.push('valid-domain-required');
    if (seen.has(domain)) reasons.push('duplicate-domain');
    if (root?.ownershipVerified !== true) reasons.push('ownership-evidence-required');
    if (root?.providerTermsAccepted !== true) reasons.push('provider-terms-acceptance-required');
    if (root?.dnsAuthorityObserved !== true) reasons.push('dns-authority-evidence-required');
    if (reasons.length) {
      rejected.push({ domain: domain || null, reasonCodes: reasons });
      continue;
    }
    seen.add(domain);
    accepted.push({ domain });
  }
  return { accepted, rejected };
}

/**
 * Plans horizontal outreach scale without relaxing targeting quality or
 * pretending that topology capacity is operational deliverability.
 *
 * Provider-advertised per-domain capacity is treated as a planning envelope.
 * Operational daily capacity remains the minimum of observed sender, domain,
 * egress, recipient and qualified-lead evidence elsewhere in UberReach.
 */
export function compileUberReachScaleFrontier({
  targetColdDaily = 0,
  profile = {},
  roots = [],
  qualifiedLeadInventory = 0,
  observedEgressColdDailyCap = 0,
  observedRecipientColdDailyCap = 0,
  observedHealthyMailboxColdDailyCap = 0,
  campaignDailyCeiling = Number.MAX_SAFE_INTEGER
} = {}) {
  const capacity = profileCapacity(profile);
  if (!capacity.ok) {
    return zero({ ok: false, status: 'SCALE_FRONTIER_REFUSED', reasonCodes: capacity.reasonCodes });
  }

  const rootEvidence = eligibleRoots(roots);
  const target = Math.max(0, Math.floor(finite(targetColdDaily) || 0));
  const qualified = Math.max(0, Math.floor(finite(qualifiedLeadInventory) || 0));
  const egress = Math.max(0, Math.floor(finite(observedEgressColdDailyCap) || 0));
  const recipient = Math.max(0, Math.floor(finite(observedRecipientColdDailyCap) || 0));
  const healthyMailbox = Math.max(0, Math.floor(finite(observedHealthyMailboxColdDailyCap) || 0));
  const campaignCeiling = Math.max(0, Math.floor(finite(campaignDailyCeiling) || 0));

  const verifiedRootCount = rootEvidence.accepted.length;
  const planningEnvelope = verifiedRootCount * capacity.theoreticalColdPerDomain;
  const rootsRequiredForTarget = target > 0
    ? Math.ceil(target / capacity.theoreticalColdPerDomain)
    : 0;
  const additionalVerifiedRootsNeeded = Math.max(0, rootsRequiredForTarget - verifiedRootCount);

  const operationalDimensions = {
    healthyMailbox,
    egress,
    recipient,
    qualifiedLeadInventory: qualified,
    campaignCeiling
  };
  const evidenceBoundOperationalMax = Math.min(...Object.values(operationalDimensions));

  return zero({
    ok: true,
    status: evidenceBoundOperationalMax > 0 ? 'EVIDENCE_BOUND_SCALE_FRONTIER_READY' : 'TOPOLOGY_PLANNED_OPERATIONAL_EVIDENCE_PENDING',
    theoreticalColdPerDomain: capacity.theoreticalColdPerDomain,
    maxMailboxesPerDomain: capacity.inboxesPerDomain,
    maxColdDailyPerMailbox: capacity.coldPerInbox,
    verifiedRootCount,
    verifiedRoots: rootEvidence.accepted,
    rejectedRoots: rootEvidence.rejected,
    theoreticalPlanningEnvelope: planningEnvelope,
    targetColdDaily: target,
    rootsRequiredForTarget,
    additionalVerifiedRootsNeeded,
    operationalDimensions,
    evidenceBoundOperationalMax,
    qualityFloorRelaxed: false,
    scaleLaw: 'HORIZONTAL_SCALE_ONLY_AFTER_EVIDENCE; NEVER_LOWER_LEAD_QUALITY_OR_SUPPRESSION_RULES_TO_FILL_CAPACITY',
    interpretation: 'There is no fixed software-side absolute ceiling. With additional legitimately owned and evidenced roots, topology capacity scales horizontally. Real send volume remains capped by observed deliverability, recipient-provider budgets, qualified lead inventory, campaign policy and authorization.',
    truthBoundary: 'Theoretical planning envelope is not live deliverability. Unknown or unobserved operational dimensions contribute zero to the evidence-bound maximum.'
  });
}
