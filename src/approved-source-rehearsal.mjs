// Catalog-source rehearsal for the canonical commercial evidence spine.
// This module does not browse, re-verify, contact, purchase, deploy, or
// promote anything. It only lets a caller explicitly select public buyer
// signals already present in the canonical catalog, preserves their evidence
// tier, and runs them through the existing reconciliation path.
import crypto from 'node:crypto';
import { compileCommercialOpportunity } from './commercial-opportunity-catalog.mjs';
import { reconcileCommercialEvidence } from './commercial-reconciliation.mjs';
import { VERIFICATION_STATES } from './market-signal.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const APPROVED_SOURCE_REHEARSAL_POLICY_VERSION = 'approved-source-rehearsal-1.0.0';


function referenceDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function approvedUrls(values) {
  return new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(value => /^https:\/\//i.test(value)));
}

function sourceVerification(url, verification = {}) {
  const input = verification && typeof verification === 'object' ? verification[url] : null;
  const requested = typeof input === 'string' ? input : input?.state;
  const evidenceRef = typeof input === 'object' ? String(input?.evidenceRef || '').trim() : '';
  if (!VERIFICATION_STATES.includes(requested) || requested === 'CONTRADICTED') {
    return { state: requested === 'CONTRADICTED' ? 'CONTRADICTED' : 'UNVERIFIED', evidenceRef: evidenceRef || null };
  }
  // A caller cannot upgrade a catalog claim to a reached/matched source by
  // assertion alone. A compact external verification receipt reference is
  // required; this module still does not inspect or validate that receipt.
  if (requested !== 'UNVERIFIED' && !evidenceRef) {
    return { state: 'UNVERIFIED', evidenceRef: null };
  }
  return { state: requested, evidenceRef: evidenceRef || null };
}

function toMarketSignal({ opportunity, observation, verification }) {
  const url = String(observation?.source?.url || '').trim();
  const observedDate = String(observation?.source?.observedAt || '').trim();
  const observedAt = /^\d{4}-\d{2}-\d{2}$/.test(observedDate)
    ? `${observedDate}T00:00:00.000Z`
    : observedDate;
  return {
    sourceAdapter: 'canonical-commercial-catalog',
    sourceKind: 'JOB_BOARD',
    entityType: 'JOB_POSTING',
    entityIdentity: url,
    signalType: 'NEW_LISTING',
    observedAt,
    payload: {
      opportunityId: opportunity.opportunityId,
      amountUsd: Number.isFinite(Number(observation?.amountUsd)) ? Number(observation.amountUsd) : null,
      scope: String(observation?.scope || '')
    },
    evidenceClass: 'BUYER_SIGNAL',
    provenance: `commercial-opportunity-catalog:${opportunity.opportunityId}`,
    sourceUrl: url,
    verificationState: verification.state,
    rawReference: verification.evidenceRef
  };
}

function blockedResult({ timestamp, opportunityId, reasonCodes }) {
  return {
    ok: false,
    policyVersion: APPROVED_SOURCE_REHEARSAL_POLICY_VERSION,
    status: 'APPROVED_SOURCE_REQUIRED',
    mode: 'LOCAL_REHEARSAL_ONLY',
    timestamp,
    opportunityId: String(opportunityId || ''),
    reasonCodes,
    truthClassification: {
      rehearsal: 'NOT_RUN',
      buyerEvidence: 'UNRESOLVED',
      sourceVerification: 'UNRESOLVED',
      revenue: 'UNPROVEN'
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export async function rehearseApprovedCommercialEvidence({
  store = null,
  opportunityId = 'paid-media-revenue-assurance',
  approvedSourceUrls = [],
  verificationByUrl = {},
  date = new Date(),
  persist = false,
  tournamentLimit = 15
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const opportunity = compileCommercialOpportunity({ opportunityId, date: at });
  if (!opportunity.ok) {
    return blockedResult({ timestamp, opportunityId, reasonCodes: ['canonical-opportunity-required'] });
  }
  if (opportunity.evidence?.classification !== 'BUYER_SIGNAL') {
    return blockedResult({ timestamp, opportunityId, reasonCodes: ['canonical-buyer-signal-required'] });
  }

  const allowlist = approvedUrls(approvedSourceUrls);
  const eligible = (Array.isArray(opportunity.observedBuyerSignals) ? opportunity.observedBuyerSignals : [])
    .filter(observation => observation?.source?.claimType === 'BUYER_SIGNAL')
    .filter(observation => allowlist.has(String(observation?.source?.url || '').trim()));
  if (!eligible.length) {
    return blockedResult({ timestamp, opportunityId, reasonCodes: ['approved-catalog-source-required'] });
  }

  const sourceReceipts = eligible.map(observation => {
    const url = String(observation.source.url);
    const verification = sourceVerification(url, verificationByUrl);
    return {
      url,
      observedAt: observation.source.observedAt,
      evidenceClass: 'BUYER_SIGNAL',
      verificationState: verification.state,
      verificationEvidenceRef: verification.evidenceRef,
      signal: toMarketSignal({ opportunity, observation, verification })
    };
  });
  const reconciliation = await reconcileCommercialEvidence({
    store,
    signals: sourceReceipts.map(receipt => receipt.signal),
    candidate: {
      id: opportunity.opportunityId,
      name: opportunity.name,
      category: opportunity.category
    },
    date: at,
    persist: Boolean(persist),
    tournamentLimit
  });
  const reasonCodes = [
    ...(reconciliation.reasonCodes || []),
    ...(sourceReceipts.some(receipt => receipt.verificationState === 'CONTRADICTED') ? ['source-contradiction-present'] : []),
    ...(sourceReceipts.every(receipt => receipt.verificationState === 'UNVERIFIED') ? ['source-content-not-reverified'] : [])
  ];
  const result = {
    ok: reconciliation.ok,
    policyVersion: APPROVED_SOURCE_REHEARSAL_POLICY_VERSION,
    status: reconciliation.ok ? 'REHEARSED_REVIEW_REQUIRED' : 'REVIEW_REQUIRED',
    mode: 'LOCAL_REHEARSAL_ONLY',
    timestamp,
    rehearsalId: `rehearsal_${digest({
      policyVersion: APPROVED_SOURCE_REHEARSAL_POLICY_VERSION,
      opportunityId: opportunity.opportunityId,
      timestamp,
      sourceUrls: sourceReceipts.map(receipt => receipt.url)
    }).slice(0, 24)}`,
    opportunityId: opportunity.opportunityId,
    selectedSourceCount: sourceReceipts.length,
    selectedSources: sourceReceipts.map(({ signal, ...receipt }) => receipt),
    reconciliation,
    reasonCodes: [...new Set(reasonCodes)],
    truthClassification: {
      rehearsal: reconciliation.ok ? 'IMPLEMENTED_LOCAL' : 'REVIEW_REQUIRED',
      buyerEvidence: 'BUYER_SIGNAL',
      sourceVerification: sourceReceipts.some(receipt => receipt.verificationState === 'CONTENT_MATCHED')
        ? 'CALLER_RECEIPT_REFERENCED'
        : 'UNVERIFIED',
      revenue: 'UNPROVEN'
    },
    authorization: {
      contact: 'DISABLED',
      checkout: 'DISABLED',
      providerCalls: 'DISABLED',
      spend: 'DISABLED',
      deployment: 'DISABLED',
      promotion: 'DISABLED'
    },
    localAuditWrites: reconciliation.localAuditWrites || 0,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };

  if (persist && store && typeof store.log === 'function') {
    await logApprovedSourceRehearsal(store, result);
    result.localAuditWrites += 1;
  }
  return result;
}

export async function logApprovedSourceRehearsal(store, result) {
  if (!store || typeof store.log !== 'function' || !result?.rehearsalId) return null;
  return store.log('approved_source_commercial_rehearsal', {
    policyVersion: result.policyVersion,
    status: result.status,
    mode: result.mode,
    timestamp: result.timestamp,
    rehearsalId: result.rehearsalId,
    opportunityId: result.opportunityId,
    selectedSourceCount: result.selectedSourceCount,
    selectedSources: result.selectedSources,
    reconciliationId: result.reconciliation?.reconciliationId || null,
    reasonCodes: result.reasonCodes,
    truthClassification: result.truthClassification,
    authorization: result.authorization,
    externalEffectLedger: result.externalEffectLedger
  });
}

export const APPROVED_SOURCE_REHEARSAL_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
