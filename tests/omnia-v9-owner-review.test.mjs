import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOwnerExceptionPacket, applyOwnerResponse, expireIfPastDeadline,
  buildOwnerExceptionPacketFromCandidate, OwnerReviewError, PACKET_STATUSES
} from '../src/omnia-v9/integrations/owner-review.mjs';

function fixturePacket(overrides = {}) {
  return buildOwnerExceptionPacket({
    packetId: 'packet:1', candidateId: 'res_1', tenantId: 'campaign:c1',
    action: 'Send outbound email to buyer@example.com (campaign c1)',
    reason: 'V9_INCOMPLETE: approval:no-covering-resolvable-approval',
    maxConsequence: { effectClass: 'COMMUNICATE_EXTERNAL', maxCostUsd: 0.25, blastRadius: 1 },
    evidenceSummary: 'external evidence: https://example.com/page',
    authorityGap: 'no resolvable owner approval or policy binding covers this candidate',
    recommendedDefault: 'DENY',
    issuedAt: '2026-08-08T12:00:00.000Z',
    expiresAt: '2026-08-09T12:00:00.000Z',
    estimatedDecisionMinutes: 1,
    ...overrides
  });
}

test('buildOwnerExceptionPacket produces a compact packet with exactly the mandated fields and starts PENDING', () => {
  const packet = fixturePacket();
  assert.equal(packet.status, 'PENDING');
  assert.equal(packet.effectiveDecision, null);
  for (const field of ['action', 'reason', 'maxConsequence', 'evidenceSummary', 'authorityGap', 'recommendedDefault', 'issuedAt', 'expiresAt', 'estimatedDecisionMinutes']) {
    assert(field in packet, `packet missing ${field}`);
  }
  assert(!('cedarDiagnostics' in packet), 'packet must not leak internal architecture noise');
  assert(!('policyDigest' in packet), 'packet must not leak internal architecture noise');
});

test('buildOwnerExceptionPacket rejects an incomplete packet and an invalid recommendedDefault', () => {
  assert.throws(() => buildOwnerExceptionPacket({ candidateId: 'x' }), OwnerReviewError);
  assert.throws(() => fixturePacket({ recommendedDefault: 'MAYBE' }), OwnerReviewError);
  assert.throws(() => fixturePacket({ issuedAt: '2026-08-09T12:00:00.000Z', expiresAt: '2026-08-08T12:00:00.000Z' }), OwnerReviewError);
});

test('review simulation: APPROVE resolves the packet deterministically to ALLOW', () => {
  const packet = fixturePacket();
  const resolved = applyOwnerResponse({ packet, response: 'APPROVE', respondedAt: '2026-08-08T13:00:00.000Z' });
  assert.equal(resolved.status, 'APPROVED');
  assert.equal(resolved.effectiveDecision, 'ALLOW');
  assert.equal(resolved.responses.length, 1);
  assert.equal(resolved.responses[0].outcome, 'APPLIED');
});

test('review simulation: DENY resolves the packet deterministically to DENY', () => {
  const packet = fixturePacket();
  const resolved = applyOwnerResponse({ packet, response: 'DENY', respondedAt: '2026-08-08T13:00:00.000Z' });
  assert.equal(resolved.status, 'DENIED');
  assert.equal(resolved.effectiveDecision, 'DENY');
});

test('review simulation: expire without response falls back to recommendedDefault, deterministically and idempotently', () => {
  const packet = fixturePacket();
  const afterDeadline = expireIfPastDeadline({ packet, now: '2026-08-10T00:00:00.000Z' });
  assert.equal(afterDeadline.status, 'EXPIRED');
  assert.equal(afterDeadline.effectiveDecision, 'DENY');
  const calledAgain = expireIfPastDeadline({ packet: afterDeadline, now: '2026-08-11T00:00:00.000Z' });
  assert.deepEqual(calledAgain, afterDeadline, 'expiring an already-expired packet again must be a no-op');
});

