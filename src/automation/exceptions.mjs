const PRIORITY = Object.freeze({ P0: 0, P1: 1, P2: 2 });
const SLA_HOURS = Object.freeze({ P0: 4, P1: 24, P2: 72 });

function slaAt(createdAt, priority) {
  const base = Date.parse(createdAt || Date.now());
  return new Date((Number.isFinite(base) ? base : Date.now()) + SLA_HOURS[priority] * 3600000).toISOString();
}

function item({ id, category, priority, reason, evidence, exactAction, createdAt, overdue = false }) {
  return { id, category, priority, priorityRank: PRIORITY[priority], reason, evidence, exactAction, createdAt, slaAt: slaAt(createdAt, priority), overdue };
}

/**
 * Owner exception model (spec section L): a single priority-ranked, SLA-timestamped queue over
 * every subsystem an owner is meant to handle -- everything else in the automated loop is meant
 * to run without them. This is a pure derivation over already-loaded collections (same shape as
 * src/cockpit.mjs's `attention` bucket, which this generalizes and extends to cover payments,
 * fulfillment, monitoring, and kill switches, not just outreach replies).
 */
export function buildExceptionQueue(input = {}, now = new Date()) {
  const rows = [];

  for (const reply of input.replies || []) {
    const label = String(reply.classification?.label || '').toLowerCase();
    if (['interested', 'meeting-requested', 'asks-for-information'].includes(label)) {
      rows.push(item({
        id: `reply:${reply.id}`, category: 'positive_reply', priority: 'P1',
        reason: `Positive reply from prospect ${reply.prospectId || 'unmatched'}`,
        evidence: { replyId: reply.id, excerpt: String(reply.body || '').slice(0, 300) },
        exactAction: 'Review the reply, send a personal reply from the owner. Do not auto-negotiate price or scope.',
        createdAt: reply.receivedAt || reply.createdAt
      }));
    } else if (reply.classification?.humanReviewRequired || !reply.prospectId) {
      rows.push(item({
        id: `reply:${reply.id}`, category: 'reply_review', priority: 'P1',
        reason: reply.prospectId ? 'Reply needs human classification review' : 'Unmatched or ambiguous inbox reply',
        evidence: { replyId: reply.id, matchConfidence: reply.match?.confidence ?? null },
        exactAction: 'Manually classify or match this reply to a prospect.',
        createdAt: reply.receivedAt || reply.createdAt
      }));
    } else if (['legal', 'legal-threat', 'complaint'].includes(label)) {
      rows.push(item({
        id: `reply:${reply.id}:legal`, category: 'legal_compliance', priority: 'P0',
        reason: `Reply flagged for legal/compliance review (${label})`,
        evidence: { replyId: reply.id },
        exactAction: 'Escalate to legal/compliance review before any further contact with this prospect.',
        createdAt: reply.receivedAt || reply.createdAt
      }));
    }
  }

  for (const order of input.orders || []) {
    const state = String(order.paymentState || order.status || '').toLowerCase();
    if (['disputed'].includes(state)) {
      rows.push(item({
        id: `order:${order.id}`, category: 'payment_mismatch', priority: 'P0',
        reason: `Payment dispute on order ${order.id}`,
        evidence: { orderId: order.id, amountCents: order.amountCents, currency: order.currency },
        exactAction: 'Investigate the dispute with the payment provider. Do not proceed with fulfillment until resolved.',
        createdAt: order.updatedAt || order.createdAt
      }));
    } else if (['refunded', 'chargeback'].includes(state)) {
      rows.push(item({
        id: `order:${order.id}:refund`, category: state === 'chargeback' ? 'chargeback' : 'refund', priority: 'P0',
        reason: `${state === 'chargeback' ? 'Chargeback' : 'Refund'} recorded on order ${order.id}`,
        evidence: { orderId: order.id, amountCents: order.amountCents, currency: order.currency },
        exactAction: 'Confirm the refund/chargeback with the provider and halt or roll back the fulfillment lane.',
        createdAt: order.updatedAt || order.createdAt
      }));
    }
  }

  for (const task of input.fulfillmentTasks || []) {
    const overdue = ['assigned', 'in-progress', 'blocked'].includes(task.status) && Date.parse(task.slaDueAt || 0) < now.getTime();
    if (task.status === 'blocked') {
      const isCredential = (task.onboardingChecklist || []).some(entry => entry.status === 'blocked' || (entry.id === 'credential-request-sent' && entry.status !== 'completed'));
      rows.push(item({
        id: `fulfillment:${task.id}`, category: isCredential ? 'credential_issue' : 'fulfillment_incident', priority: 'P1',
        reason: `Fulfillment task ${task.id} is blocked (lane: ${task.lane})`,
        evidence: { taskId: task.id, deliveryId: task.deliveryId, lane: task.lane },
        exactAction: isCredential
          ? 'Follow up with the customer for the missing access/credentials on the checklist.'
          : 'Unblock the fulfillment task or reassign the lane.',
        createdAt: task.updatedAt || task.createdAt
      }));
    } else if (overdue) {
      rows.push(item({
        id: `fulfillment:${task.id}:overdue`, category: 'fulfillment_incident', priority: 'P1',
        reason: `Fulfillment task ${task.id} is past its SLA (due ${task.slaDueAt})`,
        evidence: { taskId: task.id, deliveryId: task.deliveryId, lane: task.lane, slaDueAt: task.slaDueAt },
        exactAction: 'Check in with the assigned lane and either complete or reassign the task today.',
        createdAt: task.updatedAt || task.createdAt, overdue: true
      }));
    }
  }

  for (const subscription of input.subscriptions || []) {
    if (subscription.status === 'payment_failed') {
      rows.push(item({
        id: `subscription:${subscription.id}`, category: 'payment_mismatch', priority: 'P1',
        reason: `Monitoring subscription ${subscription.id} has a failed payment`,
        evidence: { subscriptionId: subscription.id, prospectId: subscription.prospectId },
        exactAction: 'Contact the customer about the failed monitoring payment before the next scheduled check.',
        createdAt: subscription.paymentFailedAt || subscription.updatedAt
      }));
    }
  }

  for (const health of input.senderHealth || []) {
    if (health.paused) {
      rows.push(item({
        id: `sender:${health.inbox}`, category: 'kill_switch_recovery', priority: 'P0',
        reason: `Sender inbox ${health.inbox} is paused (${health.pauseReason || 'threshold breach'})`,
        evidence: { inbox: health.inbox, hardBouncesToday: health.hardBouncesToday, complaintsToday: health.complaintsToday },
        exactAction: 'Investigate the bounce/complaint spike before resuming this inbox.',
        createdAt: health.lastEventAt || health.updatedAt
      }));
    }
  }

  for (const job of input.deadLetterJobs || []) {
    rows.push(item({
      id: `job:${job.id}`, category: 'kill_switch_recovery', priority: 'P1',
      reason: `Job ${job.type} moved to the dead-letter queue after repeated failures`,
      evidence: { jobId: job.id, type: job.type, attempts: job.attempts, lastError: job.lastError },
      exactAction: 'Diagnose the failure and requeue from the dead-letter queue, or resolve manually.',
      createdAt: job.updatedAt || job.createdAt
    }));
  }

  return rows.sort((left, right) => left.priorityRank - right.priorityRank || Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0));
}

export function exceptionQueueSummary(rows = []) {
  const byPriority = { P0: 0, P1: 0, P2: 0 };
  const byCategory = {};
  for (const row of rows) {
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  }
  return { total: rows.length, byPriority, byCategory, overdue: rows.filter(row => row.overdue).length };
}
