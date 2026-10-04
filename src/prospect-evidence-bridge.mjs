// Read-only bridge from durable prospect records into the canonical evidence
// and qualification shapes consumed by Revenue Singularity. It exists so the
// Money Queue can use facts UberBond already stores without requiring a second
// manually-maintained evidenceBundle. It never invents evidence and never grants
// outreach authority.
import {
  buildProspectEvidenceBundle,
  PROSPECT_EVIDENCE_VERSION
} from './prospect-evidence-reconciliation.mjs';
import { stackSignals } from './money-queue.mjs';

export const PROSPECT_EVIDENCE_BRIDGE_VERSION = 'uberbond.prospect-evidence-bridge.v1';

const SOURCE_MAP = Object.freeze({
  owner_import: 'owner_import',
  csv_import: 'owner_import',
  first_party_export: 'first_party',
  first_party: 'first_party',
  public_website: 'public_website',
  website: 'public_website',
  public_profile: 'public_profile',
  licensed_export: 'licensed_provider',
  licensed_provider: 'licensed_provider',
  provider_api: 'provider_api'
});
const CLASS_BY_SOURCE = Object.freeze({
  owner_import: 'DIRECT_FIRST_PARTY',
  first_party: 'DIRECT_FIRST_PARTY',
  public_website: 'DIRECT_PUBLIC',
  public_profile: 'DIRECT_PUBLIC',
  licensed_provider: 'LICENSED_PROVIDER',
  provider_api: 'LICENSED_PROVIDER'
});
const VERIFY_MAP = Object.freeze({
  valid: 'VALID', deliverable: 'VALID',
  invalid: 'INVALID', undeliverable: 'INVALID',
  accept_all: 'CATCH_ALL', catch_all: 'CATCH_ALL',
  risky: 'RISKY', unverified: 'UNKNOWN', unknown: 'UNKNOWN',
  temporary_failure: 'TEMPORARY_FAILURE', suppressed: 'SUPPRESSED', stale: 'STALE'
});
const https = value => {
  try { const u = new URL(String(value || '')); return u.protocol === 'https:' ? u.toString() : ''; }
  catch { return ''; }
};
const clamp01 = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n > 1 ? n / 100 : n)) : null;
};
const sourceTypeOf = value => SOURCE_MAP[String(value || '').trim().toLowerCase()] || null;
const evidenceClassOf = sourceType => CLASS_BY_SOURCE[sourceType] || null;
const contactTitle = p => String(p?.contact?.role || p?.contact?.title || p?.buyerRole || '').trim();

function contactCandidate(prospect = {}) {
  const c = prospect.contact || {};
  const email = String(c.email || prospect.email || '').trim().toLowerCase();
  if (!email) return null;
  const sourceType = sourceTypeOf(c.source || prospect.source);
  if (!sourceType) return null;
  const verificationState = VERIFY_MAP[String(c.verified || c.verificationStatus || '').trim().toLowerCase()] || null;
  const checkedAt = c.verificationCheckedAt || c.observedAt || prospect.updatedAt || prospect.createdAt || null;
  const route = {
    route: email,
    verifications: verificationState ? [{
      route: email,
      state: verificationState,
      checkedAt,
      provider: String(c.verificationProvider || c.source || sourceType).slice(0, 120),
      sourceUrl: https(c.verificationSourceUrl || c.sourceUrl),
      evidenceClass: evidenceClassOf(sourceType) || 'MODEL_INFERENCE',
      confidence: clamp01(c.verificationScore) ?? (verificationState === 'VALID' || verificationState === 'INVALID' ? 0.9 : 0.5)
    }] : []
  };
  const name = String(c.name || prospect.contactName || '').trim();
  const role = contactTitle(prospect);
  const publicUrl = https(c.sourceUrl || (sourceType === 'public_website' ? prospect.website : ''));
  const person = (name || publicUrl) ? {
    companyId: String(prospect.id || ''),
    name,
    role,
    sourceType,
    sourceUrl: publicUrl,
    publicProfileUrl: sourceType === 'public_profile' ? publicUrl : '',
    evidenceClass: evidenceClassOf(sourceType),
    observedAt: c.observedAt || prospect.updatedAt || prospect.createdAt || null,
    exactIdentity: c.exact !== false,
    inferred: c.inferred === true
  } : null;
  return { route, person, sourceType, evidenceClass: evidenceClassOf(sourceType), role };
}

/** Build only from durable fields with attributable provenance. If a record does
 * not carry enough provenance, it stays absent and qualification remains closed. */
