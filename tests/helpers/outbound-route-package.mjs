import { outboundMessageDigest } from '../../src/outbound-send-authorization.mjs';

// Test-only fixture. It builds a complete, valid authorization package for one exact message from one exact sender account,
// so a route test can prove the positive path. Production code never builds these; no route supplies one by default.
// Every identity, domain and address here is synthetic (.invalid or .example).

export const ROUTE_CONSENT_REF = 'consent:route';
export const ALLOW_CONSENT = ({ consentReceiptRef }) => consentReceiptRef === ROUTE_CONSENT_REF;

export function validRoutePackage({ account, message, campaignId = 'campaign-route', over = {} } = {}) {
  const domain = String(account?.email || '').split('@').pop().toLowerCase();
  return {
    campaignId,
    sender: {
      accountId: account.id, slot: account.slot, email: account.email,
      paused: false, holdReasons: [], quarantined: false, bounceRate: 0.01, complaintRate: 0.001
    },
    thresholds: { maxBounceRate: 0.05, maxComplaintRate: 0.01 },
    domainReceipt: { domain, configured: true },
    provider: { name: 'smtp-relay', routeAuthorized: true, termsCompatible: true },
    recipient: { jurisdiction: 'JX-TEST', eligibilityEvidenceRef: 'elig:route' },
    suppression: { snapshotId: 'supp-route', entries: [] },
    doNotContact: { listId: 'dnc-route', entries: [] },
    jurisdictionEvidence: { jurisdiction: 'JX-TEST', allowed: true, evidenceRef: 'jur:route' },
    consent: { receiptRef: ROUTE_CONSENT_REF },
    campaignApproval: { campaignId, approvalRef: 'approval:route' },
    messageApproval: { approvedDigest: outboundMessageDigest(message) },
    rateWindow: { sentCount: 0, cap: 10 },
    retry: { attempts: 0, budget: 3 },
    emergencyStop: false,
    ...over
  };
}
