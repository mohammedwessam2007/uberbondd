// Premerge audit P1-001 (contact routes). V3's prospect validation required a syntactically valid
// email for every prospect, which discarded lawful officially-published partner applications,
// vendor portals, marketplace listings, RFPs, and phone routes -- and encouraged mailbox-centric
// acquisition as the only modeled path. This module models a contact route as typed data; only an
// `email` route is eligible to enter email send planning (send-eligibility.mjs). Every other route
// type can still be research-validated, scored, and queued for a human/owner-driven channel, but it
// structurally cannot reach reserveOutboundSend.
import { contactEligibility } from './send-safety.mjs';

export const CONTACT_ROUTE_TYPES = Object.freeze(['email', 'form', 'marketplace', 'partner_application', 'vendor_portal', 'rfp', 'phone']);
export const EMAIL_SENDABLE_ROUTE_TYPE = 'email';

export class ContactRouteError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ContactRouteError';
    this.code = code;
  }
}

/** Normalizes a raw contact-route object into { type, ...typed fields }. Every route carries
 * `publishedOfficially` (the route's own provenance) independent of its type -- an officially
 * published partner-application URL is exactly as legitimate a research-validated route as an
 * officially published email address; only the *type* determines what channel it can enter. */
export function normalizeContactRoute(raw = {}) {
  const type = String(raw.type || (raw.email ? 'email' : '')).trim().toLowerCase();
  if (!CONTACT_ROUTE_TYPES.includes(type)) {
    throw new ContactRouteError('contact-route-type-invalid', `contact route type must be one of ${CONTACT_ROUTE_TYPES.join(', ')}, got: ${type || '(none)'}`);
  }
  const base = {
    type,
    publishedOfficially: raw.publishedOfficially === true || raw.published_officially === true,
    sourceUrl: String(raw.sourceUrl || raw.source_url || '').trim()
  };
  if (type === 'email') {
    return { ...base, email: String(raw.email || '').trim().toLowerCase() };
  }
  if (type === 'phone') {
    return { ...base, phone: String(raw.phone || '').trim() };
  }
  // form / marketplace / partner_application / vendor_portal / rfp all share the same shape: a
  // URL the route is reached through. sourceUrl above already carries it, but formUrl is kept as
  // an explicit alias for callers that model it as a distinct concept from evidence provenance.
  return { ...base, formUrl: String(raw.formUrl || raw.form_url || raw.sourceUrl || raw.source_url || '').trim() };
}

/** True only for a route that (a) is typed 'email' and (b) passes the existing email-contact
 * eligibility checks (send-safety.mjs#contactEligibility: not free-mail, not a risky/prohibited
 * mailbox, domain-matched, officially published or positively verified). Every other route type
 * returns false here unconditionally -- it may still be a perfectly legitimate research-validated
 * route, just not one that can enter an email send queue. */
export function isEmailSendable(route, prospect = {}) {
  if (!route || route.type !== EMAIL_SENDABLE_ROUTE_TYPE) return false;
  return contactEligibility({ email: route.email, source: route.publishedOfficially ? 'website' : 'other', verified: route.publishedOfficially ? 'valid' : 'unverified' }, prospect).ok;
}
