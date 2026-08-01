// Canon/V3 integration -- mission item 5 ("prospect supply") and premerge audit P1-001 (contact
// routes), P1-008 (company frequency), P1-013 (reserved domains).
//
// Adapted from V3's prospect-supply.mjs. V3 required a syntactically-valid email for every
// candidate and deduplicated with process-local Sets that are themselves the only guard against a
// duplicate. Here, contact routes are typed (contact-routes.mjs) so non-email official routes can
// still be research-validated, and the existing `prospects` table's own domain UNIQUE constraint
// (migrations/001, enforced identically by JsonStore._checkUnique and PostgresStore) is the
// authoritative de-duplication guard -- store.findOrCreate is the only way a candidate becomes a
// durable prospect row; an in-memory Set here is at most a same-batch pre-filter, never the source
// of truth.
import { normalizeDomain } from './utils.mjs';
import { normalizeContactRoute, isEmailSendable, ContactRouteError } from './contact-routes.mjs';
import { assertNotReservedOutsideSimulation } from './reserved-domains.mjs';

const GENERIC_LOCAL_PARTS = new Set(['info', 'hello', 'contact', 'admin', 'reception', 'support', 'help', 'billing', 'privacy', 'security', 'abuse']);
const PROVIDER_ROUTE_PATTERN = /partner|partnership|vendor|supplier|procurement|business development|alliances|freelancer|contractor|careers|agency|implementation|white[- ]label/i;

export const PROSPECT_SUPPLY_MILESTONES = Object.freeze([100, 1000, 10000, 30000]);

function isFreshEvidence(evidenceDateInput, now, maximumEvidenceAgeDays) {
  const evidenceDate = new Date(evidenceDateInput || 0);
  if (Number.isNaN(evidenceDate.getTime())) return false;
  const ageMs = now.getTime() - evidenceDate.getTime();
  return ageMs >= 0 && ageMs <= maximumEvidenceAgeDays * 86400000;
}

/**
 * Validates one raw prospect-supply candidate. Returns `{ ok, reasons, prospect }` where
 * `prospect` is shaped for the existing `prospects` collection (domain, contact, status) plus a
 * `contactRoute` object (contact-routes.mjs) recording the typed route actually used -- never a
 * bare `sendEligible` boolean a later stage could trust blindly (see send-eligibility.mjs, which
 * re-derives eligibility from canonical state and never reads this field at all).
 */
