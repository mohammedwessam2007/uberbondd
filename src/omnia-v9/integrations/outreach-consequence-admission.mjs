import { sha256 } from '../canonical.mjs';
import {
  selectOutreachApproval,
  verifyOutreachApproval,
  verifyOutreachRouteEvidence
} from '../../outreach-governance.mjs';

export const OUTREACH_CONSEQUENCE_POLICY_DIGEST = sha256({
  version: 'uberbond.outreach-consequence-policy.v1',
  launchPhase: 'canary-only',
  providerRouteTypes: {
    'gmail-api': ['EXPLICIT_CONSENT', 'REQUESTED_INFORMATION', 'SOLICITED_APPLICATION'],
    postal: ['EXPLICIT_CONSENT', 'REQUESTED_INFORMATION', 'SOLICITED_APPLICATION']
  },
  approval: 'exact-hmac-bound-single-use',
  effectPayload: 'sha256-bound',
  missingOrUncertain: 'deny',
  providerResultUncertain: 'never-retry'
});

export const OUTREACH_CONSEQUENCE_CONSTITUTION_DIGEST = sha256({
  version: 'uberbond.outreach-consequence-constitution.v1',
  invariants: [
    'no-unsolicited-commercial-mail-through-bounded-canary-providers',
    'one-verified-recipient-per-message',
    'exact-owner-approved-payload-only',
    'current-route-evidence-required',
    'suppression-and-cooldown-remain-authoritative',
    'no-provider-call-after-review-deny-error-or-uncertainty'
  ]
});

function deny(context, reason) {
  return {
    decision: 'DENY',
    authoritative: true,
    enforced: true,
    reason,
    contextDigest: sha256(context),
    reservationId: context?.reservation?.id || '',
    actionIntentDigest: context?.actionIntentDigest || '',
    effectPayloadDigest: context?.effectPayloadDigest || ''
  };
}

/**
 * Deterministic, V9-compatible final consequence gate for the first bounded
 * outreach canary. It intentionally does not pretend that a public email
 * address is consent. Gmail API and owned Postal execution are both limited to
 * a solicited application, explicit consent, or requested information, and every effect
 * must match a short-lived HMAC approval over the exact payload digest.
 *
 * The existing durable outbound reservation is the single-use authority
 * reservation for this bridge. The Gmail call still remains behind
 * pipeline.mjs's idempotency, cooldown, suppression, cap, and uncertainty
 * controls. A future full Cedar/external-effect migration can replace this
 * hook without weakening those independent controls.
 */
export function createAuthoritativeOutreachConsequenceGate({ store, cfg } = {}) {
  return async function authoritativeOutreachConsequenceGate(context) {
    if (!store || typeof store.get !== 'function') return deny(context, 'outreach-consequence-store-unavailable');
    if (cfg?.outbound?.launchPhase !== 'canary') return deny(context, 'outreach-consequence-launch-phase-not-canary');
    const provider = String(cfg?.outbound?.provider || '').toLowerCase();
    if (!['gmail-api', 'postal'].includes(provider)) {
      return deny(context, 'outreach-consequence-provider-not-approved');
    }
    const action = context?.actionIntent || {};
    if (action.operation !== 'OUTBOUND_EMAIL_SEND' || action.consequenceClass !== 'COMMUNICATE_EXTERNAL') {
      return deny(context, 'outreach-consequence-action-class-mismatch');
    }
    if (!context?.reservation?.id || context.reservation.state !== 'reserved') {
      return deny(context, 'outreach-consequence-reservation-not-bound');
    }
    const checkedAt = new Date(context.checkedAt);
    if (!Number.isFinite(checkedAt.getTime())) return deny(context, 'outreach-consequence-checked-at-invalid');

    const [prospect, campaign, account] = await Promise.all([
      store.get('prospects', action.prospectId),
      store.get('campaigns', action.campaignId),
      store.findOne?.('accounts', { slot: action.inbox })
    ]);
    if (!prospect || !campaign) return deny(context, 'outreach-consequence-record-not-found');
    if (!account?.connected || !account?.email) return deny(context, 'outreach-consequence-sender-not-connected');
    if (String(account.email).trim().toLowerCase() !== String(action.senderEmail || '').trim().toLowerCase()) {
      return deny(context, 'outreach-consequence-sender-mismatch');
    }
    if (campaign.approved !== true || campaign.autoSend !== true) return deny(context, 'outreach-consequence-campaign-not-enabled');
    if (String(prospect.campaignId || '') !== String(campaign.id || '')) return deny(context, 'outreach-consequence-campaign-binding-mismatch');
    if (String(prospect.contact?.email || '').trim().toLowerCase() !== String(action.recipientEmail || '').trim().toLowerCase()) {
      return deny(context, 'outreach-consequence-recipient-mismatch');
    }
    if (String(prospect.inbox || '') !== String(action.inbox || '')) return deny(context, 'outreach-consequence-inbox-mismatch');

    const routeCheck = verifyOutreachRouteEvidence({
      route: prospect.outreachRoute,
      recipientEmail: action.recipientEmail,
      provider: cfg.outbound.provider,
      now: checkedAt,
      maxAgeDays: cfg.outbound.routeEvidenceMaxAgeDays
    });
    if (!routeCheck.ok) return deny(context, routeCheck.reason);

    const followup = Number(action.followup || 0);
    const approval = selectOutreachApproval(prospect, followup);
    if (!approval) return deny(context, 'outreach-approval-missing-at-consequence-boundary');
    const approvalCheck = verifyOutreachApproval({
      approval,
      secret: cfg.outbound.approvalSecret,
      prospectId: prospect.id,
      campaignId: campaign.id,
      recipientEmail: action.recipientEmail,
      provider: cfg.outbound.provider,
      inbox: action.inbox,
      followup,
      routeDigest: prospect.outreachRoute.routeDigest,
      messageDigest: approval.messageDigest,
      effectPayloadDigest: context.authorizationPayloadDigest,
      now: checkedAt
    });
    if (!approvalCheck.ok) return deny(context, approvalCheck.reason);

    return {
      decision: 'ALLOW',
      authoritative: true,
      enforced: true,
      reason: 'bounded-outreach-canary-authorized',
      contextDigest: sha256(context),
      reservationId: context.reservation.id,
      actionIntentDigest: context.actionIntentDigest,
      effectPayloadDigest: context.effectPayloadDigest,
      authorizationPayloadDigest: context.authorizationPayloadDigest,
      authorizationDigest: approval.approvalDigest,
      policyDigest: OUTREACH_CONSEQUENCE_POLICY_DIGEST,
      constitutionDigest: OUTREACH_CONSEQUENCE_CONSTITUTION_DIGEST,
      authorityReservationId: `outbound:${context.reservation.id}`
    };
  };
}
