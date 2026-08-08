/**
 * Owner exception packets: the compact artifact a human (Mohamed) actually
 * looks at for the cases V9 could not resolve on its own -- a
 * LEGACY_ALLOW_V9_DENY, a V9_INCOMPLETE, a V9_ERROR, or an unresolved
 * LEGACY_DENY_V9_ALLOW investigation. Deliberately excludes internal
 * architecture noise (raw Cedar diagnostics, full intent/context objects,
 * digest values) -- the design goal stated by this mission is "one glance,
 * one decision." This module is NOT the P8 authority-transition ledger and
 * does not touch it or any frozen file; it is a small, additive, in-memory
 * decision-packet workflow for simulating and later driving real owner
 * review, using SYNTHETIC owner responses only in this mission (fixtures),
 * never live outreach to the real owner.
 */

export const PACKET_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'REVOKED']);

const REQUIRED_FIELDS = ['candidateId', 'tenantId', 'action', 'reason', 'maxConsequence', 'evidenceSummary', 'authorityGap', 'recommendedDefault', 'issuedAt', 'expiresAt'];

export class OwnerReviewError extends Error {
  constructor(message, code = 'OWNER_REVIEW_ERROR', detail = {}) {
    super(message);
    this.name = 'OwnerReviewError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Builds one compact owner exception packet. `recommendedDefault` must be
 * 'DENY' or 'ALLOW' -- the safe fallback V9 takes if the owner never
 * responds. This mission's stated posture ("excessive denial is not
 * intelligence, but a system that denies everything is safe") does not mean
 * every packet defaults to DENY -- it means the default must be an honest,
 * evidence-based recommendation, not a reflexive one.
 */
export function buildOwnerExceptionPacket({
  packetId, candidateId, tenantId, action, reason, maxConsequence, evidenceSummary,
  authorityGap, recommendedDefault, issuedAt, expiresAt, estimatedDecisionMinutes = 1
}) {
  const packet = { packetId, candidateId, tenantId, action, reason, maxConsequence, evidenceSummary, authorityGap, recommendedDefault, issuedAt, expiresAt, estimatedDecisionMinutes };
  for (const field of REQUIRED_FIELDS) {
    if (packet[field] === undefined || packet[field] === null || packet[field] === '') {
      throw new OwnerReviewError(`owner exception packet missing required field: ${field}`, 'INCOMPLETE_PACKET', { field });
    }
  }
  if (!['ALLOW', 'DENY'].includes(recommendedDefault)) throw new OwnerReviewError('recommendedDefault must be ALLOW or DENY', 'INVALID_DEFAULT');
  if (Date.parse(issuedAt) >= Date.parse(expiresAt)) throw new OwnerReviewError('expiresAt must be after issuedAt', 'INVALID_WINDOW');
  return { ...packet, status: 'PENDING', responses: [], effectiveDecision: null, resolvedAt: null };
}

/**
 * Applies exactly one of the drill-required transitions deterministically:
 * APPROVE, DENY, REVOKE (only valid after a prior APPROVE), or a late/
 * duplicate response. Never mutates the packet in place -- returns a new
 * packet object, and every attempted response (including rejected ones) is
 * appended to `responses` so the audit trail shows what was attempted, not
 * only what took effect.
 */
export function applyOwnerResponse({ packet, response, respondedAt, respondedBy = 'mohamed' }) {
  if (!['APPROVE', 'DENY', 'REVOKE'].includes(response)) throw new OwnerReviewError(`unknown response type: ${response}`, 'INVALID_RESPONSE');
  const now = Date.parse(respondedAt);
  if (!Number.isFinite(now)) throw new OwnerReviewError('respondedAt must be a valid timestamp', 'INVALID_RESPONSE');

  const attempt = { response, respondedAt, respondedBy };
  const expired = now > Date.parse(packet.expiresAt);

  if (expired && packet.status === 'PENDING') {
    return {
      ...packet, status: 'EXPIRED', effectiveDecision: packet.recommendedDefault, resolvedAt: packet.expiresAt,
      responses: [...packet.responses, { ...attempt, outcome: 'REJECTED_EXPIRED' }]
    };
  }

  if (response === 'REVOKE') {
    if (packet.status !== 'APPROVED') {
      return { ...packet, responses: [...packet.responses, { ...attempt, outcome: 'REJECTED_NOT_APPROVED' }] };
    }
    return {
      ...packet, status: 'REVOKED', effectiveDecision: packet.recommendedDefault, resolvedAt: respondedAt,
      responses: [...packet.responses, { ...attempt, outcome: 'APPLIED' }]
    };
  }

  if (packet.status !== 'PENDING') {
    return { ...packet, responses: [...packet.responses, { ...attempt, outcome: 'REJECTED_ALREADY_RESOLVED' }] };
  }

  const status = response === 'APPROVE' ? 'APPROVED' : 'DENIED';
  return {
    ...packet, status, effectiveDecision: response === 'APPROVE' ? 'ALLOW' : 'DENY', resolvedAt: respondedAt,
    responses: [...packet.responses, { ...attempt, outcome: 'APPLIED' }]
  };
}

/**
 * Applies the expiry transition for a packet nobody responded to. Safe to
 * call repeatedly (idempotent): a packet that is already resolved is
 * returned unchanged.
 */
export function expireIfPastDeadline({ packet, now }) {
  if (packet.status !== 'PENDING') return packet;
  if (Date.parse(now) <= Date.parse(packet.expiresAt)) return packet;
  return { ...packet, status: 'EXPIRED', effectiveDecision: packet.recommendedDefault, resolvedAt: packet.expiresAt };
}

const EXCEPTION_CATEGORIES = new Set(['LEGACY_ALLOW_V9_DENY', 'LEGACY_DENY_V9_ALLOW', 'V9_INCOMPLETE', 'V9_ERROR']);

/**
 * Converts one reality-shadow candidate (context + evaluation result +
 * comparison category) into a compact owner exception packet, or returns
 * null if the candidate does not actually require review (BOTH_ALLOW/
 * BOTH_DENY never generate a packet -- only disagreement/incomplete/error
 * cases do). recommendedDefault is always DENY: a missed send is
 * reversible, an unauthorized one is not, so "no response" must always mean
 * "do not act," regardless of which exception category produced the
 * packet. This function does not judge whether V9 or legacy was right --
 * that classification (V9_FALSE_DENY vs V9_CORRECTLY_STRICTER, etc.) is a
 * separate, evidence-by-evidence analysis, not something to automate here.
 */
export function buildOwnerExceptionPacketFromCandidate({ context, evaluation, category, now = new Date(), reviewWindowMs = 24 * 3600_000 }) {
  if (!EXCEPTION_CATEGORIES.has(category)) return null;
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + reviewWindowMs).toISOString();
  const action = context?.action || {};
  const legacy = context?.legacySignals || {};
  const reasonSummary = (evaluation?.reasons || []).slice(0, 3).join('; ') || 'no reason recorded';

  return buildOwnerExceptionPacket({
    packetId: `packet:${context?.reservation?.id || evaluation?.intentDigest || 'unknown'}`,
    candidateId: context?.reservation?.id || evaluation?.intentDigest || 'unknown',
    tenantId: `campaign:${action.campaignId || 'unknown'}`,
    action: `Send outbound email to ${action.recipientEmail || 'unknown recipient'} (campaign ${action.campaignId || 'unknown'})`,
    reason: `${category}: ${reasonSummary}`,
    maxConsequence: { effectClass: 'COMMUNICATE_EXTERNAL', maxCostUsd: 0.25, blastRadius: 1 },
    evidenceSummary: action.evidenceUrl ? `external evidence: ${action.evidenceUrl}` : 'no external evidence url on record',
    authorityGap: category === 'V9_INCOMPLETE' || category === 'V9_ERROR'
      ? 'no resolvable owner approval or policy binding covers this candidate'
      : `legacy eligibility=${legacy.legacyEligible === true} vs V9 decision=${evaluation?.decision}`,
    recommendedDefault: 'DENY',
    issuedAt,
    expiresAt,
    estimatedDecisionMinutes: 1
  });
}
