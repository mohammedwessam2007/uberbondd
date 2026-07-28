import crypto from 'node:crypto';
import { normalizeDomain } from './utils.mjs';
import { contactEligibility } from './send-safety.mjs';

export const REVENUE_OS_POLICY_VERSION = 'revenue-os-policy-v1';
export const REVENUE_OS_SCORE_VERSION = 'revenue-os-score-v1';

export const SUPPORTED_SERVICE_LANES = Object.freeze([
  'website-qa',
  'cro-diagnostic',
  'forms-booking',
  'mobile-ux',
  'copy-messaging',
  'arabic-localization-qa',
  'medical-communication',
  'public-seo-performance',
  'accessibility-observations',
  'research-presentations',
  'ai-workflow',
  'no-code-planning',
  'white-label-qa',
  'monitoring',
  'implementation-scoping'
]);

export const OWNER_GATE_TYPES = Object.freeze([
  'marketplace-submission',
  'account-creation',
  'terms-acceptance',
  'contract',
  'invoice',
  'payment-instructions',
  'credentials',
  'private-access',
  'production-change',
  'spend',
  'capacity-exception'
]);

const SCORE_WEIGHTS = Object.freeze({
  activeDemand: 16,
  abilityToPay: 12,
  capabilityFit: 14,
  evidenceConfidence: 12,
  timeToCash: 10,
  grossProfit: 12,
  ownerEfficiency: 8,
  deliveryEase: 6,
  recurringPotential: 5,
  strategicLeverage: 5
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSuppression(value = '') {
  return String(value || '').trim().toLowerCase();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function opportunityIdempotencyKey({
  organizationDomain = '',
  serviceLane = '',
  sourceUrl = '',
  signalKey = ''
} = {}) {
  const domain = normalizeDomain(organizationDomain);
  const lane = String(serviceLane || '').trim().toLowerCase();
  const source = String(sourceUrl || '').trim();
  const signal = String(signalKey || '').trim().toLowerCase();
  if (!domain || !lane || (!source && !signal)) {
    throw new Error('organizationDomain, serviceLane, and sourceUrl or signalKey are required');
  }
  return `opportunity:${domain}:${lane}:${sha256(`${source}|${signal}`).slice(0, 24)}`;
}

export function scoreOpportunity(dimensions = {}, weights = SCORE_WEIGHTS) {
  const components = {};
  let total = 0;
  let totalWeight = 0;

  for (const [name, weightValue] of Object.entries(weights)) {
    const weight = clamp(weightValue, 0, 100);
    const value = clamp(dimensions[name], 0, 10);
    const contribution = (value / 10) * weight;
    components[name] = {
      value: Number(value.toFixed(2)),
      weight: Number(weight.toFixed(2)),
      contribution: Number(contribution.toFixed(2))
    };
    total += contribution;
    totalWeight += weight;
  }

  const normalized = totalWeight > 0 ? (total / totalWeight) * 100 : 0;
  return {
    version: REVENUE_OS_SCORE_VERSION,
    total: Number(clamp(normalized, 0, 100).toFixed(2)),
    components
  };
}

export function assignExperimentVariant(subjectKey, variants = []) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('At least one experiment variant is required');
  }
  const digest = crypto.createHash('sha256').update(String(subjectKey || '')).digest();
  const integer = digest.readUInt32BE(0);
  return variants[integer % variants.length];
}

export function evaluateOpportunityPolicy({
  opportunity = {},
  prospect = {},
  evidence = [],
  suppressions = [],
  cfg = {},
  date = new Date()
} = {}) {
  const reasonCodes = [];
  const evidenceIds = [];
  const now = date instanceof Date ? date : new Date(date);
  const evaluatedAt = Number.isNaN(now.getTime()) ? new Date() : now;
  const policy = cfg.revenueOs || {};
  const maximumEvidenceAgeDays = Math.max(1, Number(policy.maxEvidenceAgeDays || 30));
  const minimumExpectedValueCents = Math.max(0, Number(policy.minExpectedValueCents || 10000));
  const maximumOwnerMinutes = Math.max(1, Number(policy.maxOwnerMinutes || 20));

  const serviceLane = String(opportunity.serviceLane || '').trim().toLowerCase();
  if (!SUPPORTED_SERVICE_LANES.includes(serviceLane)) reasonCodes.push('unsupported-service-lane');

  const expectedValueCents = Number(opportunity.expectedValueCents || 0);
  if (!Number.isFinite(expectedValueCents) || expectedValueCents < minimumExpectedValueCents) {
    reasonCodes.push('expected-value-below-threshold');
  }

  const ownerMinutes = Number(opportunity.ownerMinutes || 0);
  if (!Number.isFinite(ownerMinutes) || ownerMinutes < 0 || ownerMinutes > maximumOwnerMinutes) {
    reasonCodes.push('owner-minutes-above-threshold');
  }

  if (opportunity.expiresAt) {
    const expiresAt = new Date(opportunity.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= evaluatedAt) reasonCodes.push('opportunity-expired');
  }

  const list = Array.isArray(evidence) ? evidence : [];
  let currentOfficialEvidence = false;
  for (const item of list) {
    if (item?.id) evidenceIds.push(String(item.id));
    const sourceUrl = String(item?.sourceUrl || '').trim();
    const capturedAt = new Date(item?.capturedAt || 0);
    const expiresAt = item?.expiresAt ? new Date(item.expiresAt) : null;
    const ageMs = evaluatedAt.getTime() - capturedAt.getTime();
    const freshByAge = !Number.isNaN(capturedAt.getTime())
      && ageMs >= 0
      && ageMs <= maximumEvidenceAgeDays * 86400000;
    const freshByExpiry = !expiresAt || (!Number.isNaN(expiresAt.getTime()) && expiresAt > evaluatedAt);
    const official = item?.official === true
      || ['official-company', 'official-provider', 'official-procurement', 'official-partner'].includes(String(item?.sourceType || ''));
    const active = !['rejected', 'expired', 'revoked'].includes(String(item?.status || 'active'));
    if (sourceUrl.startsWith('https://') && freshByAge && freshByExpiry && official && active) {
      currentOfficialEvidence = true;
    }
  }
  if (!currentOfficialEvidence) reasonCodes.push('missing-current-official-evidence');

  const contactResult = contactEligibility(prospect.contact || {}, prospect);
  if (!contactResult.ok) reasonCodes.push(`contact-${contactResult.reason}`);

  const recipientEmail = normalizeSuppression(prospect.contact?.email);
  const domain = normalizeDomain(prospect.website || prospect.domain || '');
  const suppressionSet = new Set((Array.isArray(suppressions) ? suppressions : [])
    .map(item => normalizeSuppression(item?.value ?? item))
    .filter(Boolean));
  if (recipientEmail && suppressionSet.has(recipientEmail)) reasonCodes.push('recipient-suppressed');
  if (domain && suppressionSet.has(domain)) reasonCodes.push('domain-suppressed');

  const terminalStatus = String(prospect.status || '').trim().toLowerCase();
  if (['lost', 'rejected', 'opted-out', 'complaint', 'hard-bounce', 'wrong-recipient'].includes(terminalStatus)) {
    reasonCodes.push('prospect-terminal-status');
  }

  return {
    ok: reasonCodes.length === 0,
    decision: reasonCodes.length === 0 ? 'pass' : 'reject',
    reasonCodes: [...new Set(reasonCodes)],
    evidenceIds: [...new Set(evidenceIds)],
    policyVersion: REVENUE_OS_POLICY_VERSION,
    evaluatedAt: evaluatedAt.toISOString()
  };
}

export function buildOwnerGate({
  id,
  opportunityId,
  gateType,
  expectedValueCents = 0,
  currency = 'USD',
  ownerMinutes = 0,
  expiresAt = null,
  action,
  evidenceRequired = [],
  risk = '',
  killCondition = ''
} = {}) {
  if (!OWNER_GATE_TYPES.includes(gateType)) throw new Error(`Unsupported owner gate type: ${gateType}`);
  if (!String(action || '').trim()) throw new Error('Owner gate action is required');
  const minutes = clamp(ownerMinutes, 0, 1440);
  return {
    id: id || `gate_${crypto.randomUUID()}`,
    opportunityId: opportunityId || null,
    gateType,
    status: 'open',
    expectedValueCents: Math.round(Math.max(0, Number(expectedValueCents) || 0)),
    currency: String(currency || 'USD').trim().toUpperCase(),
    ownerMinutes: Math.round(minutes),
    expiresAt: expiresAt ? iso(expiresAt) : null,
    action: String(action).trim(),
    evidenceRequired: Array.isArray(evidenceRequired) ? evidenceRequired.map(String) : [],
    risk: String(risk || '').trim(),
    killCondition: String(killCondition || '').trim(),
    createdAt: new Date().toISOString()
  };
}

export function tenOfTenReadiness(metrics = {}) {
  const gates = {
    deterministicChecks: Boolean(metrics.deterministicChecks),
    browserChecks: Boolean(metrics.browserChecks),
    migrationChecks: Boolean(metrics.migrationChecks),
    dryRunAuditable: Boolean(metrics.dryRunAuditable),
    duplicateRate: Number(metrics.duplicateRate || 0) === 0,
    hardBounceRate: Number(metrics.hardBounceRate || 0) < 0.02,
    complaintRate: Number(metrics.complaintRate || 0) < 0.001,
    evidenceCoverage: Number(metrics.evidenceCoverage || 0) >= 0.98,
    positiveReplyRate: Number(metrics.positiveReplyRate || 0) >= 0.03,
    paidPilots: Number(metrics.paidPilots || 0) >= 3,
    collectedRevenue: Number(metrics.collectedRevenue || 0) >= 1000,
    positiveContributionMargin: Number(metrics.contributionMargin || 0) > 0,
    recurringClients: Number(metrics.recurringClients || 0) >= 1,
    ownerActionsPerDay: Number(metrics.ownerActionsPerDay || Infinity) <= 3
  };
  const passed = Object.values(gates).filter(Boolean).length;
  const total = Object.keys(gates).length;
  return {
    score: Number(((passed / total) * 10).toFixed(2)),
    passed,
    total,
    gates,
    ready: passed === total
  };
}
