import crypto from 'node:crypto';
import { normalizeDomain } from './utils.mjs';
import { contactEligibility } from './send-safety.mjs';
import { assertCanonicalReasonCode, canonicalizeContactReason } from './policy-reason-codes.mjs';

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
  if (!contactResult.ok) reasonCodes.push(canonicalizeContactReason(contactResult.reason));

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

  // Every reason code this function can emit must be in the canonical registry -- a code that
  // isn't (a typo, or a future addition someone forgot to register) fails loudly here rather than
  // silently reaching a stored policy decision, a report, or the dashboard (PR #6 audit item 4).
  const finalReasonCodes = [...new Set(reasonCodes)].map(assertCanonicalReasonCode);

  return {
    ok: finalReasonCodes.length === 0,
    decision: finalReasonCodes.length === 0 ? 'pass' : 'reject',
    reasonCodes: finalReasonCodes,
    evidenceIds: [...new Set(evidenceIds)],
    policyVersion: REVENUE_OS_POLICY_VERSION,
    evaluatedAt: evaluatedAt.toISOString()
  };
}

// PR #6 audit item 8: owner gates were structurally unsafe -- gateType came from a reused field,
// gates were never linked to an opportunity, and nothing enforced the value/time bounds an owner
// gate is supposed to guarantee before it can interrupt a human. This constructor now enforces
// every one of those bounds itself, so "an out-of-policy gate exists" is impossible to construct,
// not just discouraged by caller convention.
export const OWNER_GATE_MIN_EXPECTED_VALUE_CENTS = 25000; // USD 250 (currency-blind threshold --
// see docs: this compares raw cents regardless of the gate's own currency field, the same
// currency-blind approximation revenue-os.mjs's policy defaults already use elsewhere).
export const OWNER_GATE_MAX_OWNER_MINUTES = 20;

export class OwnerGatePolicyError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'OwnerGatePolicyError';
    this.code = code;
  }
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
  killCondition = '',
  now = new Date()
} = {}) {
  const fail = (code, message) => { throw new OwnerGatePolicyError(code, message); };
  if (!OWNER_GATE_TYPES.includes(gateType)) fail('unsupported-gate-type', `Unsupported owner gate type: ${gateType}`);
  if (!String(opportunityId || '').trim()) fail('opportunity-link-required', 'Owner gates must be linked to an existing opportunityId');
  if (!String(action || '').trim()) fail('action-required', 'Owner gate action is required');

  // PR #6 second-pass audit item 6: raw cents from an arbitrary currency must never be compared
  // against a USD-cents threshold -- 500 JPY and 500 USD are not the same 500. This version has no
  // FX-conversion source, so the safe choice offered by the audit is taken: only USD is accepted
  // for an owner gate at all. A gate in any other currency is rejected outright, not silently
  // evaluated against a threshold that would misprice it.
  const normalizedCurrency = String(currency || 'USD').trim().toUpperCase();
  if (normalizedCurrency !== 'USD') {
    fail('currency-not-usd', `Owner gates currently support USD only (got: ${normalizedCurrency}) -- no FX-conversion source exists in this version`);
  }

  const value = Math.round(Math.max(0, Number(expectedValueCents) || 0));
  if (value < OWNER_GATE_MIN_EXPECTED_VALUE_CENTS) {
    fail('value-below-floor', `Owner gate expectedValueCents (${value}) is below the ${OWNER_GATE_MIN_EXPECTED_VALUE_CENTS}-cent floor`);
  }

  const minutesNumber = Number(ownerMinutes);
  if (!Number.isFinite(minutesNumber) || minutesNumber < 0) fail('owner-minutes-invalid', 'Owner gate ownerMinutes must be a non-negative number');
  if (minutesNumber > OWNER_GATE_MAX_OWNER_MINUTES) {
    fail('owner-minutes-above-ceiling', `Owner gate ownerMinutes (${minutesNumber}) exceeds the ${OWNER_GATE_MAX_OWNER_MINUTES}-minute ceiling`);
  }

  const expiresIso = iso(expiresAt);
  const at = now instanceof Date ? now : new Date(now);
  if (!expiresAt || !expiresIso) fail('expiry-required', 'Owner gate expiresAt is required');
  else if (new Date(expiresIso) <= at) fail('expiry-not-future', `Owner gate expiresAt (${expiresIso}) must be in the future`);

  return {
    id: id || `gate_${crypto.randomUUID()}`,
    opportunityId: String(opportunityId).trim(),
    gateType,
    status: 'open',
    expectedValueCents: value,
    currency: normalizedCurrency,
    ownerMinutes: Math.round(minutesNumber),
    expiresAt: expiresIso,
    action: String(action).trim(),
    evidenceRequired: Array.isArray(evidenceRequired) ? evidenceRequired.map(String) : [],
    risk: String(risk || '').trim(),
    killCondition: String(killCondition || '').trim(),
    createdAt: new Date().toISOString()
  };
}

