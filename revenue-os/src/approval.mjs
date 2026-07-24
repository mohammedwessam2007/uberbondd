// Owner approval packets (workstream 5). A packet is the *only* thing an owner reviews before any
// outbound action -- everything it needs to decide in under 60 seconds is assembled here, once,
// rather than requiring the owner to cross-reference other screens. No outbound action can happen
// without an approval in `approved` status (enforced by outbound.mjs, not by convention).
import { id, now } from './store.mjs';
import { sha256Hex } from './utils.mjs';

export class ApprovalError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
  }
}

const DEFAULT_EXPIRY_HOURS = 72;

/** A message draft's hash is computed once, from its exact rendered content -- the approval
 * packet, the send record, and any later revalidation all reference this same hash, so "did the
 * message change since approval" is a byte-exact question, not a fuzzy one. */
export function messageHash(draft) {
  return sha256Hex(`${draft.channel}|${draft.subject || ''}|${draft.body}`);
}

export function buildMessageDraft({ opportunityId, channel, subject = '', body }) {
  if (!opportunityId) throw new ApprovalError('opportunity-id-required');
  if (!channel) throw new ApprovalError('channel-required');
  if (!body || !body.trim()) throw new ApprovalError('message-body-required');
  const draft = { id: id('draft'), opportunityId, channel, subject, body };
  return { ...draft, messageHash: messageHash(draft) };
}

/**
 * Assembles everything the mission's approval-packet spec names: exact org/domain, buyer role,
 * exact channel, source URL + published evidence, demand signal + portfolio observation, offer +
 * price, exact message + its hash, proof assets, risks, confidence, and an expiry. Every field is
 * read directly from already-loaded records -- this function never invents a value.
 */
export function buildApprovalPacket({ opportunity, evidenceItems = [], draft, offer, proofAssets = [], risks = [], expiryHours = DEFAULT_EXPIRY_HOURS }) {
  if (!opportunity) throw new ApprovalError('opportunity-required');
  if (!draft) throw new ApprovalError('draft-required');
  if (!offer) throw new ApprovalError('offer-required');
  if (draft.opportunityId !== opportunity.id) throw new ApprovalError('draft-opportunity-mismatch', 'the draft does not belong to this opportunity');
  return {
    id: id('approval'), messageDraftId: draft.id, opportunityId: opportunity.id,
    status: 'pending', expiresAt: new Date(Date.now() + expiryHours * 3600000).toISOString(),
    data: {
      organizationDomain: opportunity.organizationDomain,
      buyerRole: opportunity.data?.buyerRole || null,
      channel: opportunity.channel,
      evidence: evidenceItems.map(item => ({ id: item.id, sourceUrl: item.sourceUrl, capturedAt: item.capturedAt, verified: item.verified })),
      demandSignals: opportunity.data?.demandSignals || [],
      portfolioItems: opportunity.data?.portfolioItems || [],
      offerKey: offer.offerKey, priceCents: offer.priceCents,
      messagePreview: { channel: draft.channel, subject: draft.subject, body: draft.body },
      messageHash: draft.messageHash,
      proofAssets, risks, confidence: opportunity.data?.confidence ?? null
    }
  };
}

function isExpired(approval, nowMs = Date.now()) { return Date.parse(approval.expiresAt) <= nowMs; }

export async function decideApproval(store, approvalId, decision, { actor, nowMs = Date.now() } = {}) {
  if (!['approved', 'rejected'].includes(decision)) throw new ApprovalError('invalid-decision', decision);
  const approval = await store.get('approvals', approvalId);
  if (!approval) throw new ApprovalError('approval-not-found', approvalId);
  if (approval.status !== 'pending') throw new ApprovalError('approval-not-pending', `current status: ${approval.status}`);
  if (isExpired(approval, nowMs)) {
    await store.patch('approvals', approvalId, { status: 'expired' });
    throw new ApprovalError('approval-expired');
  }
  const updated = await store.patch('approvals', approvalId, { status: decision, reviewedBy: actor || 'owner', reviewedAt: new Date(nowMs).toISOString() });
  await store.log('approval_decided', { approvalId, decision, actor });
  return updated;
}

/** A caller must sweep expired approvals explicitly (e.g. from the scheduler) rather than relying
 * on decideApproval to catch every case lazily -- this keeps "what got auto-expired and when"
 * auditable as its own event. */
export async function expireStaleApprovals(store, nowMs = Date.now()) {
  const pending = await store.list('approvals', { filters: { status: 'pending' } });
  let expired = 0;
  for (const approval of pending) {
    if (isExpired(approval, nowMs)) { await store.patch('approvals', approval.id, { status: 'expired' }); expired += 1; }
  }
  if (expired) await store.log('approvals_expired', { count: expired });
  return { expired };
}

/**
 * Bulk review: applies one decision to many approval IDs, but returns a per-ID result rather than
 * a single boolean -- "lost exact recipient-message pairing" is exactly the bug this guards
 * against (mission's own phrasing), so every outcome is individually attributable.
 */
export async function bulkDecideApprovals(store, approvalIds, decision, options = {}) {
  const results = [];
  for (const approvalId of approvalIds) {
    try { results.push({ approvalId, ok: true, approval: await decideApproval(store, approvalId, decision, options) }); }
    catch (error) { results.push({ approvalId, ok: false, error: error.code || error.message }); }
  }
  return results;
}
