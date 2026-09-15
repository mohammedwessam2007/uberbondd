import crypto from 'node:crypto';
import { compileOutreach100kLaunchCertificate } from './outreach-100k-launch-contract.mjs';
import { compileUberMailExchange } from './ubermail-capacity-exchange.mjs';
import { compileUberSwarmPlan } from './uberswarm-edge-fabric.mjs';
import { compileUniversalReachPlan } from './uberreach-universal-transport.mjs';
import { compileZeroCostPortfolio } from './ubergrant-zero-cost-registry.mjs';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value ?? '').trim();

function rejectDuplicateRows(rows = [], keyFn) {
  const seen = new Set();
  const accepted = [];
  const duplicates = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = clean(keyFn(row)).toLowerCase();
    if (!key || seen.has(key)) {
      duplicates.push({ key: key || null, row });
      continue;
    }
    seen.add(key);
    accepted.push(row);
  }
  return { accepted, duplicates };
}

function hardenCertificateInput(input = {}) {
  const egress = rejectDuplicateRows(input.egressRoutes, row => row?.routeId || row?.id);
  const recipients = rejectDuplicateRows(input.recipientProviders, row => row?.providerId);
  const mailboxes = rejectDuplicateRows(input.mailboxes, row => row?.mailboxId);
  const domains = rejectDuplicateRows(input.domains, row => row?.domainId || row?.domain);
  const reasons = [];
  if (egress.duplicates.length) reasons.push('duplicate-egress-route-evidence');
  if (recipients.duplicates.length) reasons.push('duplicate-recipient-provider-evidence');
  if (mailboxes.duplicates.length) reasons.push('duplicate-mailbox-evidence');
  if (domains.duplicates.length) reasons.push('duplicate-domain-evidence');

  const unknownUsage = [
    ...(egress.accepted || []).filter(row => row?.usedToday == null).map(row => `egress:${clean(row?.routeId || row?.id)}`),
    ...(recipients.accepted || []).filter(row => row?.usedToday == null).map(row => `recipient-provider:${clean(row?.providerId)}`),
    ...(mailboxes.accepted || []).filter(row => row?.usedToday == null).map(row => `mailbox:${clean(row?.mailboxId)}`)
  ];
  if (unknownUsage.length) reasons.push('observed-usage-required');

  return {
    input: { ...input, egressRoutes: egress.accepted, recipientProviders: recipients.accepted, mailboxes: mailboxes.accepted, domains: domains.accepted },
    reasonCodes: reasons,
    unknownUsage,
    duplicateCounts: {
      egressRoutes: egress.duplicates.length,
      recipientProviders: recipients.duplicates.length,
      mailboxes: mailboxes.duplicates.length,
      domains: domains.duplicates.length
    }
  };
}

export function compileZeroBarrierOutreachReadiness({
  launchInput = {},
  mailExchange = {},
  swarm = {},
  reach = {},
  zeroCostResources = {},
  now = new Date()
} = {}) {
  const hardened = hardenCertificateInput(launchInput);
  const baseCertificate = compileOutreach100kLaunchCertificate(hardened.input);
  const exchange = compileUberMailExchange({ ...mailExchange, now, required: baseCertificate.targetRemaining || 100_000 });
  const swarmPlan = compileUberSwarmPlan({ ...swarm, now });
  const reachPlan = compileUniversalReachPlan({ ...reach, now });
  const grants = compileZeroCostPortfolio({ ...zeroCostResources, now });

  const launchReady = hardened.reasonCodes.length === 0 && baseCertificate.state === 'CERTIFIED_100K_READY';
  const seed = {
    launchCertificateId: baseCertificate.certificateId,
    launchState: baseCertificate.state,
    hardeningReasonCodes: hardened.reasonCodes,
    exchangeState: exchange.state,
    swarmState: swarmPlan.state,
    reachState: reachPlan.state,
    grantState: grants.state
  };

  return {
    fabricReceiptId: `ubzero_${sha256(seed)}`,
    state: launchReady ? 'SMTP_100K_CERTIFIED' : 'NOT_YET_SMTP_100K_CERTIFIED',
    pressable: launchReady,
    smtpLaunchCertificate: baseCertificate,
    evidenceHardening: hardened,
    mailExchange: exchange,
    swarmPlan,
    reachPlan,
    zeroCostPortfolio: grants,
    alternativeEconomicReachCount: reachPlan.routes.length,
    alternativeEconomicReachIsNotSmtpCertificate: true,
    automaticExternalEffectAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'This fabric composes compute, transport-market, zero-cost resource, and alternate-channel evidence without redefining the existing SMTP 100K certificate. Only the canonical SMTP certificate can make the existing 100K button pressable.'
  };
}

export { hardenCertificateInput };
