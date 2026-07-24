// Proposal and payment-document factory (workstream 8). One builder per mission-named document
// type, all sharing one render pipeline (renderMarkdown/renderHtml/renderJson) that scans every
// free-text field for an unsupported claim (claims.mjs) before producing output -- a document
// that would guarantee revenue/leads/results, or that references a fake client, simply cannot be
// rendered, in any format, structurally.
import { id, now } from './store.mjs';
import { escapeHtml } from './utils.mjs';
import { assertNoUnsupportedClaims } from './claims.mjs';

export class ProposalError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProposalError';
    this.code = code;
  }
}

function textFieldsOf(doc) {
  const fields = [];
  const walk = value => {
    if (typeof value === 'string') fields.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(doc);
  return fields;
}

function assertDocumentGrounded(doc) {
  for (const field of textFieldsOf(doc)) assertNoUnsupportedClaims(field, doc.kind || 'document');
  return doc;
}

// ---- document builders ----

export function buildProposal({ opportunity, offer, lineItems = [] }) {
  if (!opportunity) throw new ProposalError('opportunity-required');
  if (!offer) throw new ProposalError('offer-required');
  const totalCents = lineItems.reduce((sum, item) => sum + (item.amountCents || 0), offer.priceCents || 0);
  return assertDocumentGrounded({
    id: id('proposal'), kind: 'proposal', opportunityId: opportunity.id,
    organizationDomain: opportunity.organizationDomain, offerKey: offer.offerKey || offer.key,
    summary: `A ${offer.siteCount || ''} site diagnostic scoped to lead-path evidence, delivered within ${offer.deliveryHoursMin || 12}-${offer.deliveryHoursMax || 24} hours of verified payment and inputs. No outcome is guaranteed; findings are evidence-backed observations only.`,
    lineItems, totalCents, createdAt: now()
  });
}

export function buildSow(proposal, { scopeItems = [], exclusions = [] } = {}) {
  return assertDocumentGrounded({
    id: id('sow'), kind: 'sow', proposalId: proposal.id, organizationDomain: proposal.organizationDomain,
    scopeItems: scopeItems.length ? scopeItems : ['Reachability, HTTPS, redirect, contact/phone/booking-link, form-presence, and CTA checks across the agreed site(s).'],
    exclusions: exclusions.length ? exclusions : ['No implementation/repair work is included in this scope.', 'No form submission, credential testing, or load testing is performed.'],
    createdAt: now()
  });
}

export function buildScopeAcceptance(sow) {
  return assertDocumentGrounded({ id: id('scopeaccept'), kind: 'scope_acceptance', sowId: sow.id, accepted: false, acceptedAt: null, acceptedBy: null, createdAt: now() });
}

export function buildInvoiceCopy(proposal, { dueDate = null } = {}) {
  return assertDocumentGrounded({ id: id('invoicecopy'), kind: 'invoice_copy', proposalId: proposal.id, amountCents: proposal.totalCents, currency: 'USD', dueDate, createdAt: now() });
}

export function buildPaymentRequestMessage(proposal, { paymentInstructionsNote = 'Payment instructions are provided separately, off-system, by the operator.' } = {}) {
  const body = `Total due: $${(proposal.totalCents / 100).toFixed(2)} USD for the ${(proposal.offerKey || '').replace(/_/g, ' ').toLowerCase()}. ${paymentInstructionsNote} Full credit toward implementation applies if you move forward after delivery. No outcome is guaranteed.`;
  return assertDocumentGrounded({ id: id('payreq'), kind: 'payment_request', proposalId: proposal.id, body, createdAt: now() });
}

export function buildOnboardingCard(project) {
  return assertDocumentGrounded({
    id: id('onboard'), kind: 'onboarding', diagnosticProjectId: project.id,
    steps: [
      'Confirm the exact site URLs to be checked.', 'Confirm the primary lead paths to prioritize (phone/form/booking/contact).',
      'Confirm branding assets for the delivered report (name, color, contact email).', 'Confirm a delivery contact and preferred format.'
    ], createdAt: now()
  });
}

export function buildAccessRequestCard(project, { requestedAccess = [] } = {}) {
  return assertDocumentGrounded({
    id: id('access'), kind: 'access_request', diagnosticProjectId: project.id,
    requestedAccess: requestedAccess.length ? requestedAccess : ['Read-only confirmation that the listed site URLs are correct and publicly reachable.'],
    note: 'No CMS, hosting, or admin credentials are required for the diagnostic itself.', createdAt: now()
  });
}

export function buildImplementationAuthorizationCard(sow, { marginFloorRate } = {}) {
  return assertDocumentGrounded({
    id: id('implauth'), kind: 'implementation_authorization', sowId: sow.id, authorized: false, authorizedBy: null, authorizedAt: null,
    requirements: ['Verified payment', 'Written, accepted scope', 'A backup taken before any change', 'A staging or safe-edit path', 'QA before delivery', 'A rollback plan'],
    marginFloorRate: marginFloorRate ?? null, createdAt: now()
  });
}

export function buildMonitoringConsentCard(monitoringOffer) {
  return assertDocumentGrounded({
    id: id('monconsent'), kind: 'monitoring_consent', monitoringOfferId: monitoringOffer.id, consented: false, consentedAt: null,
    terms: ['Inactive until explicit consent is recorded here.', 'Cancellable at any time.', 'A false-positive rate and owner-time threshold govern whether monitoring continues.'],
    createdAt: now()
  });
}

export function buildCancellationCard(subjectId, { reason = '' } = {}) {
  return assertDocumentGrounded({ id: id('cancel'), kind: 'cancellation', subjectId, reason, status: 'requested', createdAt: now() });
}
export function buildRefundCard(paymentId, { amountCents, reason = '' } = {}) {
  return assertDocumentGrounded({ id: id('refundcard'), kind: 'refund', paymentId, amountCents, reason, status: 'requested', createdAt: now() });
}
export function buildDisputeCard(paymentId, { reason = '' } = {}) {
  return assertDocumentGrounded({ id: id('disputecard'), kind: 'dispute', paymentId, reason, status: 'opened', createdAt: now() });
}

// ---- rendering ----

export function renderMarkdown(doc) {
  assertDocumentGrounded(doc);
  const lines = [`# ${doc.kind.replace(/_/g, ' ').toUpperCase()}`, ''];
  for (const [key, value] of Object.entries(doc)) {
    if (['id', 'kind'].includes(key)) continue;
    lines.push(`- **${key}**: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }
  return lines.join('\n');
}

export function renderHtml(doc, { printReady = true } = {}) {
  assertDocumentGrounded(doc);
  const rows = Object.entries(doc).filter(([key]) => !['id', 'kind'].includes(key))
    .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}</td></tr>`).join('');
  const printCss = printReady ? '@media print { .no-print { display:none } }' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.kind)}</title><style>${printCss} body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:24px;} table{width:100%;border-collapse:collapse;} td{border:1px solid #ddd;padding:6px;vertical-align:top;}</style></head><body><h1>${escapeHtml(doc.kind.replace(/_/g, ' '))}</h1><table>${rows}</table></body></html>`;
}

export function renderJson(doc) {
  assertDocumentGrounded(doc);
  return JSON.stringify(doc, null, 2);
}
