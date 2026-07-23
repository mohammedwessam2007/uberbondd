export const LIFECYCLE_STATES = Object.freeze([
  'DISCOVERED', 'CRAWLED', 'EVIDENCE_VERIFIED', 'QUALIFIED', 'DRAFT_READY', 'POLICY_ELIGIBLE',
  'SEND_RESERVED', 'SENT', 'REPLIED', 'NO_REPLY', 'FOLLOWUP_ELIGIBLE', 'PROPOSAL_READY',
  'INVOICE_READY', 'PAID', 'ONBOARDING', 'FULFILLMENT_ACTIVE', 'QA', 'DELIVERED',
  'MONITORING_OFFERED', 'MONITORING_ACTIVE', 'CLOSED'
]);

export const TERMINAL_STATES = Object.freeze(['REJECTED', 'SUPPRESSED', 'FAILED', 'REFUNDED', 'CHARGEBACK', 'CANCELLED']);

export const ALL_STATES = Object.freeze([...LIFECYCLE_STATES, ...TERMINAL_STATES]);
const STATE_SET = new Set(ALL_STATES);
const TERMINAL_SET = new Set(TERMINAL_STATES);

// Every non-terminal state can additionally transition to REJECTED, SUPPRESSED, or FAILED as
// appropriate for that stage; those universal edges are added programmatically below rather than
// repeated on every row, so the table below only lists each state's *forward* progression plus any
// stage-specific terminal it can also reach (REFUNDED/CHARGEBACK/CANCELLED only apply from the
// payment/fulfillment/monitoring stages where they are meaningful).
const FORWARD_TRANSITIONS = Object.freeze({
  DISCOVERED: ['CRAWLED'],
  CRAWLED: ['EVIDENCE_VERIFIED'],
  EVIDENCE_VERIFIED: ['QUALIFIED'],
  QUALIFIED: ['DRAFT_READY'],
  DRAFT_READY: ['POLICY_ELIGIBLE'],
  POLICY_ELIGIBLE: ['SEND_RESERVED'],
  SEND_RESERVED: ['SENT'],
  SENT: ['REPLIED', 'NO_REPLY'],
  NO_REPLY: ['FOLLOWUP_ELIGIBLE', 'CLOSED'],
  FOLLOWUP_ELIGIBLE: ['SEND_RESERVED'],
  REPLIED: ['PROPOSAL_READY'],
  PROPOSAL_READY: ['INVOICE_READY'],
  INVOICE_READY: ['PAID', 'CANCELLED'],
  PAID: ['ONBOARDING', 'REFUNDED', 'CHARGEBACK'],
  ONBOARDING: ['FULFILLMENT_ACTIVE', 'CANCELLED'],
  FULFILLMENT_ACTIVE: ['QA', 'CANCELLED'],
  QA: ['DELIVERED', 'FULFILLMENT_ACTIVE'],
  DELIVERED: ['MONITORING_OFFERED', 'CLOSED'],
  MONITORING_OFFERED: ['MONITORING_ACTIVE', 'CLOSED'],
  MONITORING_ACTIVE: ['CLOSED', 'CANCELLED', 'REFUNDED']
});

// States before a reply exists can end in REJECTED (evidence/qualification/quality gate failed),
// SUPPRESSED (unsubscribe/bounce/complaint/existing suppression), or FAILED (a non-retryable
// processing failure). REPLIED onward can additionally end in REJECTED (prospect says no) or
// SUPPRESSED (reply itself is a bounce/complaint/unsubscribe), but FAILED no longer applies once a
// human reply exists.
const PRE_REPLY_STATES = new Set(['DISCOVERED', 'CRAWLED', 'EVIDENCE_VERIFIED', 'QUALIFIED', 'DRAFT_READY', 'POLICY_ELIGIBLE', 'SEND_RESERVED', 'SENT', 'NO_REPLY', 'FOLLOWUP_ELIGIBLE']);
const POST_REPLY_STATES = new Set(['REPLIED', 'PROPOSAL_READY', 'INVOICE_READY']);

const TRANSITIONS = (() => {
  const table = {};
  for (const state of LIFECYCLE_STATES) {
    const forward = new Set(FORWARD_TRANSITIONS[state] || []);
    if (PRE_REPLY_STATES.has(state)) { forward.add('REJECTED'); forward.add('SUPPRESSED'); forward.add('FAILED'); }
    if (POST_REPLY_STATES.has(state)) { forward.add('REJECTED'); forward.add('SUPPRESSED'); }
    table[state] = forward;
  }
  for (const terminal of TERMINAL_STATES) table[terminal] = new Set();
  return table;
})();

