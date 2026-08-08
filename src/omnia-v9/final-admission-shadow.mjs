import { sha256 } from './canonical.mjs';

function clip(value, max = 240) {
  return String(value ?? '').slice(0, max);
}

function normalizeDecision(value) {
  const decision = String(value?.decision || 'REVIEW').toUpperCase();
  return ['ALLOW', 'DENY', 'REVIEW'].includes(decision) ? decision : 'REVIEW';
}

export function buildOutboundShadowContext({ reservation, prospect, campaign, account, subject, body, followup = 0, idempotencyKey, observedAt }) {
  if (!reservation?.id) throw new Error('reservation required');
  if (!prospect?.id || !campaign?.id || !account?.email) throw new Error('outbound context incomplete');
  return {
    schemaVersion: 'omnia.v9.outbound-final-shadow.p4',
    observedAt: String(observedAt || new Date().toISOString()),
    boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL',
    authoritative: false,
    reservation: {
      id: String(reservation.id),
      state: 'dispatching',
      idempotencyKey: String(idempotencyKey || reservation.idempotencyKey || ''),
      inbox: String(prospect.inbox || reservation.inbox || ''),
      recipientEmail: String(prospect.contact?.email || reservation.recipientEmail || ''),
      kind: followup ? 'followup' : 'initial',
      followup: Number(followup || 0)
    },
    action: {
      operation: 'OUTBOUND_EMAIL_SEND',
      effectClass: 'EXTERNAL_CONSEQUENTIAL',
      prospectId: String(prospect.id),
      campaignId: String(campaign.id),
      senderEmail: String(account.email),
      recipientEmail: String(prospect.contact?.email || ''),
      subjectSha256: sha256(String(subject || '')),
      bodySha256: sha256(String(body || '')),
      evidenceUrl: clip(prospect.issue?.evidenceUrl || '', 1000),
      evidenceExcerptSha256: sha256(String(prospect.issue?.evidenceExcerpt || ''))
    },
    legacySignals: {
      campaignApprovedBoolean: campaign.approved === true,
      autoSend: campaign.autoSend === true,
      issueSafeForOutreach: prospect.issue?.safeForOutreach === true,
      issueConfidence: Number(prospect.issue?.confidence || 0),
      contactSource: clip(prospect.contact?.source || '', 80),
      contactVerification: clip(prospect.contact?.verified || '', 80)
    }
  };
}

export async function observeOutboundFinalAdmission({ hook, store, context }) {
  const base = {
    schemaVersion: 'omnia.v9.outbound-final-shadow-observation.p4',
    authoritative: false,
    enforced: false,
    boundary: context?.boundary || 'UNKNOWN',
    reservationId: context?.reservation?.id || '',
    contextDigest: sha256(context),
    observedAt: context?.observedAt || new Date().toISOString()
  };

  if (typeof hook !== 'function') {
    const observation = { ...base, status: 'NO_HOOK', decision: 'REVIEW', reasons: ['shadow-hook-not-configured'] };
    try { await store?.log?.('omnia_v9_outbound_final_shadow', observation); } catch {}
    return observation;
  }

  try {
    const result = await hook(context);
    const observation = {
      ...base,
      status: 'OBSERVED',
      decision: normalizeDecision(result),
      reasons: Array.isArray(result?.reasons) ? result.reasons.map(item => clip(item, 240)).slice(0, 20) : [],
      policyDigest: clip(result?.policyDigest || '', 128),
      constitutionDigest: clip(result?.constitutionDigest || '', 128)
    };
    try { await store?.log?.('omnia_v9_outbound_final_shadow', observation); } catch {}
    return observation;
  } catch (error) {
    const observation = {
      ...base,
      status: 'SHADOW_ERROR',
      decision: 'REVIEW',
      reasons: ['shadow-observer-error'],
      error: clip(error?.message || error, 500)
    };
    try { await store?.log?.('omnia_v9_outbound_final_shadow', observation); } catch {}
    return observation;
  }
}