export function evidenceBundleFromStoredProspect(prospect = {}, { suppressions = [], now = new Date() } = {}) {
  if (prospect?.evidenceBundle?.version === PROSPECT_EVIDENCE_VERSION) return prospect.evidenceBundle;
  if (prospect?.evidenceBundle && typeof prospect.evidenceBundle === 'object') return prospect.evidenceBundle;
  const candidate = contactCandidate(prospect);
  if (!candidate) return null;
  try {
    return buildProspectEvidenceBundle({
      prospectId: prospect.id,
      personCandidates: candidate.person ? [candidate.person] : [],
      contactRoutes: [candidate.route],
      suppressions,
      now
    });
  } catch {
    return null;
  }
}

const roleFit = (offerId, role) => {
  const x = String(role || '').toLowerCase();
  if (!x) return 0;
  const executive = /\b(owner|founder|ceo|chief|president|partner|principal|director|head|vp|vice president)\b/.test(x);
  const byOffer = {
    LEAD_TO_BOOKING_LEAK_AUDIT: /client|account|performance|marketing|growth|operations|revenue|owner|founder|ceo/,
    AI_AGENT_RELEASE_GATE: /ai|agent|engineering|technical|technology|product|platform|qa|quality|cto|cio|owner|founder|ceo/,
    CLIENT_ROI_PROOF_SPRINT: /performance|marketing|growth|revenue|revops|analytics|client|account|cmo|owner|founder|ceo/,
    BILINGUAL_BOOKING_LEAK_AUDIT: /clinic|practice|operations|marketing|growth|booking|patient|general manager|owner|founder|ceo/
  };
  const matched = byOffer[offerId]?.test(x) || false;
  return matched ? (executive ? 0.95 : 0.82) : (executive ? 0.62 : 0.35);
};

/** Augment only missing observations with deterministic readings of durable,
 * source-backed facts. Existing caller-supplied observations always win. */
export function qualificationObservationsFromStoredProspect(prospect = {}, {
  bundle = null,
  selectedOffer = null,
  now = Date.now()
} = {}) {
  const observations = { ...(prospect.observations || {}) };
  const candidate = contactCandidate(prospect);
  const evidenceClass = candidate?.evidenceClass;
  const offerId = selectedOffer?.offer?.offerId || selectedOffer?.offerId || null;
  const offerScore = clamp01(selectedOffer?.fit?.score ?? selectedOffer?.score);

  if (!observations.buyerRoleFit && candidate?.role && evidenceClass) {
    observations.buyerRoleFit = { value: roleFit(offerId, candidate.role), evidenceClass };
  }

  // ICP fit is admitted only when the durable record itself carries an owner/
  // first-party/provider/public-source fit value. No semantic guess is upgraded.
  const fit = clamp01(prospect.serviceFit ?? prospect.icpFit);
  const prospectSource = sourceTypeOf(prospect.source || prospect.sourceMetadata?.sourceType);
  const prospectEvidenceClass = evidenceClassOf(prospectSource);
  if (!observations.icpFit && fit !== null && prospectEvidenceClass) {
    observations.icpFit = { value: fit, evidenceClass: prospectEvidenceClass };
  }

  const issue = prospect.issue;
  if (!observations.painEvidence && issue && https(issue.evidenceUrl || issue.sourceUrl)) {
    const value = clamp01(issue.confidence) ?? 0.65;
    observations.painEvidence = { value, evidenceClass: 'DIRECT_PUBLIC' };
  }

  const signals = stackSignals(prospect.demandSignals || [], now);
  if (!observations.signalStrength && signals.score > 0) {
    observations.signalStrength = { value: signals.score, evidenceClass: 'DIRECT_PUBLIC' };
  }
  if (!observations.timing && signals.score > 0) {
    observations.timing = { value: Math.min(1, signals.score), evidenceClass: 'DIRECT_PUBLIC' };
  }

  // Offer fit is advisory unless an existing observation says otherwise. It can
  // improve ranking but cannot satisfy the three mandatory source-backed gates.
  if (!observations.offerFit && offerScore !== null) {
    observations.offerFit = { value: offerScore, evidenceClass: 'MODEL_INFERENCE' };
  }

  // Reachability is intentionally omitted: qualifyProspect derives it only from
  // verified routes in the canonical evidence bundle.
  return observations;
}

export function buyerFromStoredProspect(prospect = {}) {
  const email = String(prospect?.contact?.email || prospect?.email || '').trim().toLowerCase();
  const role = contactTitle(prospect);
  return { resolved: Boolean(email && role), role: role || null, email: email || null };
}
