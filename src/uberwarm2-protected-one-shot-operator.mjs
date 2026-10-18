/**
 * UberWarm protected, opt-in, single owner-seed execution composition.
 * This does NOT run in a cron, issue consent/signatures, read environment
 * secrets, choose a recipient, create a table, or authorize any send.
 * The caller must supply existing protected providers and one exact signed
 * batch approval. Every failed preflight/unknown outcome is non-retriable.
 */
import { createUberWarm2ProtectedWinnrRuntime } from './uberwarm2-protected-winnr-runtime.mjs';
import { createUberWarm2WinnrHttpsSeedBridge } from './uberwarm2-winnr-https-seed-bridge.mjs';
import { createUberWarm2PgLedger } from './uberwarm2-pg-ledger.mjs';
import { executeUberWarm2SeedProbe } from './uberwarm2-seed-executor.mjs';
import { createUberWarm2ProtectedReceiverPlacementWiring } from './uberwarm2-protected-receiver-placement-wiring-donor.mjs';

export const UBERWARM2_PROTECTED_ONE_SHOT_OPERATOR_VERSION = 'uberbond.uberwarm2-protected-one-shot-operator.v1';
const denied = reason => Object.freeze({
  ok: false, status: 'UBERWARM2_PROTECTED_OPERATOR_REFUSED',
  reasonCodes: Object.freeze([reason]), providerSubmissions: 0, verifiedPlacements: 0,
  externalEffectAuthority: 'NONE', automaticRetryAuthorized: false
});

export function createUberWarm2ProtectedOneShotOperator({
  client, pool, userId, senderEmail, trustedReaders, approvalVerificationKey,
  readAuthenticatedReceivingEvidence, readVerifiedEvidenceReference,
  clock = () => Date.now()
} = {}) {
  if (typeof clock !== 'function' || !pool || typeof pool.connect !== 'function' ||
      typeof pool.query !== 'function' || typeof approvalVerificationKey !== 'string' ||
      approvalVerificationKey.length < 32 || typeof senderEmail !== 'string' ||
      typeof userId !== 'string' || !trustedReaders || typeof trustedReaders !== 'object') {
    return Object.freeze({ configured: false, runOne: async () => denied('protected-primary-provider-signer-and-trusted-readers-required') });
  }
  const evidence = createUberWarm2ProtectedWinnrRuntime({
    client, trustedReaders, clock, transportMode: 'WINNR_INBOX_HTTPS_API'
  });
  const signedReaderConfigured = typeof readAuthenticatedReceivingEvidence === 'function' &&
    typeof readVerifiedEvidenceReference === 'function';
  const transport = createUberWarm2WinnrHttpsSeedBridge({
    client, userId, senderEmail, clock,
    verifyCurrentSenderHealth: evidence.verifyCurrentSenderHealth,
    verifyCurrentSeedConsent: evidence.verifyCurrentSeedConsent
  });
  const configured = evidence.configured === true && transport.ok === true && signedReaderConfigured;
  const ledger = createUberWarm2PgLedger({ pool });
  const placement = createUberWarm2ProtectedReceiverPlacementWiring({
    readAuthenticatedReceivingEvidence, readVerifiedEvidenceReference, clock
  });

  return Object.freeze({
    version: UBERWARM2_PROTECTED_ONE_SHOT_OPERATOR_VERSION,
    configured,
    // Configured only means all CALLABLE interfaces are provided; actual
    // signed evidence is read fresh and refused whenever missing or stale.
    ready: false, sendAuthority: 'NONE', automaticRetryAuthorized: false,
    async runOne({ batch, probeId, approval } = {}) {
      if (!configured) return denied('trusted-protected-live-readers-and-transport-required');
      if (!batch || !Array.isArray(batch.probes) || batch.probes.length !== 1 ||
          batch.probes[0]?.probeId !== probeId ||
          batch.probes[0]?.senderEmail !== senderEmail)
        return denied('exact-one-sender-one-probe-batch-required');
      // The core executor validates the immutable batch digest, signed owner
      // approval, sender and receiver reads, DB claim, caps and rechecks after
      // reservation. No alternative send path exists in this composition.
      const receipt = await executeUberWarm2SeedProbe({
        batch, probeId, approval, approvalVerificationKey,
        store: ledger, transport,
        verifyCurrentSenderHealth: evidence.verifyCurrentSenderHealth,
        verifyCurrentSeedConsent: evidence.verifyCurrentSeedConsent,
        clock
      });
      if (receipt.status !== 'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN')
        return Object.freeze({ ...receipt, automaticRetryAuthorized: false, verifiedPlacements: 0 });
      let received;
      try {
        received = await placement.compileProtectedReceivedEvidence({
          batch, receipts: [receipt], at: Number(clock())
        });
      } catch { received = null; }
      // The receiver-side evidence compiler can verify a true Inbox/Spam
      // only through independent signed receiver references. A failed lookup
      // is never interpreted as spam, delivery failure or authority to retry.
      if (received?.ok === true && received.verifiedPlacements === 1) {
        return Object.freeze({ ...receipt, placementStatus: 'INDEPENDENT_RECEIVING_PLACEMENT_VERIFIED',
          verifiedPlacements: 1, placement: received.report,
          automaticRetryAuthorized: false });
      }
      return Object.freeze({ ...receipt,
        placementStatus: 'RECEIVING_PLACEMENT_NOT_VERIFIED', verifiedPlacements: 0,
        automaticRetryAuthorized: false });
    }
  });
}
