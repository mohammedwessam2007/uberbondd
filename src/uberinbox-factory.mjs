// UberInbox: clean-room, provider-neutral mailbox capacity planner.
//
// This is NOT a quota-evasion or spam-volume system. It maximizes legitimately
// provisionable mailbox inventory across already-owned domains and provider
// capacity that is explicitly observed, fresh, terms-compatible and budgeted.
// Marketing words such as "unlimited" never become numeric capacity. This
// module makes no network calls, purchases nothing, provisions nothing, changes
// no DNS, creates no credentials and grants no outreach authority.

import { OWNED_ROOT_DOMAINS } from './domain-purpose-plan.mjs';
import { UBERDOSO_MAX_MAILBOXES_PER_DOMAIN } from './uberdoso-kernel.mjs';
import { mine } from './unknown-unknown-mining.mjs';

export const UBERINBOX_VERSION = 'uberbond.uberinbox.v1';

export const DEFAULT_UBERINBOX_POLICY = Object.freeze({
  maxMailboxesPerDomain: UBERDOSO_MAX_MAILBOXES_PER_DOMAIN,
  maxProvisioningBatch: 100,
  maxProviderEvidenceAgeHours: 168,
  requireProviderTermsApproval: true,
  requireApiProvisioning: true,
  oneProviderPerDomain: true
});

