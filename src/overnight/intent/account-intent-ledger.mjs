// Deterministic, plan-only account intent ledger.
//
// This module deliberately composes with the existing MarketSignal kernel
// instead of inventing a second signal/evidence vocabulary. It normalizes
// observations, preserves provenance and digests rather than raw payloads,
// applies freshness decay, exposes contradictions, and keeps suppression
// state authoritative. It performs no I/O and grants no business authority.
import { sha256 } from '../../omnia-v9/canonical.mjs';
import {
  MARKET_SIGNAL_SCHEMA_VERSION,
  SIGNAL_EVIDENCE_CLASSES,
  VERIFICATION_STATES,
  normalizeMarketSignal
} from '../../market-signal.mjs';
import {
  canonicalContactRoute,
  evaluateContactRoute
} from '../../prospect-evidence-reconciliation.mjs';

export const ACCOUNT_INTENT_LEDGER_VERSION = 'uberbond.overnight.account-intent-ledger.v1';

export const ACCOUNT_INTENT_STATES = Object.freeze([
  'UNRESOLVED',
  'LOW_SIGNAL',
  'QUALIFIED_INTENT',
  'REVIEW_REQUIRED',
  'CONTRADICTED',
  'STALE',
  'SUPPRESSED'
]);

// Half-lives are policy defaults, not claims about any provider or market.
// Callers may override a signal type explicitly for a bounded experiment.
export const SIGNAL_DECAY_HALF_LIFE_MS = Object.freeze({
  NEW_LISTING: 7 * 24 * 60 * 60 * 1000,
  PRICE_CHANGE: 30 * 24 * 60 * 60 * 1000,
  FEATURE_CHANGE: 30 * 24 * 60 * 60 * 1000,
  HIRING_CHANGE: 14 * 24 * 60 * 60 * 1000,
  CONTENT_CHANGE: 14 * 24 * 60 * 60 * 1000,
  AVAILABILITY_CHANGE: 7 * 24 * 60 * 60 * 1000,
  SENTIMENT_OBSERVATION: 7 * 24 * 60 * 60 * 1000,
  STRUCTURAL_OBSERVATION: 30 * 24 * 60 * 60 * 1000
});

const EVIDENCE_WEIGHT = Object.freeze({
  SYNTHETIC_TEST_FIXTURE: 0,
  UNRESOLVED: 0,
  HYPOTHESIS: 0.1,
  ESTIMATE: 0.2,
  INFERENCE: 0.25,
  CREATOR_CLAIM: 0.3,
  OPERATOR_CLAIM: 0.35,
  COMPANY_CLAIM: 0.5,
  BUYER_SIGNAL: 0.8,
  VERIFIED_FACT: 1
});

const VERIFICATION_WEIGHT = Object.freeze({
  UNVERIFIED: 0.25,
  SOURCE_REACHABLE: 0.5,
  CONTENT_MATCHED: 0.85,
  CONTRADICTED: 0
});

const SOURCE_WEIGHT = Object.freeze({
  INTERNAL: 0.45,
  SOCIAL_POST: 0.4,
  RSS: 0.5,
  REVIEW_SITE: 0.55,
  AD_LIBRARY: 0.55,
  WEB_PAGE: 0.65,
  JOB_BOARD: 0.7,
  CHANGELOG: 0.75,
  REPOSITORY: 0.75,
  PRICING_PAGE: 0.8,
  PROCUREMENT: 0.9
});

const SIGNAL_TYPE_WEIGHT = Object.freeze({
  NEW_LISTING: 0.95,
  PRICE_CHANGE: 0.75,
  FEATURE_CHANGE: 0.65,
  HIRING_CHANGE: 0.8,
  CONTENT_CHANGE: 0.45,
  AVAILABILITY_CHANGE: 0.75,
  SENTIMENT_OBSERVATION: 0.5,
  STRUCTURAL_OBSERVATION: 0.6
});

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_MS = 90 * DAY_MS;
const MAX_RECORDS = 1000;

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function clamp(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function finiteInteger(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function referenceDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || '');
  if (!Number.isFinite(date.getTime())) throw new Error('account intent ledger requires a valid reference date');
  return date;
}

function uniqueStrings(values, max = 100) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(item => text(item, 240))
    .filter(Boolean))].slice(0, max);
}

