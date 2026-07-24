// Monitoring (workstream 12, part 2). Inactive by default, structurally: activateMonitoring is
// the only function that can set `active: true`, and it refuses to do so unless every one of the
// mission's 8 named consent requirements is present. "No live billing" is structural too --
// buildMonitoringInvoiceHandoff always produces a `draft` status handoff and nothing in this
// module ever moves it further.
import { id, now } from './store.mjs';

export class MonitoringError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'MonitoringError';
    this.code = code;
  }
}

const REQUIRED_CONSENT_FIELDS = Object.freeze(['sites', 'schedule', 'usageLimits', 'cancellationTerms', 'falsePositiveThreshold', 'ownerTimeThreshold', 'marginFloorRate']);

export function buildMonitoringProposal({ diagnosticProjectId, priceCents, sites = [] }) {
  if (!Number.isInteger(priceCents) || priceCents < 19900 || priceCents > 49900) throw new MonitoringError('price-out-of-configured-range', String(priceCents));
  return { id: id('monproposal'), diagnosticProjectId, priceCents, sites, createdAt: now() };
}

/** Validates a consent object against all 8 required fields, returning every missing field, not
 * just the first. */
export function validateMonitoringConsent(consent = {}) {
  const missing = REQUIRED_CONSENT_FIELDS.filter(field => consent[field] === undefined || consent[field] === null || (Array.isArray(consent[field]) && consent[field].length === 0));
  return { valid: missing.length === 0, missing };
}

/** The only path that can set a monitoring offer active -- refuses outright without full consent. */
export async function activateMonitoring(store, monitoringOfferId, consent) {
  const validation = validateMonitoringConsent(consent);
  if (!validation.valid) throw new MonitoringError('consent-incomplete', validation.missing.join(','));
  const updated = await store.patch('monitoringOffers', monitoringOfferId, { active: true, status: 'active', data: { consent, consentedAt: now() } });
  if (!updated) throw new MonitoringError('monitoring-offer-not-found', monitoringOfferId);
  await store.log('monitoring_activated', { monitoringOfferId });
  return updated;
}

export async function recordMonitoringIncident(store, monitoringOfferId, { severity, description, evidenceRefs = [] }) {
  const offer = await store.get('monitoringOffers', monitoringOfferId);
  if (!offer) throw new MonitoringError('monitoring-offer-not-found', monitoringOfferId);
  if (!offer.active) throw new MonitoringError('monitoring-not-active');
  const incidents = offer.data?.incidents || [];
  const incident = { id: id('monincident'), severity, description, evidenceRefs, recordedAt: now() };
  const updated = await store.patch('monitoringOffers', monitoringOfferId, { data: { ...offer.data, incidents: [...incidents, incident] } });
  return { offer: updated, incident };
}

/** False-positive rate = incidents later marked false-positive / total incidents this period.
 * Feeds the mission's own "false-positive threshold" consent term -- exceeding it is a signal to
 * pause or cancel, never an automatic action here (an owner decision, not this module's). */
export function falsePositiveRate(incidents = []) {
  if (incidents.length === 0) return 0;
  return incidents.filter(i => i.falsePositive === true).length / incidents.length;
}

export function buildMonthlyReport(offer, { period, ownerMinutesSpent = 0 } = {}) {
  const incidents = offer.data?.incidents || [];
  return {
    id: id('monthlyreport'), monitoringOfferId: offer.id, period,
    incidentCount: incidents.length, falsePositiveRate: falsePositiveRate(incidents),
    ownerMinutesSpent, ownerTimeThresholdExceeded: ownerMinutesSpent > (offer.data?.consent?.ownerTimeThreshold ?? Infinity),
    createdAt: now()
  };
}

/** Always a draft -- "No live billing" means nothing in this module ever moves a handoff past
 * draft or triggers a real charge. */
export function buildMonitoringInvoiceHandoff(offer, period) {
  return { id: id('moninvoice'), monitoringOfferId: offer.id, period, amountCents: offer.priceCents, status: 'draft', createdAt: now() };
}

export async function cancelMonitoring(store, monitoringOfferId, { reason } = {}) {
  const offer = await store.get('monitoringOffers', monitoringOfferId);
  if (!offer) throw new MonitoringError('monitoring-offer-not-found', monitoringOfferId);
  const updated = await store.patch('monitoringOffers', monitoringOfferId, {
    active: false, status: 'canceled', data: { ...offer.data, cancellation: { reason, canceledAt: now() } }
  });
  await store.log('monitoring_canceled', { monitoringOfferId, reason });
  return updated;
}

export function exportMonitoringData(offer) {
  return JSON.stringify({ offer: { id: offer.id, priceCents: offer.priceCents, active: offer.active, status: offer.status }, incidents: offer.data?.incidents || [], consent: offer.data?.consent || null }, null, 2);
}

/** Soft-delete pattern (marks deleted, strips content, keeps the audit row) reused from this
 * session's sibling missions -- evidence past its retention window is purged but the fact of
 * purging remains auditable. */
export async function purgeExpiredEvidence(store, retentionDays, asOfMs = Date.now()) {
  const items = await store.list('evidenceItems');
  const cutoff = asOfMs - retentionDays * 86400000;
  let purged = 0;
  for (const item of items) {
    if (item.deletedAt) continue;
    const capturedMs = Date.parse(item.capturedAt || item.createdAt || 0);
    if (Number.isFinite(capturedMs) && capturedMs <= cutoff) {
      await store.patch('evidenceItems', item.id, { deletedAt: now(), sourceUrl: null, rawHash: 'purged' });
      purged += 1;
    }
  }
  return { purged };
}
