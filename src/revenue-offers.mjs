// Canonical public revenue ladder. The free snapshot is the lead generator;
// the four paid routes are the commercial offers. This module contains
// presentation and routing metadata only. It never proves payment, demand, or
// delivery and it never creates a checkout or booking URL.

export const REVENUE_OFFER_CATALOG_VERSION = 'uberbond.revenue-offers-1.0.0';

const DEFINITIONS = Object.freeze([
  {
    id: 'snapshot',
    name: 'Opportunity Snapshot',
    kind: 'lead-generator',
    billing: 'free',
    description: 'One evidence-backed opportunity, score, screenshot, and next-step recommendation.',
    deliverables: ['Private report link', 'Desktop and mobile evidence', 'One supported finding'],
    cta: 'Run free snapshot'
  },
  {
    id: 'full',
    name: 'Full Digital Audit',
    kind: 'paid',
    billing: 'one-time',
    priceField: 'fullAuditPrice',
    checkoutField: 'fullAuditCheckoutUrl',
    description: 'Unlock every supported observation, risk flag, and prioritized service recommendation.',
    deliverables: ['Complete evidence gallery', 'Prioritized findings', 'Printable report'],
    cta: 'Unlock full audit'
  },
  {
    id: 'strategy',
    name: 'Strategy Audit',
    kind: 'paid',
    billing: 'one-time',
    priceField: 'strategyAuditPrice',
    checkoutField: 'strategyAuditCheckoutUrl',
    description: 'Add human review, prioritization, and an implementation roadmap.',
    deliverables: ['Automated evidence review', 'Prioritized roadmap', 'Strategy discussion'],
    cta: 'Request strategy audit'
  },
  {
    id: 'implementation',
    name: 'Implementation Sprint',
    kind: 'paid',
    billing: 'scoped-project',
    priceField: 'implementationFrom',
    bookingField: 'bookingUrl',
    priceIsFloor: true,
    description: 'Design and build the highest-impact fix identified by the evidence.',
    deliverables: ['Scoped implementation', 'Verification pass', 'Handoff notes'],
    cta: 'Request implementation'
  },
  {
    id: 'monitoring',
    name: 'UberBond Watch',
    kind: 'paid',
    billing: 'monthly',
    priceField: 'monitoringPrice',
    checkoutField: 'monitoringCheckoutUrl',
    description: 'Scheduled re-audits that preserve change history and surface new opportunities.',
    deliverables: ['Monthly recheck', 'Change history', 'Priority alerts'],
    cta: 'Start monitoring'
  }
]);

const PAID_IDS = new Set(DEFINITIONS.filter(item => item.kind === 'paid').map(item => item.id));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function configuredValue(revenue, field) {
  return field ? String(revenue?.[field] || '').trim() : '';
}

function numericValue(revenue, field) {
  if (!field) return null;
  const value = Number(revenue?.[field]);
  return Number.isFinite(value) ? value : null;
}

export function isRevenueOfferId(value, { paidOnly = false } = {}) {
  const id = String(value || '').trim().toLowerCase();
  return (paidOnly ? PAID_IDS : new Set(DEFINITIONS.map(item => item.id))).has(id);
}

export function buildRevenueOfferCatalog(revenue = {}) {
  return DEFINITIONS.map(definition => {
    const price = numericValue(revenue, definition.priceField);
    const route = definition.checkoutField
      ? (configuredValue(revenue, definition.checkoutField) ? 'checkout' : 'request')
      : definition.bookingField
        ? (configuredValue(revenue, definition.bookingField) ? 'booking' : 'request')
        : 'snapshot';
    return {
      id: definition.id,
      name: definition.name,
      kind: definition.kind,
      billing: definition.billing,
      description: definition.description,
      deliverables: [...definition.deliverables],
      cta: definition.cta,
      price,
      priceIsFloor: Boolean(definition.priceIsFloor),
      route,
      configured: route === 'snapshot' || route !== 'request',
      evidenceClass: 'CONFIGURED_PRODUCT_METADATA_NOT_PAYMENT_OR_REVENUE_PROOF'
    };
  });
}

export function getRevenueOffer(value, revenue = {}) {
  const id = String(value || '').trim().toLowerCase();
  return buildRevenueOfferCatalog(revenue).find(item => item.id === id) || null;
}

export function revenueOfferDefinitions() {
  return clone(DEFINITIONS);
}

export const REVENUE_OFFER_IDS = Object.freeze(DEFINITIONS.map(item => item.id));
export const PAID_REVENUE_OFFER_IDS = Object.freeze([...PAID_IDS]);
