import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProposal, buildSow, buildScopeAcceptance, buildInvoiceCopy, buildPaymentRequestMessage,
  buildOnboardingCard, buildAccessRequestCard, buildImplementationAuthorizationCard,
  buildMonitoringConsentCard, buildCancellationCard, buildRefundCard, buildDisputeCard,
  renderMarkdown, renderHtml, renderJson, ProposalError
} from '../../revenue-os/src/proposal.mjs';
import { findUnsupportedClaims } from '../../revenue-os/src/claims.mjs';

const OPPORTUNITY = { id: 'o1', organizationDomain: 'agency-x.example.com' };
const OFFER = { offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', priceCents: 25000, siteCount: 3, deliveryHoursMin: 12, deliveryHoursMax: 24 };

test('the required disclaimer language ("no outcome is guaranteed") does not itself trip the unsupported-claim guard', () => {
  assert.equal(findUnsupportedClaims('No outcome is guaranteed; findings are evidence-backed observations only.').length, 0);
});

test('a real guarantee/promise claim is still caught by the same guard', () => {
  assert.ok(findUnsupportedClaims('We guarantee a 10x ROI and promise results.').length > 0);
});

test('buildProposal requires an opportunity and an offer, and computes a real total', () => {
  assert.throws(() => buildProposal({ offer: OFFER }), ProposalError);
  assert.throws(() => buildProposal({ opportunity: OPPORTUNITY }), ProposalError);
  const proposal = buildProposal({ opportunity: OPPORTUNITY, offer: OFFER, lineItems: [{ amountCents: 5000, description: 'extra site' }] });
  assert.equal(proposal.totalCents, 30000);
  assert.equal(proposal.kind, 'proposal');
});

test('buildProposal refuses a line item containing an unsupported claim', () => {
  assert.throws(() => buildProposal({ opportunity: OPPORTUNITY, offer: OFFER, lineItems: [{ amountCents: 100, description: 'We guarantee 10x more leads' }] }));
});

test('the full document chain builds without throwing: proposal -> SOW -> scope acceptance -> invoice -> payment request', () => {
  const proposal = buildProposal({ opportunity: OPPORTUNITY, offer: OFFER });
  const sow = buildSow(proposal);
  assert.equal(sow.kind, 'sow');
  const acceptance = buildScopeAcceptance(sow);
  assert.equal(acceptance.accepted, false);
  const invoice = buildInvoiceCopy(proposal);
  assert.equal(invoice.amountCents, proposal.totalCents);
  const payReq = buildPaymentRequestMessage(proposal);
  assert.ok(payReq.body.includes('250.00'));
  assert.ok(payReq.body.includes('No outcome is guaranteed'));
});

test('onboarding/access-request/implementation-authorization/monitoring-consent cards all build with sane defaults', () => {
  const onboarding = buildOnboardingCard({ id: 'proj1' });
  assert.ok(onboarding.steps.length > 0);
  const access = buildAccessRequestCard({ id: 'proj1' });
  assert.ok(access.requestedAccess.length > 0);
  const sow = buildSow(buildProposal({ opportunity: OPPORTUNITY, offer: OFFER }));
  const auth = buildImplementationAuthorizationCard(sow, { marginFloorRate: 0.3 });
  assert.equal(auth.authorized, false);
  assert.equal(auth.marginFloorRate, 0.3);
  const consent = buildMonitoringConsentCard({ id: 'mon1' });
  assert.equal(consent.consented, false);
});

test('cancellation/refund/dispute cards carry the right subject reference', () => {
  const cancel = buildCancellationCard('proj1', { reason: 'client changed mind' });
  assert.equal(cancel.subjectId, 'proj1');
  const refund = buildRefundCard('pay1', { amountCents: 10000, reason: 'partial rollback' });
  assert.equal(refund.paymentId, 'pay1');
  const dispute = buildDisputeCard('pay1', { reason: 'chargeback filed' });
  assert.equal(dispute.paymentId, 'pay1');
});

test('renderMarkdown/renderHtml/renderJson all produce real, parseable output for the same document', () => {
  const proposal = buildProposal({ opportunity: OPPORTUNITY, offer: OFFER });
  const md = renderMarkdown(proposal);
  assert.match(md, /^# PROPOSAL/);
  const html = renderHtml(proposal, { printReady: true });
  assert.match(html, /<style>@media print/);
  assert.match(html, /<table>/);
  const json = renderJson(proposal);
  assert.equal(JSON.parse(json).id, proposal.id);
});

test('renderHtml escapes hostile content in a document field rather than injecting it raw', () => {
  const doc = { id: 'x', kind: 'onboarding', note: '<script>alert(1)</script>' };
  const html = renderHtml(doc);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
