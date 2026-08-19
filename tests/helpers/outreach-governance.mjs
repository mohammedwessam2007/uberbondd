import { sha256 } from '../../src/omnia-v9/canonical.mjs';
import {
  createOutreachApproval,
  createOutreachRouteEvidence,
  outreachMessageDigest
} from '../../src/outreach-governance.mjs';

export const TEST_OUTREACH_APPROVAL_SECRET = 'test-outreach-approval-secret-'.repeat(3);

export function approveProspectForTest({
  prospect,
  campaign,
  cfg,
  date,
  jurisdiction = 'GB',
  routeType = 'SOLICITED_APPLICATION',
  permissionScope = 'CONTRACTOR_APPLICATION',
  effectPayloadDigest = sha256('fixture-effect')
} = {}) {
  const provider = cfg.outbound.provider;
  const route = createOutreachRouteEvidence({
    routeType,
    recipientEmail: prospect.contact.email,
    sourceUrl: `${prospect.website.replace(/\/$/, '')}/careers`,
    sourceExcerpt: 'Applications for this contractor opportunity are invited at the published business address.',
    sourceObservedAt: date.toISOString(),
    sourceExpiresAt: new Date(date.getTime() + 7 * 86400000).toISOString(),
    jurisdiction,
    permissionScope,
    relevantToRecipientRole: true,
    noUnsolicitedStatementPresent: false,
    provider,
    evidenceNote: 'Deterministic test fixture'
  }, date);
  const messageDigest = outreachMessageDigest({
    recipientEmail: prospect.contact.email,
    subject: prospect.subject,
    body: prospect.draft,
    provider,
    inbox: prospect.inbox,
    followup: 0,
    listUnsubscribe: prospect.oneClickUnsubscribeUrl
  });
  const approval = createOutreachApproval({
    approvalId: `approval-${prospect.id}`,
    prospectId: prospect.id,
    campaignId: campaign.id,
    recipientEmail: prospect.contact.email,
    provider,
    inbox: prospect.inbox,
    followup: 0,
    routeDigest: route.routeDigest,
    messageDigest,
    effectPayloadDigest,
    approvedBy: 'mohamed',
    approvedAt: date.toISOString(),
    expiresAt: new Date(date.getTime() + 24 * 3600000).toISOString()
  }, cfg.outbound.approvalSecret);
  return { ...prospect, outreachRoute: route, outreachApproval: approval };
}
