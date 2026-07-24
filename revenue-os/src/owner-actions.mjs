// Owner-action queue (workstream 14). Every action carries the mission's exact 6 named fields --
// target, minutes, cost, proof required, default, urgency -- so an owner never has to guess what
// an action actually involves before deciding on it. "Reducing Mohamed to identity-bound
// approvals" (the mission's own closing line) means this queue is the whole interface between the
// automation and the one thing it cannot do without a human: the 7 approval-shaped decisions
// (payment exceptions, ambiguous authorization, blocked items, etc.) that appear here.
import { id } from './store.mjs';
import { clamp } from './utils.mjs';

/** Pending approvals, open blockers, and payments stuck in PENDING_VERIFICATION are the three
 * concrete sources of owner actions this package currently generates -- each mapped to the
 * mission's 6-field shape. */
export async function compileOwnerActionQueue(store) {
  const [pendingApprovals, openBlockers, pendingPayments] = await Promise.all([
    store.list('approvals', { filters: { status: 'pending' } }),
    store.list('blockers', { filters: { status: 'open' } }),
    store.list('payments', { filters: { status: 'PENDING_VERIFICATION' } })
  ]);

  const actions = [
    ...pendingApprovals.map(approval => ({
      id: id('owneraction'), subjectType: 'approval', subjectId: approval.id,
      target: `Review outbound approval for ${approval.data?.organizationDomain || 'unknown organization'}`,
      minutes: 1, costCents: 0, proofRequired: 'source URL + published evidence already in the packet', default: 'reject on no action before expiry', urgency: hoursUntil(approval.expiresAt) < 24 ? 'high' : 'medium'
    })),
    ...openBlockers.map(blocker => ({
      id: id('owneraction'), subjectType: 'blocker', subjectId: blocker.id,
      target: `Resolve blocker: ${blocker.code} (${blocker.workstream})`,
      minutes: 5, costCents: 0, proofRequired: 'blocker detail record', default: 'remains blocked until resolved', urgency: 'high'
    })),
    ...pendingPayments.map(payment => ({
      id: id('owneraction'), subjectType: 'payment', subjectId: payment.id,
      target: `Verify or apply an owner exception to payment ${payment.id}`,
      minutes: 3, costCents: 0, proofRequired: 'bank/PayPal/Payoneer evidence reference', default: 'stays PENDING_VERIFICATION indefinitely', urgency: 'medium'
    }))
  ];
  return actions.sort((a, b) => urgencyRank(b.urgency) - urgencyRank(a.urgency));
}

function urgencyRank(urgency) { return { high: 3, medium: 2, low: 1 }[urgency] || 0; }
function hoursUntil(isoString) { return isoString ? (Date.parse(isoString) - Date.now()) / 3600000 : Infinity; }

/** Home screen's "current verdict" -- one sentence, derived from real counts, never a canned
 * string. */
export function computeVerdict({ pendingApprovals, openBlockers, pendingPayments, activeMonitoring }) {
  if (openBlockers > 0) return `${openBlockers} blocker(s) need attention before automation can continue.`;
  if (pendingApprovals > 0) return `${pendingApprovals} outbound approval(s) awaiting your review.`;
  if (pendingPayments > 0) return `${pendingPayments} payment(s) awaiting verification.`;
  if (activeMonitoring > 0) return `${activeMonitoring} monitoring subscription(s) active and running.`;
  return 'No owner action currently required.';
}