function evidenceWeight(value) {
  return EVIDENCE_WEIGHT[value] ?? 0;
}

function verificationWeight(value) {
  return VERIFICATION_WEIGHT[value] ?? 0;
}

function sourceWeight(value) {
  return SOURCE_WEIGHT[value] ?? 0;
}

function decay(ageMs, halfLifeMs) {
  if (!Number.isFinite(ageMs) || !Number.isFinite(halfLifeMs) || halfLifeMs <= 0) return 0;
  return Math.pow(0.5, Math.max(0, ageMs) / halfLifeMs);
}

function contradictionKey(signal) {
  return sha256({
    sourceKind: signal.sourceKind,
    entityType: signal.entityType,
    entityIdentity: signal.entityIdentity,
    signalType: signal.signalType,
    observedAt: signal.observedAt
  });
}

function accountSuppressionMatches(accountId, item) {
  const value = text(item?.accountId || item?.value || item?.id, 240);
  if (!value) return false;
  const scope = text(item?.scope || item?.kind, 40).toLowerCase();
  if (scope && !['account', 'organization', 'company'].includes(scope)) return false;
  return value === accountId;
}

function normalizeLedgerSignal(raw, { accountId, now }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'malformed-signal' };
  }
  if (raw.ok === false) return { ok: false, reason: 'failed-market-signal-normalization' };
  const claimedAccountId = text(raw.accountId || raw.account || '', 240);
  if (claimedAccountId && claimedAccountId !== accountId) {
    return { ok: false, reason: 'signal-account-mismatch' };
  }

  const normalized = normalizeMarketSignal({ ...raw }, { date: now });
  if (!normalized.ok) return { ok: false, reason: normalized.reason };
  return { ok: true, signal: normalized };
}

function compactContactDecision(decision) {
  return {
    status: decision.status,
    usableForHandoff: decision.usableForHandoff === true,
    reasonCodes: uniqueStrings(decision.reasonCodes, 12),
    suppressionCount: finiteInteger(decision.suppressionCount, 0, 0, MAX_RECORDS),
    businessEffectAuthority: 'NONE',
    externalEffects: 0
  };
}

function normalizeContactDecisions({ contactRoutes, suppressions, now }) {
  const routes = Array.isArray(contactRoutes) ? contactRoutes.slice(0, MAX_RECORDS) : [];
  return routes.map(item => {
    const route = typeof item === 'string' ? item : item?.route || item?.email;
    const verifications = typeof item === 'string' ? [] : item?.verifications || [];
    try {
      const decision = evaluateContactRoute({ route, verifications, suppressions, now });
      return {
        routeDigest: sha256(canonicalContactRoute(route)),
        ...compactContactDecision(decision)
      };
    } catch {
      return {
        routeDigest: sha256(text(route, 320).toLowerCase()),
        status: 'REVIEW_INVALID_ROUTE',
        usableForHandoff: false,
        reasonCodes: ['invalid-contact-route'],
        suppressionCount: 0,
        businessEffectAuthority: 'NONE',
        externalEffects: 0
      };
    }
  });
}