export class StateMachineError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'StateMachineError';
    this.code = code;
  }
}

export function isValidState(state) {
  return STATE_SET.has(state);
}

export function isTerminalState(state) {
  return TERMINAL_SET.has(state);
}

export function allowedTransitions(state) {
  if (!STATE_SET.has(state)) throw new StateMachineError('lifecycle-state-unknown');
  return [...(TRANSITIONS[state] || [])];
}

/**
 * The single source of truth for whether a lifecycle transition is legal (spec section N). Every
 * caller that moves a prospect/delivery/subscription across this vocabulary -- including the
 * control center's display projection -- must go through this rather than re-deriving the rules.
 */
export function canTransition(from, to) {
  if (!STATE_SET.has(from) || !STATE_SET.has(to)) return false;
  return (TRANSITIONS[from] || new Set()).has(to);
}

export function assertTransition(from, to) {
  if (!STATE_SET.has(from)) throw new StateMachineError('lifecycle-state-unknown', `Unknown lifecycle state: ${from}`);
  if (!STATE_SET.has(to)) throw new StateMachineError('lifecycle-state-unknown', `Unknown lifecycle state: ${to}`);
  if (isTerminalState(from)) throw new StateMachineError('lifecycle-terminal-state', `${from} is terminal; no further transitions are allowed`);
  if (!canTransition(from, to)) throw new StateMachineError('lifecycle-transition-forbidden', `${from} -> ${to} is not an allowed transition`);
  return true;
}

/**
 * Projects the existing acquisitionStatus/deliveryStatus/subscription vocabulary the running
 * system already writes (see src/cockpit.mjs#deriveAcquisitionStatus and src/delivery.mjs) onto
 * this formal lifecycle vocabulary, so the control center can display one consistent state without
 * requiring a data migration of any already-mature, already-tested collection.
 */
export function projectLifecycleState(prospect = {}, context = {}) {
  const source = String(prospect.acquisitionStatus || prospect.status || '').toLowerCase();
  const deliveryStatus = String(context.delivery?.status || '').toLowerCase();
  const subscriptionStatus = String(context.subscription?.status || '').toLowerCase();
  if (subscriptionStatus === 'active' || subscriptionStatus === 'on_trial' || subscriptionStatus === 'trialing') return 'MONITORING_ACTIVE';
  if (['cancelled', 'payment_failed'].includes(subscriptionStatus)) return 'CANCELLED';
  if (deliveryStatus === 'delivered') return context.testimonialRequested || context.monitoringOffered ? 'MONITORING_OFFERED' : 'DELIVERED';
  if (['delivery-queued', 'awaiting-inputs', 'ready'].includes(deliveryStatus)) return 'ONBOARDING';
  if (['in-progress', 'ready-for-review'].includes(deliveryStatus)) return context.qaInProgress ? 'QA' : 'FULFILLMENT_ACTIVE';
  if (deliveryStatus === 'cancelled') return 'CANCELLED';
  const paymentState = String(context.order?.paymentState || context.order?.status || prospect.paymentStatus || '').toLowerCase();
  if (paymentState === 'paid') return 'PAID';
  if (paymentState === 'refunded') return 'REFUNDED';
  if (paymentState === 'disputed' || paymentState === 'chargeback') return 'CHARGEBACK';
  if (paymentState === 'checkout-sent' || source === 'checkout-sent') return 'INVOICE_READY';
  if (source === 'proposal-ready') return 'PROPOSAL_READY';
  if (['complaint', 'bounced', 'unsubscribed'].includes(source)) return 'SUPPRESSED';
  if (['interested', 'objection', 'not-interested', 'replied'].includes(source)) return source === 'not-interested' ? 'REJECTED' : 'REPLIED';
  if (source === 'sent') return prospect.nextFollowupAt ? 'FOLLOWUP_ELIGIBLE' : 'NO_REPLY';
  if (source === 'scheduled') return 'SEND_RESERVED';
  if (source === 'approved') return 'POLICY_ELIGIBLE';
  if (source === 'needs-review' || source === 'draft-ready') return 'DRAFT_READY';
  if (source === 'qualified' || source === 'contact-found') return 'QUALIFIED';
  if (source === 'rejected') return 'REJECTED';
  if (source === 'audit-failed') return 'FAILED';
  if (source === 'crawling') return 'CRAWLED';
  return 'DISCOVERED';
}
