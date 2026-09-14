// UberVerify: provider-neutral contact hygiene and evidence gate.
//
// It does not discover private contact data, probe mail servers, call a
// verification vendor, or send a message. It reconciles already-supplied
// source evidence and verification receipts and decides whether a route may
// advance to a later authorization gate.

import {
  canonicalContactRoute,
  evaluateContactRoute,
  normalizeContactVerification,
  normalizeEnrichmentObservation,
  reconcileFieldObservations
} from './prospect-evidence-reconciliation.mjs';

export const UBERVERIFY_VERSION = 'uberbond.uberverify.v1';

const DIRECT_CLASSES = new Set(['DIRECT_FIRST_PARTY', 'DIRECT_PUBLIC', 'LICENSED_PROVIDER']);
const ACCEPTABLE_VERIFICATION_STATES = new Set(['VALID']);
const REVIEW_STATES = new Set(['CATCH_ALL', 'RISKY', 'UNKNOWN', 'TEMPORARY_FAILURE', 'STALE']);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function buildUberVerifyDecision({
  route,
  sourceEvidence = [],
  verifications = [],
  suppressions = [],
  now = new Date()
} = {}) {
  const email = text(route, 320).toLowerCase();
  if (!validEmail(email)) {
    return {
      version: UBERVERIFY_VERSION,
      route: email || null,
      canonicalRoute: email ? canonicalContactRoute(email) : null,
      status: 'REJECT_INVALID_ROUTE',
      usableForOutreachPreparation: false,
      reasonCodes: ['syntactically-invalid-email-route'],
      externalEffectAuthority: 'NONE',
      providerCalls: 0,
      messagesSent: 0
    };
  }

  let routeDecision;
  try {
    routeDecision = evaluateContactRoute({ route: email, verifications, suppressions, now });
  } catch {
    routeDecision = { status: 'REVIEW_INVALID_ROUTE', usableForHandoff: false, reasonCodes: ['route-evaluation-failed'] };
  }

  if (routeDecision.status === 'BLOCKED_SUPPRESSED') {
    return {
      version: UBERVERIFY_VERSION,
      route: email,
      canonicalRoute: canonicalContactRoute(email),
      status: 'REJECT_SUPPRESSED',
      usableForOutreachPreparation: false,
      reasonCodes: ['suppression-dominates-all-other-evidence', ...(routeDecision.reasonCodes || [])],
      externalEffectAuthority: 'NONE',
      providerCalls: 0,
      messagesSent: 0
    };
  }

  const normalizedSource = [];
  const sourceRejects = [];
  for (const [index, raw] of (Array.isArray(sourceEvidence) ? sourceEvidence : []).entries()) {
    try {
      const observation = raw?.version
        ? raw
        : normalizeEnrichmentObservation({
          field: 'work_email',
          value: raw?.value || raw?.email || email,
          sourceType: raw?.sourceType || raw?.source || 'public_website',
          sourceUrl: raw?.sourceUrl,
          sourceRecordId: raw?.sourceRecordId,
          evidenceClass: raw?.evidenceClass,
          confidence: raw?.confidence,
          exact: raw?.exact,
          inferred: raw?.inferred,
          observedAt: raw?.observedAt,
          expiresAt: raw?.expiresAt,
          provider: raw?.provider
        }, { now });
      normalizedSource.push(observation);
    } catch (error) {
      sourceRejects.push({ index, reason: String(error?.message || 'source-evidence-invalid') });
    }
  }

  const matchingSource = normalizedSource.filter(item => String(item.value || '').trim().toLowerCase() === email);
  const sourceReconciliation = reconcileFieldObservations(matchingSource, { now });
  const directSource = matchingSource.filter(item => DIRECT_CLASSES.has(item.evidenceClass) && item.inferred !== true && item.exact !== false);
  const inferredSource = matchingSource.filter(item => item.inferred === true || item.evidenceClass === 'MODEL_INFERENCE');

  const normalizedVerifications = [];
  for (const raw of (Array.isArray(verifications) ? verifications : [])) {
    try {
      const normalized = raw?.version ? raw : normalizeContactVerification({ ...raw, route: raw?.route || raw?.email || email }, { now });
      if (canonicalContactRoute(normalized.route) === canonicalContactRoute(email)) normalizedVerifications.push(normalized);
    } catch {
      // Invalid vendor output is ignored as evidence and handled by the no-valid-receipt rule below.
    }
  }

  const states = [...new Set(normalizedVerifications.map(item => item.state))];
  const validReceipt = normalizedVerifications.find(item => ACCEPTABLE_VERIFICATION_STATES.has(item.state));
  const invalidReceipt = normalizedVerifications.find(item => item.state === 'INVALID');
  const refusalReceipt = normalizedVerifications.find(item => item.state === 'SUPPRESSED');
  const reviewReceipt = normalizedVerifications.find(item => REVIEW_STATES.has(item.state));

  const reasons = [];
  if (sourceReconciliation.status === 'CONFLICT') reasons.push('conflicting-source-evidence');
  if (!directSource.length) reasons.push('no-direct-source-backed-route');
  if (inferredSource.length && !directSource.length) reasons.push('inferred-private-address-never-satisfies-route');
  if (!normalizedVerifications.length) reasons.push('no-verification-receipt');
  if (invalidReceipt) reasons.push('verification-invalid');
  if (refusalReceipt) reasons.push('verification-or-provider-suppressed');
  if (reviewReceipt && !validReceipt) reasons.push(`verification-needs-review:${reviewReceipt.state}`);
  if (routeDecision.usableForHandoff !== true) reasons.push(...(routeDecision.reasonCodes || ['contact-route-not-usable']));

  let status = 'REVIEW_REQUIRED';
  let usable = false;
  if (invalidReceipt || refusalReceipt || sourceReconciliation.status === 'CONFLICT') status = 'REJECTED';
  else if (directSource.length && validReceipt && routeDecision.usableForHandoff === true) {
    status = 'VERIFIED_FOR_AUTHORIZATION_GATE';
    usable = true;
  }

  return {
    version: UBERVERIFY_VERSION,
    route: email,
    canonicalRoute: canonicalContactRoute(email),
    status,
    usableForOutreachPreparation: usable,
    reasonCodes: [...new Set(reasons)],
    sourceState: sourceReconciliation.status,
    directSourceCount: directSource.length,
    sourceRejects,
    verificationStates: states,
    strongestVerification: validReceipt?.state || invalidReceipt?.state || reviewReceipt?.state || null,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    providerCalls: 0,
    messagesSent: 0,
    note: 'VERIFIED_FOR_AUTHORIZATION_GATE means evidence/hygiene passed. It is not permission to contact the person.'
  };
}

export function compileUberVerifyBatch({ contacts = [], suppressions = [], now = new Date() } = {}) {
  const decisions = (Array.isArray(contacts) ? contacts : []).map(contact => buildUberVerifyDecision({
    route: contact.route || contact.email,
    sourceEvidence: contact.sourceEvidence || [],
    verifications: contact.verifications || [],
    suppressions,
    now
  }));
  return {
    version: UBERVERIFY_VERSION,
    total: decisions.length,
    verifiedForAuthorizationGate: decisions.filter(item => item.status === 'VERIFIED_FOR_AUTHORIZATION_GATE').length,
    reviewRequired: decisions.filter(item => item.status === 'REVIEW_REQUIRED').length,
    rejected: decisions.filter(item => item.status.startsWith('REJECT')).length,
    decisions,
    externalEffectAuthority: 'NONE',
    messagesSent: 0
  };
}