function effectiveSignalRecord(signal, { nowMs, maxAgeMs, halfLifeMs, contradicted }) {
  const observedMs = Date.parse(signal.observedAt);
  const ageMs = Number.isFinite(observedMs) ? Math.max(0, nowMs - observedMs) : Number.POSITIVE_INFINITY;
  const freshnessDecay = decay(ageMs, halfLifeMs);
  const stale = ageMs > maxAgeMs;
  const synthetic = signal.evidenceClass === 'SYNTHETIC_TEST_FIXTURE'
    || signal.provenance === 'SYNTHETIC_TEST_FIXTURE';
  const confidenceKnown = Number.isFinite(signal.confidence);
  const confidence = confidenceKnown ? clamp(signal.confidence) : 0;
  const verified = VERIFICATION_STATES.includes(signal.verificationState)
    ? signal.verificationState
    : 'UNVERIFIED';
  const usable = !synthetic
    && !stale
    && !contradicted
    && verified !== 'CONTRADICTED'
    && confidenceKnown
    && evidenceWeight(signal.evidenceClass) > 0;
  const contribution = usable
    ? clamp(
      evidenceWeight(signal.evidenceClass)
      * verificationWeight(verified)
      * sourceWeight(signal.sourceKind)
      * SIGNAL_TYPE_WEIGHT[signal.signalType]
      * confidence
      * freshnessDecay
    )
    : 0;
  const reasons = [];
  if (synthetic) reasons.push('synthetic-evidence-never-contributes-to-intent');
  if (stale) reasons.push('stale-evidence');
  if (contradicted) reasons.push('contradictory-evidence');
  if (verified === 'CONTRADICTED') reasons.push('verification-contradicted');
  if (!confidenceKnown) reasons.push('unknown-confidence');
  if (!evidenceWeight(signal.evidenceClass)) reasons.push('insufficient-evidence-class');

  return {
    signalId: signal.signalId,
    dedupeKey: signal.dedupeKey,
    schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION,
    sourceAdapter: signal.sourceAdapter,
    sourceKind: signal.sourceKind,
    entityType: signal.entityType,
    entityIdentity: signal.entityIdentity,
    signalType: signal.signalType,
    observedAt: signal.observedAt,
    evidenceClass: signal.evidenceClass,
    verificationState: verified,
    provenance: signal.provenance,
    sourceUrl: signal.sourceUrl,
    payloadDigest: signal.payloadDigest,
    confidence: confidenceKnown ? Number(confidence.toFixed(3)) : null,
    ageMs,
    halfLifeMs,
    freshnessDecay: Number(freshnessDecay.toFixed(6)),
    stale,
    contradicted,
    usableForIntent: usable,
    contribution: Number(contribution.toFixed(6)),
    reasonCodes: reasons
  };
}

/**
 * Build a bounded account-level intent view from already-supplied signals.
 *
 * The function is intentionally a pure ledger projection: `signals` are
 * candidates, not proof that a buyer wants anything, and the result cannot
 * authorize contact, spend, provider calls or a commercial claim.
 */
