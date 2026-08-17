// Evidence-to-offer compiler. Pure, side-effect-free: reads existing
// prospect/campaign/config records and returns a structured offer packet.
// It never invents a price, a market benchmark, or a delivery cost -- every
// number either comes from cfg.revenue (owner-set) or is explicitly marked
// unconfigured/unknown rather than fabricated.

export const OFFER_COMPILER_POLICY_VERSION = 'offer-compiler-1.0.0';

const MIN_EVIDENCE_CONFIDENCE_DEFAULT = 0.6;

// deliverables/exclusions/timeline/founderMinutes are reasoned assumptions
// about this system's own automated delivery shape, not externally
// researched market prices. priceField/checkoutField point at the real
// cfg.revenue keys; a template with no priceField (agency white-label) has
// no configured price anywhere in this codebase and is reported as such.
const PRODUCT_TEMPLATES = {
  full: {
    name: 'Full Digital Opportunity Audit', priceField: 'fullAuditPrice', checkoutField: 'fullAuditCheckoutUrl',
    deliverables: ['Complete evidence-backed findings report', 'Prioritized issue list with screenshots', 'Quick-win recommendations'],
    exclusions: ['Implementation of fixes', 'Ongoing monitoring', 'Design or development work'],
    timelineDays: 1, founderMinutes: 5, nextRecurringOffer: 'strategy'
  },
  strategy: {
    name: 'Strategy Review', priceField: 'strategyAuditPrice', checkoutField: 'strategyAuditCheckoutUrl',
    deliverables: ['Full audit', 'Prioritized roadmap', 'One owner-delivered review call'],
    exclusions: ['Implementation', 'Ongoing monitoring'],
    timelineDays: 3, founderMinutes: 45, nextRecurringOffer: 'monitoring'
  },
  monitoring: {
    name: 'Recurring Monitoring', priceField: 'monitoringPrice', checkoutField: 'monitoringCheckoutUrl',
    deliverables: ['Recurring re-audit on the configured interval', 'Score trend', 'Change alerts'],
    exclusions: ['Implementation'],
    timelineDays: 30, founderMinutes: 5, recurring: true, nextRecurringOffer: 'implementation'
  },
  implementation: {
    name: 'Implementation Sprint', priceField: 'implementationFrom', priceIsFloor: true, bookingField: 'bookingUrl',
    deliverables: ['Scoped fix of the audited issue(s)', 'Verification pass after delivery'],
    exclusions: ['Ongoing monitoring unless separately purchased'],
    timelineDays: 14, founderMinutes: 240, nextRecurringOffer: 'monitoring'
  },
  agency: {
    name: 'Agency White-Label Package', priceField: null,
    deliverables: ['White-labeled audit reports for the agency\'s own clients', 'Co-branded report template'],
    exclusions: ['Direct client relationship management', 'Implementation'],
    timelineDays: null, founderMinutes: null, nextRecurringOffer: null
  }
};

function evidenceSufficiency(prospect, minConfidence) {
  const issue = prospect?.issue || {};
  const reasonCodes = [];
  if (!issue.title) reasonCodes.push('missing-problem-title');
  if (!issue.evidenceUrl || !issue.evidenceExcerpt) reasonCodes.push('incomplete-evidence');
  if (issue.safeForOutreach === false) reasonCodes.push('marked-unsafe');
  const confidence = Number(issue.confidence || 0);
  if (confidence < minConfidence) reasonCodes.push('confidence-below-threshold');
  return { sufficient: reasonCodes.length === 0, reasonCodes, confidence };
}

function checkoutReadiness(cfg, template) {
  if (template.bookingField) {
    const configured = Boolean(String(cfg.revenue?.[template.bookingField] || '').trim());
    return { mechanism: 'booking-call', configured, detail: configured ? 'booking URL configured' : 'no booking URL configured' };
  }
  if (!template.checkoutField) return { mechanism: 'none', configured: false, detail: 'no checkout mechanism exists in this codebase for this product' };
  const configured = Boolean(String(cfg.revenue?.[template.checkoutField] || '').trim());
  return { mechanism: 'hosted-checkout-link', configured, detail: configured ? 'checkout URL configured' : 'checkout URL not configured' };
}

function priceFor(cfg, template) {
  if (!template.priceField) return { amountUsd: null, status: 'NOT_CONFIGURED', floor: false };
  const value = Number(cfg.revenue?.[template.priceField] ?? NaN);
  if (!Number.isFinite(value)) return { amountUsd: null, status: 'NOT_CONFIGURED', floor: Boolean(template.priceIsFloor) };
  return { amountUsd: value, status: 'CONFIGURED', floor: Boolean(template.priceIsFloor) };
}

