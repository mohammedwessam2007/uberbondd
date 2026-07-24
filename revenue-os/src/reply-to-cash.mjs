// 24/7 Continuous Revenue Core, section 8: Reply-to-Cash hardening.
//
// Ties reply.mjs's classification/grounded-drafting and proposal.mjs's document builders into one
// orchestrator, per the mission's own words: "Automatically classify routine replies, prepare
// grounded responses, create proposals, and prepare payment requests." Nothing here sends
// anything and nothing here ever confirms a payment or resolves money already in dispute -- this
// module never imports verifyPayment, applyOwnerException, refundPayment, or disputePayment from
// payments.mjs (see the capability-scan test), so it is structurally incapable of automatically
// negotiating unusual terms, granting a refund, resolving a dispute, accepting a legal commitment,
// or treating a screenshot/return URL as payment confirmation. Every artifact produced here is a
// draft the owner still approves through the existing approval.mjs/outbound.mjs path before it
// ever leaves the system.
//
// Payment identity, named explicitly by the mission: account holder Mohamed Wessam, PayPal.Me
// handle SaraWessam. "Do not place the payment link in the first message" is enforced structurally,
// not by convention: buildPaymentRequestMessage (proposal.mjs, the FIRST payment-related message a
// customer ever receives) never contains the link at all -- it says payment instructions follow
// separately (see this module's own capability-scan test on that function's output).
// buildPaymentLinkMessage below is a distinct, SECOND message type that refuses to build at all
// unless the caller proves a payment_request was already sent at an earlier timestamp, so there is
// no call sequence that produces the link as anyone's first message.
import { id, now } from './store.mjs';
import { classifyReply, draftGroundedReply, DRAFTABLE_CATEGORIES } from './reply.mjs';
import { buildProposal, buildPaymentRequestMessage } from './proposal.mjs';
import { assertNoUnsupportedClaims } from './claims.mjs';

export class ReplyToCashError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ReplyToCashError';
    this.code = code;
  }
}

export const PAYMENT_IDENTITY = Object.freeze({
  accountHolder: 'Mohamed Wessam', method: 'PayPal.Me', handle: 'SaraWessam', link: 'https://paypal.me/SaraWessam'
});

// The categories where a reply signals real payment readiness -- a narrower set than
// DRAFTABLE_CATEGORIES (which also covers proof_request/timing/implementation_interest/
// monitoring_interest, none of which warrant jumping straight to a proposal + payment request).
// 'negotiation' is deliberately excluded from both sets: reply.mjs's DRAFTABLE_CATEGORIES already
// refuses to draft for it, and it is not in this list either, so a reply asking for a discount
// produces no automated artifact of any kind -- the mission's "never automatically negotiate
// unusual terms" applies by omission, not by a special-cased check here.
export const CASH_READY_CATEGORIES = Object.freeze(['interested', 'pricing']);

/**
 * The second payment-related message -- never the first. Throws unless the caller supplies
 * `priorPaymentRequestSentAt`, an earlier real timestamp proving a payment_request document was
 * already sent for this proposal; there is no default and no way to omit this and still succeed.
 */
export function buildPaymentLinkMessage(proposal, { priorPaymentRequestSentAt, nowMs = Date.now() } = {}) {
  if (!proposal) throw new ReplyToCashError('proposal-required');
  if (!priorPaymentRequestSentAt) throw new ReplyToCashError('payment-link-requires-prior-payment-request', 'the payment link may never be the first message -- a payment_request must already have been sent');
  const sentMs = Date.parse(priorPaymentRequestSentAt);
  if (!Number.isFinite(sentMs)) throw new ReplyToCashError('invalid-prior-payment-request-timestamp');
  if (sentMs >= nowMs) throw new ReplyToCashError('prior-payment-request-not-actually-prior', 'priorPaymentRequestSentAt must be strictly before now');
  const body = `To complete payment of $${(proposal.totalCents / 100).toFixed(2)} USD: ${PAYMENT_IDENTITY.method} ${PAYMENT_IDENTITY.link} (account holder: ${PAYMENT_IDENTITY.accountHolder}). This is a convenience option -- any payment method already discussed works too. No outcome is guaranteed.`;
  assertNoUnsupportedClaims(body, 'payment_link');
  return { id: id('paylink'), kind: 'payment_link', proposalId: proposal.id, body, paymentIdentity: PAYMENT_IDENTITY, createdAt: now() };
}

/**
 * The one function that runs "classify -> draft -> (if cash-ready) propose -> request payment" in
 * one call. Every step below reuses an already-tested builder; nothing here re-implements
 * classification, drafting, claim-checking, or proposal math. Never throws for an unhandled
 * category -- a category outside both DRAFTABLE_CATEGORIES and CASH_READY_CATEGORIES (e.g.
 * 'negotiation', 'not_interested', 'complaint') simply produces no drafted artifact, which is the
 * correct, silent "do nothing automatically" outcome for those categories.
 */
export function prepareReplyToCash({ replyBody, opportunity, offer }) {
  if (!opportunity) throw new ReplyToCashError('opportunity-required');
  if (!offer) throw new ReplyToCashError('offer-required');
  const classification = classifyReply(replyBody);
  const result = { classification };

  if (DRAFTABLE_CATEGORIES.includes(classification.category)) {
    result.replyDraft = draftGroundedReply({ classification, opportunity, offer });
  }
  if (CASH_READY_CATEGORIES.includes(classification.category)) {
    const proposal = buildProposal({ opportunity, offer });
    result.proposal = proposal;
    result.paymentRequestMessage = buildPaymentRequestMessage(proposal);
  }
  return result;
}