// PR #6 audit item 1: the old readiness gates converted a MISSING metric to 0/false via `|| 0`,
// which meant no evidence at all (never measured, not zero) silently passed several gates. Every
// gate below returns 'pass' | 'fail' | 'unknown' -- 'unknown' happens whenever evidence is absent,
// non-finite, or (for rate gates) below its required minimum sample size, and 'unknown' never
// counts toward `ready`. Missing evidence fails closed by construction, not by convention.
//
// Second-pass audit item 3 ("restore the exact original 17 readiness requirements... do not
// replace them with unrelated technical gates"): disclosed here rather than silently guessed --
// no document available to this repair (00_PR6_ADVERSARIAL_AUDIT.md, 06_ACCEPTANCE_TEST_MATRIX.md,
// or any other provided source) enumerates 17 gate names, so "the exact original 17" cannot be
// verified against a ground truth. What IS verifiable: the true original tenOfTenReadiness (before
// any PR #6 repair touched it) had 14 gates -- deterministicChecks, browserChecks,
// migrationChecks, dryRunAuditable, duplicateRate, hardBounceRate, complaintRate,
// evidenceCoverage, positiveReplyRate, paidPilots, collectedRevenue,
// positiveContributionMargin, recurringClients, ownerActionsPerDay -- and the first PR #6 repair
// pass wrongly grew that to 17 by REPLACING three business-facing slots with unrelated technical
// ones (importAtomicity, concurrencySafety, auditCompleteness). This pass restores all 14 original
// gates unchanged, adds the five gates this audit explicitly names as missing (revenueAttribution,
// acceptedPaidDelivery, suppressionTesting, killSwitchTesting, incidentRecovery) as CORE gates --
// 19 core gates total, not 17, because 14 kept + 5 added cannot equal 17 without silently dropping
// something real -- and keeps importAtomicity/concurrencySafety/auditCompleteness as clearly
// separate ADDITIONAL technical gates (`coreGateNames` vs `additionalGateNames` below), per "technical
// gates may remain as additional gates." `ready` still requires every gate, core and additional
// alike, to pass -- readiness should not ignore evidence that atomicity/concurrency/audit-
// completeness are unverified.
//
// Every gate now also requires a full evidence-provenance record -- evidenceRef, source,
// measurementWindow, timestamp -- alongside its value(s); missing any part of that provenance is
// 'unknown', identical in effect to missing the value itself.

function gateProvenance(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  const { evidenceRef, source, measurementWindow, timestamp } = evidence;
  if (!evidenceRef || !source || !measurementWindow || !timestamp) return null;
  return { evidenceRef: String(evidenceRef), source: String(source), measurementWindow: String(measurementWindow), timestamp: String(timestamp) };
}

function booleanGate(evidence) {
  const provenance = gateProvenance(evidence);
  if (!provenance || (evidence.value !== true && evidence.value !== false)) return { status: 'unknown', reason: 'missing-evidence', ...(provenance || {}) };
  return { status: evidence.value ? 'pass' : 'fail', reason: evidence.value ? '' : 'evidence-false', ...provenance };
}

const COMPARATORS = {
  lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b
};

/** A rate gate requires an explicit {numerator, denominator, ...provenance} evidence object and a
 * minimum sample size on the denominator -- a rate computed from too few observations is
 * 'unknown', not a false pass or fail, so a handful of lucky/unlucky early events can never move
 * readiness. */
function rateGate(evidence, { threshold, comparator, minimumSample }) {
  const provenance = gateProvenance(evidence);
  if (!provenance) return { status: 'unknown', reason: 'missing-evidence' };
  const numerator = Number(evidence.numerator);
  const denominator = Number(evidence.denominator);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return { status: 'unknown', reason: 'missing-numerator-or-denominator', ...provenance };
  }
  if (denominator < minimumSample) return { status: 'unknown', reason: 'insufficient-sample', denominator, minimumSample, ...provenance };
  const rate = numerator / denominator;
  const pass = COMPARATORS[comparator](rate, threshold);
  return { status: pass ? 'pass' : 'fail', rate: Number(rate.toFixed(4)), numerator, denominator, minimumSample, threshold, ...provenance };
}

function countGate(evidence, { threshold, comparator = 'gte' }) {
  const provenance = gateProvenance(evidence);
  if (!provenance) return { status: 'unknown', reason: 'missing-evidence' };
  const value = Number(evidence.value);
  if (evidence.value === undefined || evidence.value === null || !Number.isFinite(value)) return { status: 'unknown', reason: 'missing-evidence', ...provenance };
  const pass = COMPARATORS[comparator](value, threshold);
  return { status: pass ? 'pass' : 'fail', value, threshold, ...provenance };
}

