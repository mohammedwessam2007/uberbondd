import { createActionIntent, createEvidenceRecord, admitAction } from './kernel.mjs';
import { sha256 } from './canonical.mjs';

export function buildOutboundShadowArtifacts({ prospect, campaign, actorId = 'uberbond-worker', now = new Date() }) {
  const issue = prospect.issue || {};
  const evidence = createEvidenceRecord({
    evidenceId: `outreach:${prospect.id}:issue`, tenantId: `campaign:${campaign.id}`, subject: prospect.website || prospect.domain || prospect.id,
    origin: 'EXTERNAL_SOURCE', relation: 'DIRECT', verificationClaims: ['DIGEST_VERIFIED'], lifecycleFlags: ['ACTIVE'],
    sourceRef: issue.evidenceUrl || 'missing://evidence', payloadDigest: sha256({ excerpt: issue.evidenceExcerpt || '', title: issue.title || '' }),
    observedAt: prospect.completedAt || now.toISOString()
  });
  const intent = createActionIntent({
    missionId: `campaign:${campaign.id}`, tenantId: `campaign:${campaign.id}`, actorId, operation: 'email.send',
    resource: `email:${String(prospect.contact?.email || '').toLowerCase()}`, purpose: 'qualified-b2b-outreach', effectClass: 'COMMUNICATE_EXTERNAL',
    arguments: { to: prospect.contact?.email || '', subject: prospect.subject || '', bodyDigest: sha256(prospect.draft || '') }, evidenceIds: [evidence.evidenceId],
    maxCostUsd: 0.25, blastRadius: 1, rollback: 'SUPPRESS_FUTURE_CONTACT', expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    nonce: `${prospect.id}:${now.getTime()}`, idempotencyKey: `initial:${prospect.id}`
  }, now);
  return { intent, evidence };
}

export function evaluateOutboundShadow({ prospect, campaign, approvals = [], keyResolver, usageResolver, policyAuthorizer, now = new Date(), killState = { active: false } }) {
  const { intent, evidence } = buildOutboundShadowArtifacts({ prospect, campaign, now });
  const authorization = admitAction(intent, {
    now, effectKnown: true, requireExternalEvidence: true, approvals, keyResolver, usageResolver,
    evidenceResolver: id => id === evidence.evidenceId ? evidence : null, policyAuthorizer,
    policyVersion: 'omnia-v9-p0-shadow', constitutionDigest: 'PENDING_CANONICAL_RECONCILIATION', killState
  });
  return { mode: 'SHADOW', intent, evidence, authorization };
}
