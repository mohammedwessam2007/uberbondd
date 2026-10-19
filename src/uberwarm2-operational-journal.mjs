// Receipt persistence only. No provider calls, probe reservations, or send capability.
import { createHash } from 'node:crypto';

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function compileOperationalSnapshot(input) {
  if (!input || !/^[a-f0-9]{40}$/.test(input.source || '') ||
      !Number.isFinite(Date.parse(input.observedAt)) || input.sends !== 0 ||
      input.runtimeReady !== false || input.sendAuthority !== 'NONE') {
    throw new Error('invalid-read-only-operational-receipt');
  }
  // Explicit allowlist: never persist provider bodies, mailbox addresses, tokens,
  // exception strings, database URLs, or arbitrary caller-supplied properties.
  return {
    version: 1, source: input.source, observedAt: new Date(input.observedAt).toISOString(),
    sends: 0, runtimeReady: false, sendAuthority: 'NONE',
    status: input.status === 'BLOCKED_FOR_SENDING' ? input.status : 'INFRASTRUCTURE_CHECK_FAILED',
    database: {
      primary: input.database?.recovery === false,
      ledgerPresent: input.database?.ledger_present === true
    },
    ledger: {
      claims: count(input.ledger?.claims), reserved: count(input.ledger?.reserved),
      uncertain: count(input.ledger?.uncertain)
    },
    provider: {
      authenticatedAccountRead: input.provider?.accountRead === true,
      mailboxes: count(input.provider?.mailboxes), domains: count(input.provider?.domains),
      receiptDigestsPresent: input.provider?.providerReceiptDigestsPresent === true
    },
    providerDnsSpotcheck: {
      checked: input.provider?.providerDnsSpotcheck?.checked === true,
      providerReportedReady: input.provider?.providerDnsSpotcheck?.providerReportedReady === true,
      reportedRecordTypesVerified: count(input.provider?.providerDnsSpotcheck?.reportedRecordTypesVerified),
      authenticatedProviderReceiptObserved: input.provider?.providerDnsSpotcheck?.authenticatedProviderReceiptObserved === true,
      independentMessageAuthenticationClaimed: false,
      sendingAuthority: 'NONE'
    },
    providerEventLog: {
      status: ['EVENT_LOG_PROVIDER_ATTEMPTS_OBSERVED','EVENT_LOG_ENDPOINTS_ABSENT',
        'EVENT_LOG_DELIVERY_READ_FAILED','EVENT_LOG_ENDPOINT_READ_FAILED',
        'EVENT_LOG_ENDPOINT_INVENTORY_UNVERIFIED','EVENT_LOG_ENDPOINT_IDENTITY_AMBIGUOUS',
        'EVENT_LOG_DELIVERY_PAGE_UNVERIFIED','EVENT_LOG_DELIVERY_ROW_UNVERIFIED',
        'EVENT_LOG_EVENT_TYPE_UNVERIFIED','EVENT_LOG_READERS_OR_CLOCK_UNAVAILABLE'].includes(input.provider?.providerEventLog?.status)
        ? input.provider.providerEventLog.status : 'NOT_OBSERVED',
      webhookCount: count(input.provider?.providerEventLog?.webhookCount),
      disabledWebhookCount: count(input.provider?.providerEventLog?.disabledWebhookCount),
      bounceDeliveryAttempts: count(input.provider?.providerEventLog?.bounceDeliveryAttempts),
      complaintDeliveryAttempts: count(input.provider?.providerEventLog?.complaintDeliveryAttempts),
      failedDeliveryAttempts: count(input.provider?.providerEventLog?.failedDeliveryAttempts),
      authenticatedProviderRead: input.provider?.providerEventLog?.verifiedProviderDeliveryRead === true,
      adverseEventOperatorReviewRequired: input.provider?.providerEventLog?.adverseEventOperatorReviewRequired === true,
      senderClearance: false, recipientSuppressionCleared: false, sendAuthority: 'NONE'
    },
    receiver: {
      configured: input.receiver?.configured === true,
      authenticated: input.receiver?.authenticated === true,
      inboxReadOnlyAccessible: input.receiver?.inboxReadOnlyAccessible === true,
      spamSpecialUseAdvertised: input.receiver?.spamSpecialUseAdvertised === true,
      probeConsentEstablished: false
    },
    sovereignControl: {
      status: ['SOVEREIGN_CONTROL_MONITORING_ACTIVE', 'SOVEREIGN_CONTROL_IDENTITY_HOLD', 'SOVEREIGN_CONTROL_PROVIDER_DNS_HOLD'].includes(input.provider?.sovereignControl?.status)
        ? input.provider.sovereignControl.status : 'NOT_VERIFIED',
      fleetMailboxes: count(input.provider?.sovereignControl?.fleetMailboxes),
      observedDomains: count(input.provider?.sovereignControl?.observedDomains),
      providerReportedActive: count(input.provider?.sovereignControl?.providerReportedActive),
      providerDnsReadyDomains: count(input.provider?.sovereignControl?.providerDnsReadyDomains),
      providerDnsUnreadyDomains: count(input.provider?.sovereignControl?.providerDnsUnreadyDomains),
      mailboxesWithProviderDnsHold: count(input.provider?.sovereignControl?.mailboxesWithProviderDnsHold),
      unmatchedMailboxes: count(input.provider?.sovereignControl?.unverifiedMailboxIdentity),
      duplicateMailboxes: count(input.provider?.sovereignControl?.duplicateIdentity),
      admittedToSend: 0, sendingActive: false, paidWarmupAddonRequired: false,
      authority: 'NONE'
    },
    // This monitor cannot attest these independent gates, including when reads succeed.
    activation: 'INDEPENDENT_SENDER_CONSENT_AND_PLACEMENT_GATES_REQUIRED'
  };
}

export async function persistOperationalSnapshot({ pool, receipt } = {}) {
  const snapshot = compileOperationalSnapshot(receipt);
  if (!pool || typeof pool.query !== 'function') throw new Error('journal-pool-required');
  const json = JSON.stringify(snapshot);
  const digest = 'sha256:' + createHash('sha256').update(json).digest('hex');
  const result = await pool.query(`INSERT INTO public.uberwarm2_operational_receipts
    (source_sha, observed_at, receipt_digest, receipt_json)
    VALUES ($1, $2::timestamptz, $3, $4::jsonb)
    ON CONFLICT (receipt_digest) DO NOTHING RETURNING receipt_digest`,
  [snapshot.source, snapshot.observedAt, digest, json]);
  // Read back the exact immutable payload even after a duplicate/restart.
  const check = await pool.query(`SELECT receipt_json FROM public.uberwarm2_operational_receipts
    WHERE receipt_digest=$1`, [digest]);
  if (check.rows.length !== 1 || JSON.stringify(check.rows[0].receipt_json) === undefined ||
      !sameJson(check.rows[0].receipt_json, snapshot)) throw new Error('journal-readback-mismatch');
  return Object.freeze({ digest, stored: true, duplicate: result.rows.length === 0 });
}

function sameJson(a, b) {
  if (a === b) return true;
  if (!a || typeof a !== 'object' || !b || typeof b !== 'object') return false;
  const keys = Object.keys(b);
  return Object.keys(a).length === keys.length && keys.every(k =>
    Object.hasOwn(a, k) && sameJson(a[k], b[k]));
}