export function buildAccountIntentLedger({
  accountId,
  signals = [],
  contactRoutes = [],
  suppressions = [],
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  halfLifeMsBySignalType = {}
} = {}) {
  const normalizedAccountId = text(accountId, 240);
  if (!normalizedAccountId) throw new Error('accountId is required');
  const at = referenceDate(now);
  const nowMs = at.getTime();
  const ageLimit = finiteInteger(maxAgeMs, DEFAULT_MAX_AGE_MS, 0, 3650 * DAY_MS);
  const rawSignals = Array.isArray(signals) ? signals.slice(0, MAX_RECORDS) : [];
  const rejected = [];
  const normalizedSignals = [];
  const seen = new Set();

  rawSignals.forEach((raw, index) => {
    const result = normalizeLedgerSignal(raw, { accountId: normalizedAccountId, now: at });
    if (!result.ok) {
      rejected.push({ index, reason: result.reason });
      return;
    }
    if (seen.has(result.signal.dedupeKey)) {
      rejected.push({ index, reason: 'duplicate-signal' });
      return;
    }
    seen.add(result.signal.dedupeKey);
    normalizedSignals.push(result.signal);
  });

  const preliminary = normalizedSignals.map(signal => {
    const typeHalfLife = finiteInteger(
      halfLifeMsBySignalType?.[signal.signalType],
      SIGNAL_DECAY_HALF_LIFE_MS[signal.signalType] || 14 * DAY_MS,
      1,
      3650 * DAY_MS
    );
    const observedMs = Date.parse(signal.observedAt);
    const ageMs = Number.isFinite(observedMs) ? Math.max(0, nowMs - observedMs) : Number.POSITIVE_INFINITY;
    return { signal, typeHalfLife, ageMs, stale: ageMs > ageLimit };
  });

  const groups = new Map();
  for (const item of preliminary) {
    const key = contradictionKey(item.signal);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const contradictedKeys = new Set();
  const contradictionGroups = [];
  for (const [key, group] of groups) {
    const activePayloads = new Set(group
      .filter(item => !item.stale && item.signal.evidenceClass !== 'SYNTHETIC_TEST_FIXTURE')
      .map(item => item.signal.payloadDigest));
    if (activePayloads.size > 1) {
      contradictedKeys.add(key);
      contradictionGroups.push({
        contradictionKey: key,
        signalIds: group.map(item => item.signal.signalId),
        payloadDigests: [...activePayloads]
      });
    }
  }

  const records = preliminary.map(item => effectiveSignalRecord(item.signal, {
    nowMs,
    maxAgeMs: ageLimit,
    halfLifeMs: item.typeHalfLife,
    contradicted: contradictedKeys.has(contradictionKey(item.signal))
  }));

  const suppressionList = Array.isArray(suppressions) ? suppressions.slice(0, MAX_RECORDS) : [];
  const accountSuppressed = suppressionList.some(item => accountSuppressionMatches(normalizedAccountId, item));
  const contactDecisions = normalizeContactDecisions({
    contactRoutes,
    suppressions: suppressionList,
    now: at
  });
  const blockedContactCount = contactDecisions.filter(item => item.status === 'BLOCKED_SUPPRESSED').length;
  const usableContactCount = contactDecisions.filter(item => item.usableForHandoff).length;
  const usableRecords = records.filter(item => item.usableForIntent);
  const rawScore = usableRecords.reduce((remaining, item) => remaining * (1 - item.contribution), 1);
  const intentScore = accountSuppressed ? 0 : Number((1 - rawScore).toFixed(6));
  const confidenceCandidates = usableRecords.map(item => item.confidence * item.freshnessDecay * evidenceWeight(item.evidenceClass) * verificationWeight(item.verificationState));
  const confidence = accountSuppressed || !confidenceCandidates.length
    ? 0
    : Number(Math.max(...confidenceCandidates).toFixed(6));
  const activeCount = records.filter(item => !item.stale && !item.contradicted).length;
  const staleCount = records.filter(item => item.stale).length;
  const syntheticCount = records.filter(item => item.evidenceClass === 'SYNTHETIC_TEST_FIXTURE').length;
  const unknownCount = records.filter(item => item.reasonCodes.includes('unknown-confidence') || item.evidenceClass === 'UNRESOLVED').length;

  let intentState = 'UNRESOLVED';
  if (accountSuppressed) intentState = 'SUPPRESSED';
  else if (contradictionGroups.length && !usableRecords.length) intentState = 'CONTRADICTED';
  else if (!activeCount && records.length) intentState = 'STALE';
  else if (intentScore >= 0.55 && confidence >= 0.5) intentState = 'QUALIFIED_INTENT';
  else if (contradictionGroups.length || unknownCount || (records.length && !usableRecords.length)) intentState = 'REVIEW_REQUIRED';
  else if (records.length) intentState = 'LOW_SIGNAL';

  const ledgerDigest = sha256({
    accountId: normalizedAccountId,
    records: records.map(item => ({
      signalId: item.signalId,
      stale: item.stale,
      contradicted: item.contradicted,
      contribution: item.contribution
    })),
    accountSuppressed,
    intentScore,
    confidence,
    intentState
  });

  return {
    version: ACCOUNT_INTENT_LEDGER_VERSION,
    ledgerId: `intent_${ledgerDigest.slice(0, 24)}`,
    accountId: normalizedAccountId,
    generatedAt: at.toISOString(),
    inputCount: rawSignals.length,
    acceptedCount: records.length,
    rejected,
    records,
    contradictionGroups,
    contactDecisions,
    summary: {
      intentState,
      intentScore,
      confidence,
      activeEvidenceCount: activeCount,
      usableEvidenceCount: usableRecords.length,
      staleEvidenceCount: staleCount,
      syntheticEvidenceCount: syntheticCount,
      unknownEvidenceCount: unknownCount,
      contradictionCount: contradictionGroups.length,
      accountSuppressed,
      blockedContactCount,
      usableContactCount,
      outreachEligible: !accountSuppressed && usableContactCount > 0 && intentState !== 'CONTRADICTED'
    },
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    executionStatus: 'NOT_RUN',
    note: 'Signals are evidence inputs, not verified buyer demand. This ledger never authorizes outreach, spend, payment, fulfillment or a claim of revenue.'
  };
}

export const ACCOUNT_INTENT_LEDGER_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  networkRequests: 0,
  messagesSent: 0,
  moneySpentCents: 0,
  businessEffectAuthority: 'NONE'
});