test('review simulation: revoke is only valid after a prior APPROVE, and flips the effective decision back to the safe default', () => {
  const denied = fixturePacket();
  const rejectedRevoke = applyOwnerResponse({ packet: denied, response: 'REVOKE', respondedAt: '2026-08-08T13:00:00.000Z' });
  assert.equal(rejectedRevoke.status, 'PENDING', 'revoking a never-approved packet must not change its status');
  assert.equal(rejectedRevoke.responses.at(-1).outcome, 'REJECTED_NOT_APPROVED');

  const approved = applyOwnerResponse({ packet: fixturePacket(), response: 'APPROVE', respondedAt: '2026-08-08T13:00:00.000Z' });
  const revoked = applyOwnerResponse({ packet: approved, response: 'REVOKE', respondedAt: '2026-08-08T14:00:00.000Z' });
  assert.equal(revoked.status, 'REVOKED');
  assert.equal(revoked.effectiveDecision, 'DENY', 'revocation must fall back to the safe recommendedDefault, never remain ALLOW');
  assert.equal(revoked.responses.length, 2, 'the original approval remains in the audit trail -- revocation does not erase history');
});

test('review simulation: a duplicate response after resolution is recorded and rejected, never silently overwriting the first decision', () => {
  const packet = fixturePacket();
  const approved = applyOwnerResponse({ packet, response: 'APPROVE', respondedAt: '2026-08-08T13:00:00.000Z' });
  const duplicateDeny = applyOwnerResponse({ packet: approved, response: 'DENY', respondedAt: '2026-08-08T13:05:00.000Z' });
  assert.equal(duplicateDeny.status, 'APPROVED', 'the first response must win -- a later conflicting response cannot silently flip the outcome');
  assert.equal(duplicateDeny.effectiveDecision, 'ALLOW');
  assert.equal(duplicateDeny.responses.length, 2);
  assert.equal(duplicateDeny.responses[1].outcome, 'REJECTED_ALREADY_RESOLVED');

  const duplicateApprove = applyOwnerResponse({ packet: approved, response: 'APPROVE', respondedAt: '2026-08-08T13:05:00.000Z' });
  assert.equal(duplicateApprove.responses[1].outcome, 'REJECTED_ALREADY_RESOLVED', 'even an identical duplicate response is recorded as rejected, not silently merged');
});

test('review simulation: a response arriving after expiresAt is rejected and the packet auto-resolves to the safe default, never to the late response', () => {
  const packet = fixturePacket();
  const lateApprove = applyOwnerResponse({ packet, response: 'APPROVE', respondedAt: '2026-08-10T00:00:00.000Z' });
  assert.equal(lateApprove.status, 'EXPIRED');
  assert.equal(lateApprove.effectiveDecision, 'DENY', 'a late APPROVE must never grant authority after expiry');
  assert.equal(lateApprove.responses.at(-1).outcome, 'REJECTED_EXPIRED');
});

test('buildOwnerExceptionPacketFromCandidate returns null for agreement categories and a full packet for exception categories', () => {
  const context = {
    reservation: { id: 'res_42' },
    action: { campaignId: 'c1', recipientEmail: 'buyer@example.com', evidenceUrl: 'https://example.com/page' },
    legacySignals: { legacyEligible: true, legacyReason: '' }
  };
  const evaluation = { decision: 'REVIEW', reasons: ['approval:no-covering-resolvable-approval'], intentDigest: 'deadbeef' };
  assert.equal(buildOwnerExceptionPacketFromCandidate({ context, evaluation, category: 'BOTH_ALLOW' }), null);
  assert.equal(buildOwnerExceptionPacketFromCandidate({ context, evaluation, category: 'BOTH_DENY' }), null);

  const packet = buildOwnerExceptionPacketFromCandidate({ context, evaluation, category: 'V9_INCOMPLETE', now: new Date('2026-08-08T12:00:00.000Z') });
  assert.equal(packet.status, 'PENDING');
  assert.equal(packet.recommendedDefault, 'DENY');
  assert.match(packet.action, /buyer@example\.com/);
  assert.match(packet.reason, /^V9_INCOMPLETE:/);
});

test('PACKET_STATUSES enumerates exactly the five reachable states', () => {
  assert.deepEqual([...PACKET_STATUSES], ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'REVOKED']);
});