const CORE_GATE_NAMES = Object.freeze([
  'deterministicChecks', 'browserChecks', 'migrationChecks', 'previewAuditable',
  'duplicateRate', 'hardBounceRate', 'complaintRate', 'evidenceCoverage', 'positiveReplyRate',
  'paidPilots', 'collectedRevenue', 'positiveContributionMargin', 'recurringClients', 'ownerActionsPerDay',
  'revenueAttribution', 'acceptedPaidDelivery', 'suppressionTesting', 'killSwitchTesting', 'incidentRecovery'
]);
const ADDITIONAL_GATE_NAMES = Object.freeze(['importAtomicity', 'concurrencySafety', 'auditCompleteness']);

/**
 * `metrics` shape -- every entry is `{ ...value fields, evidenceRef, source, measurementWindow,
 * timestamp }`; a bare boolean/number is no longer accepted (missing provenance is 'unknown'):
 *   deterministicChecks / browserChecks / migrationChecks / previewAuditable / importAtomicity /
 *     concurrencySafety / auditCompleteness / suppressionTesting / killSwitchTesting /
 *     incidentRecovery: `{ value: boolean, ...provenance }`
 *   duplicates / hardBounces / complaints / evidenceCoverage / positiveReplies / revenueAttribution
 *     / acceptedPaidDelivery: `{ numerator, denominator, ...provenance }`
 *   paidPilots / collectedRevenueCents / contributionMarginCents / recurringClients /
 *     ownerActionsPerDay: `{ value: number, ...provenance }`
 * `ready` is true only when every gate (core and additional) is 'pass'.
 */
export function tenOfTenReadiness(metrics = {}) {
  const gates = {
    deterministicChecks: booleanGate(metrics.deterministicChecks),
    browserChecks: booleanGate(metrics.browserChecks),
    migrationChecks: booleanGate(metrics.migrationChecks),
    previewAuditable: booleanGate(metrics.previewAuditable),
    duplicateRate: rateGate(metrics.duplicates, { threshold: 0, comparator: 'lte', minimumSample: 20 }),
    hardBounceRate: rateGate(metrics.hardBounces, { threshold: 0.02, comparator: 'lt', minimumSample: 50 }),
    complaintRate: rateGate(metrics.complaints, { threshold: 0.001, comparator: 'lt', minimumSample: 50 }),
    evidenceCoverage: rateGate(metrics.evidenceCoverage, { threshold: 0.98, comparator: 'gte', minimumSample: 20 }),
    positiveReplyRate: rateGate(metrics.positiveReplies, { threshold: 0.03, comparator: 'gte', minimumSample: 50 }),
    paidPilots: countGate(metrics.paidPilots, { threshold: 3, comparator: 'gte' }),
    collectedRevenue: countGate(metrics.collectedRevenueCents, { threshold: 100000, comparator: 'gte' }),
    positiveContributionMargin: countGate(metrics.contributionMarginCents, { threshold: 0, comparator: 'gt' }),
    recurringClients: countGate(metrics.recurringClients, { threshold: 1, comparator: 'gte' }),
    ownerActionsPerDay: countGate(metrics.ownerActionsPerDay, { threshold: 3, comparator: 'lte' }),
    // Newly restored, explicitly named by the second-pass audit:
    revenueAttribution: rateGate(metrics.revenueAttribution, { threshold: 1, comparator: 'gte', minimumSample: 1 }),
    acceptedPaidDelivery: rateGate(metrics.acceptedPaidDelivery, { threshold: 1, comparator: 'gte', minimumSample: 1 }),
    suppressionTesting: booleanGate(metrics.suppressionTesting),
    killSwitchTesting: booleanGate(metrics.killSwitchTesting),
    incidentRecovery: booleanGate(metrics.incidentRecovery),
    // Additional technical gates (not part of the 19-gate core commercial set) -- may remain, per
    // the audit, but are not a substitute for any of the gates above.
    importAtomicity: booleanGate(metrics.importAtomicity),
    concurrencySafety: booleanGate(metrics.concurrencySafety),
    auditCompleteness: booleanGate(metrics.auditCompleteness)
  };
  const total = Object.keys(gates).length;
  const passed = Object.values(gates).filter(gate => gate.status === 'pass').length;
  const unknown = Object.values(gates).filter(gate => gate.status === 'unknown').length;
  return {
    score: Number(((passed / total) * 10).toFixed(2)),
    passed,
    unknown,
    total,
    coreGateCount: CORE_GATE_NAMES.length,
    additionalGateCount: ADDITIONAL_GATE_NAMES.length,
    gates,
    ready: passed === total
  };
}