function deliveryEconomics(cfg, template, price) {
  const rateCents = Number(cfg.revenue?.founderHourlyRateCents || 0);
  if (!rateCents || template.founderMinutes == null || price.amountUsd == null) {
    return { estimatedCostUsd: null, grossMarginPercent: null, status: 'NOT_COMPUTED', reason: !rateCents ? 'founderHourlyRateCents not configured' : 'template or price incomplete' };
  }
  const costUsd = (rateCents / 100) * (template.founderMinutes / 60);
  const marginPercent = price.amountUsd > 0 ? Math.round(((price.amountUsd - costUsd) / price.amountUsd) * 100) : null;
  return { estimatedCostUsd: Math.round(costUsd * 100) / 100, grossMarginPercent: marginPercent, status: 'COMPUTED', reason: null };
}

function acceptanceCriteriaFor(product) {
  const base = ['Report is generated and reachable via the private report link', 'All findings map to captured, typed evidence'];
  if (product === 'strategy') base.push('Review call completed and confirmed by the buyer');
  if (product === 'monitoring') base.push('At least one recurring monitoring run has completed and is visible in report history');
  if (product === 'implementation') base.push('The scoped fix is verified live on the buyer\'s site by a follow-up crawl');
  if (product === 'agency') base.push('Co-branded report template approved by the agency before first delivery');
  return base;
}

// Compile a single offer packet for one product. Building "one primary
// offer first" is the caller's responsibility -- compilePrimaryOffer()
// below defaults to the lowest-friction product in the existing funnel.
export function compileOfferPacket({ prospect, campaign, cfg = {}, product = 'full', date = new Date(), minEvidenceConfidence } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();
  const template = PRODUCT_TEMPLATES[product];

  if (!prospect || !prospect.id) {
    return { ok: false, reason: 'malformed-input-prospect', policyVersion: OFFER_COMPILER_POLICY_VERSION, timestamp };
  }
  if (!template) {
    return { ok: false, reason: `unknown-product:${product}`, policyVersion: OFFER_COMPILER_POLICY_VERSION, timestamp };
  }

  const threshold = Number.isFinite(minEvidenceConfidence) ? minEvidenceConfidence : MIN_EVIDENCE_CONFIDENCE_DEFAULT;
  const evidence = evidenceSufficiency(prospect, threshold);
  const price = priceFor(cfg, template);
  const checkout = checkoutReadiness(cfg, template);
  const economics = deliveryEconomics(cfg, template, price);

  const killCondition = !evidence.sufficient
    ? `Do not offer: ${evidence.reasonCodes.join(', ')}`
    : 'Kill if confidence drops below threshold on re-audit, evidence is superseded, or the buyer requests removal.';

  return {
    ok: true,
    policyVersion: OFFER_COMPILER_POLICY_VERSION,
    timestamp,
    product,
    productName: template.name,
    buyer: {
      company: prospect.company || '', website: prospect.website || '',
      contactName: prospect.contactName || '', country: prospect.country || ''
    },
    verifiedProblem: {
      title: prospect.issue?.title || '', category: prospect.issue?.category || '',
      severity: prospect.issue?.severity ?? null
    },
    evidence: {
      url: prospect.issue?.evidenceUrl || '', excerpt: prospect.issue?.evidenceExcerpt || '',
      confidence: evidence.confidence, sufficient: evidence.sufficient, reasonCodes: evidence.reasonCodes
    },
    impact: {
      scoreTotal: prospect.score?.total ?? null, scoreTier: prospect.score?.tier ?? null,
      note: 'Derived from this system\'s own scoring engine, not an externally validated revenue-impact estimate.'
    },
    proposedOutcome: template.name,
    deliverables: template.deliverables,
    exclusions: template.exclusions,
    timelineDays: template.timelineDays,
    founderDeliveryMinutes: template.founderMinutes,
    deliveryEconomics: economics,
    price,
    acceptanceCriteria: acceptanceCriteriaFor(product),
    paymentRequirement: { required: true, checkoutReadiness: checkout },
    refundCancellationState: { configured: false, note: 'No refund/cancellation policy is configured anywhere in this codebase.' },
    nextRecurringOffer: template.nextRecurringOffer,
    recurring: Boolean(template.recurring),
    confidence: evidence.confidence,
    killCondition,
    ownerApprovalStatus: campaign?.approved ? 'approved' : 'pending-owner-approval',
    readyToOffer: evidence.sufficient && price.status === 'CONFIGURED' && checkout.configured
  };
}

// The lowest-friction, already-automated product in the existing funnel:
// the diagnostic. Build and prove one primary offer before compiling others.
export function compilePrimaryOffer(args = {}) {
  return compileOfferPacket({ ...args, product: 'full' });
}

export const OFFER_PRODUCTS = Object.keys(PRODUCT_TEMPLATES);