export function validateProspectCandidate(raw = {}, { now = new Date(), maximumEvidenceAgeDays = 45, simulation = false } = {}) {
  const reasons = [];
  const domain = normalizeDomain(raw.domain || raw.website || raw.officialWebsite || '');
  if (!domain) reasons.push('missing-domain');

  const domainCheck = assertNotReservedOutsideSimulation(domain, { simulation });
  if (!domainCheck.ok) reasons.push(domainCheck.reason);

  if (!String(raw.organization || '').trim()) reasons.push('missing-organization');
  if (!String(raw.triggerSignal || raw.signal || '').trim()) reasons.push('missing-current-commercial-signal');

  const sourceUrl = String(raw.evidenceUrl || raw.sourceUrl || '').trim();
  try { if (new URL(sourceUrl).protocol !== 'https:') reasons.push('evidence-url-not-https'); }
  catch { reasons.push('missing-official-evidence-url'); }
  if (!isFreshEvidence(raw.evidenceDate || raw.capturedAt, now, maximumEvidenceAgeDays)) reasons.push('stale-or-missing-evidence-date');

  let route = null;
  try {
    route = normalizeContactRoute(raw.contactRoute || raw.contact || (raw.contactEmail ? { type: 'email', email: raw.contactEmail } : {}));
  } catch (error) {
    reasons.push(error instanceof ContactRouteError ? error.code : 'contact-route-invalid');
  }
  if (route) {
    if (!route.publishedOfficially && !PROVIDER_ROUTE_PATTERN.test(String(raw.contactProvenance || ''))) reasons.push('contact-not-officially-published');
    if (route.type === 'email') {
      const local = route.email.split('@')[0] || '';
      if (GENERIC_LOCAL_PARTS.has(local) && !PROVIDER_ROUTE_PATTERN.test(String(raw.contactProvenance || ''))) reasons.push('generic-mailbox-without-provider-route');
      if (!isEmailSendable(route, { website: domain, domain })) reasons.push('contact-not-email-sendable');
    }
    // Non-email routes (form/marketplace/partner_application/vendor_portal/rfp/phone) are never
    // rejected for "not being an email" -- mission item 5 explicitly requires accepting an
    // officially-published provider-facing route of any of these types. They simply never satisfy
    // isEmailSendable, so send-eligibility.mjs structurally cannot queue them for email send.
  }
  if (raw.suppressed === true) reasons.push('suppressed');

  const ok = reasons.length === 0;
  return {
    ok, reasons: [...new Set(reasons)],
    prospect: {
      domain, organization: raw.organization || '', website: raw.website || raw.officialWebsite || `https://${domain}`,
      status: ok ? 'new' : 'policy_rejected',
      contact: route?.type === 'email' ? { email: route.email, source: route.publishedOfficially ? 'website' : 'other', verified: route.publishedOfficially ? 'valid' : 'unverified' } : {},
      contactRoute: route,
      triggerSignal: raw.triggerSignal || raw.signal || '',
      evidenceUrl: sourceUrl,
      serviceLane: String(raw.serviceLane || '').trim().toLowerCase(),
      validationReasons: [...new Set(reasons)],
      validatedAt: now.toISOString()
    }
  };
}

/**
 * Persists validated candidates into the existing `prospects` collection via `store.findOrCreate`
 * keyed on `domain` -- the same unique column Postgres and JsonStore both already enforce
 * (migrations/001). This is the ONLY write path: there is no second, in-memory prospect truth.
 * `recipientSeen`/`domainSeen` are same-batch fast-path pre-filters only; a race between two
 * concurrent callers is still resolved correctly by the store's own uniqueness guarantee (a
 * second `findOrCreate` for an already-inserted domain returns `{ inserted: false }`, never a
 * duplicate row).
 */
export async function replenishProspectQueue(store, { candidates = [], targetBacklog = 1000, now = new Date(), simulation = false, maximumEvidenceAgeDays = 45 } = {}) {
  const currentBacklog = await store.count('prospects', {});
  const accepted = [];
  const rejected = [];
  const recipientSeen = new Set();
  const domainSeen = new Set();
  let added = 0;

  for (const raw of candidates) {
    if (currentBacklog + added >= targetBacklog) break;
    const { ok, reasons, prospect } = validateProspectCandidate(raw, { now, maximumEvidenceAgeDays, simulation });
    if (!ok) { rejected.push({ domain: prospect.domain, reasons }); continue; }
    if (prospect.contact.email && recipientSeen.has(prospect.contact.email)) { rejected.push({ domain: prospect.domain, reasons: ['duplicate-recipient-in-batch'] }); continue; }
    if (domainSeen.has(prospect.domain)) { rejected.push({ domain: prospect.domain, reasons: ['duplicate-domain-in-batch'] }); continue; }

    const { record, inserted } = await store.findOrCreate('prospects', {
      id: raw.id || `prospect_${prospect.domain.replace(/[^a-z0-9]/g, '-')}`, ...prospect
    }, ['domain']);
    if (inserted) { added += 1; accepted.push(record); }
    else rejected.push({ domain: prospect.domain, reasons: ['duplicate-domain'] });
    recipientSeen.add(prospect.contact.email);
    domainSeen.add(prospect.domain);
  }

  return { additions: accepted, rejected, backlog: currentBacklog + added, gap: Math.max(0, targetBacklog - currentBacklog - added) };
}

export function nextSupplyMilestone(currentBacklog) {
  return PROSPECT_SUPPLY_MILESTONES.find(milestone => milestone > currentBacklog) || null;
}