const BLOCKED_DOMAIN_STATES = new Set(['PAUSED', 'BLOCKED', 'RETIRED']);
const READY_PROVIDER_STATES = new Set(['AVAILABLE', 'ACTIVE', 'READY']);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function finiteInt(value, fallback = null, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function finiteMoney(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

function parseTime(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function normalizePolicy(input = {}) {
  return {
    maxMailboxesPerDomain: finiteInt(input.maxMailboxesPerDomain, DEFAULT_UBERINBOX_POLICY.maxMailboxesPerDomain, 1, 1000),
    maxProvisioningBatch: finiteInt(input.maxProvisioningBatch, DEFAULT_UBERINBOX_POLICY.maxProvisioningBatch, 1, 1000),
    maxProviderEvidenceAgeHours: finiteInt(input.maxProviderEvidenceAgeHours, DEFAULT_UBERINBOX_POLICY.maxProviderEvidenceAgeHours, 1, 24 * 365),
    requireProviderTermsApproval: input.requireProviderTermsApproval !== false,
    requireApiProvisioning: input.requireApiProvisioning !== false,
    oneProviderPerDomain: input.oneProviderPerDomain !== false
  };
}

function normalizeDomain(input = {}) {
  return {
    domainId: text(input.domainId || input.id, 160),
    domain: text(input.domain, 253).toLowerCase(),
    ownershipStatus: text(input.ownershipStatus, 80).toUpperCase(),
    state: text(input.state, 80).toUpperCase(),
    provider: text(input.provider, 80).toLowerCase(),
    purpose: text(input.purpose || 'outreach', 80).toLowerCase()
  };
}

function normalizeMailbox(input = {}) {
  return {
    mailboxId: text(input.mailboxId || input.id, 160),
    address: text(input.address || input.email, 320).toLowerCase(),
    domain: text(input.domain || String(input.address || input.email || '').split('@')[1], 253).toLowerCase(),
    provider: text(input.provider, 80).toLowerCase(),
    retired: input.retired === true
  };
}

function providerDimensions(raw = {}) {
  const dimensions = [];
  if (finiteInt(raw.availableMailboxSlots, null, 0) != null) dimensions.push('mailbox-count');
  if (finiteInt(raw.monthlyVolumeCap, null, 0) != null) dimensions.push('throughput');
  if (finiteInt(raw.maxMailboxesPerDomain, null, 1) != null) dimensions.push('domain-density');
  if (raw.supportsDedicatedIp !== undefined) dimensions.push('ip-reputation');
  if (raw.supportsWarmup !== undefined) dimensions.push('warmup');
  if (raw.supportsPlacementTelemetry !== undefined) dimensions.push('placement');
  if (raw.termsAllowed !== undefined) dimensions.push('terms');
  if (finiteMoney(raw.monthlyCostPerMailboxCents, null) != null) dimensions.push('billing');
  if (raw.supportsAutomatedDns !== undefined) dimensions.push('dns-automation');
  if (raw.supportsExport !== undefined) dimensions.push('export');
  return dimensions;
}

function normalizeProviderOffer(input = {}, now, policy) {
  const observedAt = text(input.observedAt, 80);
  const observedMs = parseTime(observedAt);
  const nowMs = now.getTime();
  const ageHours = observedMs == null ? Infinity : (nowMs - observedMs) / 3_600_000;
  const evidenceFresh = observedMs != null && ageHours >= -5 / 60 && ageHours <= policy.maxProviderEvidenceAgeHours;
  const availableMailboxSlots = finiteInt(input.availableMailboxSlots, null, 0, 10_000_000);
  const monthlyCostPerMailboxCents = finiteMoney(input.monthlyCostPerMailboxCents, null);
  const monthlyVolumeCap = finiteInt(input.monthlyVolumeCap, null, 0, 1_000_000_000);
  const maxMailboxesPerDomain = finiteInt(input.maxMailboxesPerDomain, null, 1, 100_000);
  return {
    provider: text(input.provider, 80).toLowerCase(),
    source: text(input.source || input.evidenceRef || input.sourceUrl, 700),
    observedAt,
    evidenceFresh,
    status: text(input.status || 'UNKNOWN', 80).toUpperCase(),
    termsAllowed: input.termsAllowed === true,
    apiProvisioning: input.apiProvisioning === true,
    claimsUnlimited: input.claimsUnlimited === true,
    availableMailboxSlots,
    monthlyCostPerMailboxCents,
    monthlyVolumeCap,
    maxMailboxesPerDomain,
    supportsAutomatedDns: input.supportsAutomatedDns === true,
    supportsWarmup: input.supportsWarmup === true,
    supportsDedicatedIp: input.supportsDedicatedIp === true,
    supportsPlacementTelemetry: input.supportsPlacementTelemetry === true,
    supportsExport: input.supportsExport === true,
    dimensions: providerDimensions(input)
  };
}

function providerCapabilityScore(provider) {
  return [
    provider.supportsWarmup,
    provider.supportsAutomatedDns,
    provider.supportsPlacementTelemetry,
    provider.supportsDedicatedIp,
    provider.supportsExport
  ].filter(Boolean).length;
}

function providerBlockers(provider, policy) {
  const blockers = [];
  if (!provider.provider) blockers.push('provider-identity-missing');
  if (!provider.source) blockers.push('provider-evidence-source-missing');
  if (!provider.evidenceFresh) blockers.push('provider-evidence-stale-or-undated');
  if (!READY_PROVIDER_STATES.has(provider.status)) blockers.push('provider-not-observed-ready');
  if (policy.requireProviderTermsApproval && !provider.termsAllowed) blockers.push('provider-terms-not-confirmed-compatible');
  if (policy.requireApiProvisioning && !provider.apiProvisioning) blockers.push('provider-api-provisioning-not-observed');
  if (provider.availableMailboxSlots == null) blockers.push(provider.claimsUnlimited ? 'unlimited-marketing-claim-is-not-numeric-capacity' : 'mailbox-slot-capacity-unknown');
  if (provider.monthlyCostPerMailboxCents == null) blockers.push('mailbox-unit-cost-unknown');
  return blockers;
}

function domainBlockers(domain) {
  const blockers = [];
  if (!domain.domainId) blockers.push('domain-id-missing');
  if (!OWNED_ROOT_DOMAINS.includes(domain.domain)) blockers.push('domain-not-in-canonical-owned-roots');
  if (domain.ownershipStatus !== 'OWNER_CONFIRMED') blockers.push('domain-ownership-not-confirmed');
  if (BLOCKED_DOMAIN_STATES.has(domain.state)) blockers.push(`domain-state-${domain.state.toLowerCase()}`);
  if (domain.purpose && !['outreach', 'outbound'].includes(domain.purpose)) blockers.push('domain-purpose-not-outreach');
  return blockers;
}

function batchAllocation(allocation, maxBatch) {
  const batches = [];
  let remaining = allocation.count;
  let index = 0;
  while (remaining > 0) {
    const count = Math.min(maxBatch, remaining);
    batches.push({
      batchId: `uberinbox:${allocation.provider}:${allocation.domain}:${index + 1}`,
      provider: allocation.provider,
      domainId: allocation.domainId,
      domain: allocation.domain,
      mailboxCount: count,
      estimatedMonthlyCostCents: count * allocation.unitCostCents,
      requiresExplicitOwnerApproval: true,
      requiresProviderReceipt: true,
      externalEffectAuthority: 'NONE'
    });
    remaining -= count;
    index += 1;
  }
  return batches;
}

/**
 * Convert provider observations into questions for UberBond's existing
 * unknown-unknown miner. Nothing emitted here is a finding.
 */
export function compileUberInboxUnknownUnknowns({ providerOffers = [], now = new Date(), policy = {} } = {}) {
  const cfg = normalizePolicy(policy);
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const providers = (Array.isArray(providerOffers) ? providerOffers : []).map(item => normalizeProviderOffer(item, at, cfg));
  const observations = [];
  const sourceCoverage = {};

  for (const provider of providers) {
    const source = provider.provider || provider.source || 'unknown-provider-source';
    sourceCoverage[source] = provider.dimensions;
    if (provider.claimsUnlimited && provider.monthlyVolumeCap != null) {
      observations.push({
        statement: `${source}: mailbox-count-is-marketed-as-unbounded-while-throughput-is-finite`,
        source,
        verdict: 'RESISTS_EXPLANATION',
        domain: 'mailbox-capacity-model'
      });
    }
    if (provider.claimsUnlimited && provider.availableMailboxSlots == null) {
      observations.push({
        statement: `${source}: unlimited-mailbox-language-has-no-observed-numeric-slot-ceiling`,
        source,
        verdict: 'RESISTS_EXPLANATION',
        domain: 'mailbox-capacity-model'
      });
    }
  }

  const discovery = mine({
    observations,
    expectations: [],
    observedDomains: [
      'mailbox-count', 'throughput', 'domain-density', 'ip-reputation', 'warmup',
      'placement', 'terms', 'billing', 'dns-automation', 'export'
    ],
    sourceCoverage
  });

  return {
    version: UBERINBOX_VERSION,
    discovery,
    ontologyCandidate: {
      status: 'HYPOTHESIS_ONLY',
      question: 'SHOULD_REPUTATION_ISOLATED_SENDING_CAPACITY_REPLACE_RAW_MAILBOX_COUNT_AS_THE_PRIMARY_CAPACITY_PRIMITIVE',
      rationale: 'Mailbox inventory can be numerically large while throughput, domain reputation, provider policy, warmup, placement or budget remains the binding constraint.',
      falsification: 'Reject this ontology candidate if observed operations show raw mailbox count predicts usable governed capacity better than reputation-isolated capacity after controlling for provider and domain constraints.'
    },
    externalEffectAuthority: 'NONE',
    providerCalls: 0,
    purchases: 0
  };
}

/**
 * Plan the largest *legitimately evidenced* mailbox inventory possible under
 * current owned-domain, provider-slot, terms and budget constraints.
 */
export function compileUberInboxPlan({
  domains = [],
  existingMailboxes = [],
  providerOffers = [],
  desiredAdditionalMailboxes = 0,
  monthlyBudgetCents = 0,
  policy = {},
  now = new Date()
} = {}) {
  const cfg = normalizePolicy(policy);
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const desired = finiteInt(desiredAdditionalMailboxes, 0, 0, 10_000_000);
  const budget = finiteMoney(monthlyBudgetCents, 0);
  const normalizedDomains = (Array.isArray(domains) ? domains : []).map(normalizeDomain);
  const normalizedMailboxes = (Array.isArray(existingMailboxes) ? existingMailboxes : []).map(normalizeMailbox).filter(item => !item.retired);
  const providers = (Array.isArray(providerOffers) ? providerOffers : []).map(item => normalizeProviderOffer(item, at, cfg));

  const rejectedDomains = [];
  const eligibleDomains = [];
  for (const domain of normalizedDomains) {
    const blockers = domainBlockers(domain);
    if (blockers.length) rejectedDomains.push({ domainId: domain.domainId || null, domain: domain.domain || null, blockers });
    else eligibleDomains.push(domain);
  }

  const rejectedProviders = [];
  const eligibleProviders = [];
  const unknownCapacityProviders = [];
  for (const provider of providers) {
    const blockers = providerBlockers(provider, cfg);
    if (provider.claimsUnlimited && provider.availableMailboxSlots == null) {
      unknownCapacityProviders.push({
        provider: provider.provider || null,
        source: provider.source || null,
        reason: 'Unlimited wording is not a measured slot ceiling; numeric capacity remains UNKNOWN.'
      });
    }
    if (blockers.length) rejectedProviders.push({ provider: provider.provider || null, blockers });
    else eligibleProviders.push(provider);
  }

  eligibleProviders.sort((a, b) => {
    const costDelta = a.monthlyCostPerMailboxCents - b.monthlyCostPerMailboxCents;
    if (costDelta) return costDelta;
    const capabilityDelta = providerCapabilityScore(b) - providerCapabilityScore(a);
    if (capabilityDelta) return capabilityDelta;
    return a.provider.localeCompare(b.provider);
  });

  const existingByDomain = new Map();
  const existingProvidersByDomain = new Map();
  for (const mailbox of normalizedMailboxes) {
    existingByDomain.set(mailbox.domain, (existingByDomain.get(mailbox.domain) || 0) + 1);
    if (mailbox.provider) {
      if (!existingProvidersByDomain.has(mailbox.domain)) existingProvidersByDomain.set(mailbox.domain, new Set());
      existingProvidersByDomain.get(mailbox.domain).add(mailbox.provider);
    }
  }

  const providerRemaining = new Map(eligibleProviders.map(provider => [provider.provider, provider.availableMailboxSlots]));
  let remainingDesired = desired;
  let remainingBudget = budget;
  const allocations = [];

  for (const domain of eligibleDomains) {
    if (remainingDesired <= 0) break;
    const existingCount = existingByDomain.get(domain.domain) || 0;
    const incumbentProviders = [...(existingProvidersByDomain.get(domain.domain) || new Set())];

    let candidates = eligibleProviders;
    if (cfg.oneProviderPerDomain && incumbentProviders.length) {
      candidates = eligibleProviders.filter(provider => incumbentProviders.includes(provider.provider));
    }

    for (const provider of candidates) {
      if (remainingDesired <= 0) break;
      const providerSlots = providerRemaining.get(provider.provider) || 0;
      if (providerSlots <= 0) continue;

      const providerDomainCap = provider.maxMailboxesPerDomain == null
        ? cfg.maxMailboxesPerDomain
        : Math.min(cfg.maxMailboxesPerDomain, provider.maxMailboxesPerDomain);
      const domainSlots = Math.max(0, providerDomainCap - existingCount - allocations.filter(row => row.domain === domain.domain).reduce((sum, row) => sum + row.count, 0));
      if (domainSlots <= 0) continue;

      const unitCost = provider.monthlyCostPerMailboxCents;
      const budgetSlots = unitCost === 0 ? remainingDesired : Math.floor(remainingBudget / unitCost);
      const count = Math.min(remainingDesired, providerSlots, domainSlots, budgetSlots);
      if (count <= 0) continue;

      allocations.push({
        provider: provider.provider,
        source: provider.source,
        domainId: domain.domainId,
        domain: domain.domain,
        count,
        unitCostCents: unitCost,
        estimatedMonthlyCostCents: count * unitCost,
        providerObservedSlotCeiling: provider.availableMailboxSlots,
        providerObservedMonthlyVolumeCap: provider.monthlyVolumeCap,
        requiresDnsVerification: true,
        requiresAuthentication: true,
        requiresWarmup: true,
        requiresPlacementAndHealthEvidence: true,
        createsSendAuthority: false
      });

      providerRemaining.set(provider.provider, providerSlots - count);
      remainingDesired -= count;
      remainingBudget -= count * unitCost;

      if (cfg.oneProviderPerDomain) break;
    }
  }

  const batches = allocations.flatMap(allocation => batchAllocation(allocation, cfg.maxProvisioningBatch));
  const plannedAdditionalMailboxes = allocations.reduce((sum, row) => sum + row.count, 0);
  const estimatedMonthlyCostCents = allocations.reduce((sum, row) => sum + row.estimatedMonthlyCostCents, 0);
  const knownCapacityCeiling = eligibleDomains.reduce((sum, domain) => {
    const existing = existingByDomain.get(domain.domain) || 0;
    return sum + Math.max(0, cfg.maxMailboxesPerDomain - existing);
  }, 0);

  const blockers = [];
  if (!eligibleDomains.length) blockers.push('no-owner-confirmed-eligible-domain');
  if (!eligibleProviders.length) blockers.push('no-fresh-terms-compatible-provider-with-numeric-capacity');
  if (desired > 0 && plannedAdditionalMailboxes === 0 && budget === 0) blockers.push('monthly-budget-zero');
  if (remainingDesired > 0 && plannedAdditionalMailboxes > 0) blockers.push('requested-capacity-exceeds-current-evidenced-envelope');

  const discovery = compileUberInboxUnknownUnknowns({ providerOffers, now: at, policy: cfg });

  return {
    version: UBERINBOX_VERSION,
    generatedAt: at.toISOString(),
    state: desired === 0 ? 'NO_CAPACITY_REQUESTED' : plannedAdditionalMailboxes > 0 ? 'CAPACITY_PLAN_READY_FOR_SEPARATE_OWNER_AUTHORIZATION' : 'CAPACITY_PLAN_BLOCKED',
    desiredAdditionalMailboxes: desired,
    plannedAdditionalMailboxes,
    remainingDesiredMailboxes: remainingDesired,
    currentKnownMailboxCount: normalizedMailboxes.length,
    knownDomainPolicyHeadroom: knownCapacityCeiling,
    estimatedMonthlyCostCents,
    remainingMonthlyBudgetCents: remainingBudget,
    allocations,
    batches,
    rejectedDomains,
    rejectedProviders,
    unknownCapacityProviders,
    blockers: [...new Set(blockers)],
    discovery,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    providerCalls: 0,
    purchases: 0,
    mailboxesProvisioned: 0,
    dnsChanges: 0,
    messagesSent: 0,
    truthBoundary: 'This is a capacity plan from supplied evidence. It does not prove provider acceptance, mailbox creation, deliverability, warmup, reputation, or permission to send. Provider limits and terms must not be bypassed.'
  };
}
