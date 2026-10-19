/**
 * A protected one-shot integration of the already-existing, verified UberWarm²
 * components. This is not a service or an unattended sender. Nothing is sent
 * by construction. An operator must explicitly enable this one invocation AND
 * present a genuine exact-batch HMAC approval. Source callbacks do not establish
 * trusted identity, sender clearance, or recipient consent by themselves.
 *
 * All injected reader callbacks MUST verify original evidence in the protected
 * runtime; never wire fixture readers, public chat strings, or self-signed
 * claims purporting to be vendor/recipient attestations into production.
 */
import { executeUberWarm2SeedProbe } from './uberwarm2-seed-executor.mjs';
import { createUberWarm2PgLedger } from './uberwarm2-pg-ledger.mjs';
import { createUberWarm2ProtectedWinnrRuntime } from './uberwarm2-protected-winnr-runtime.mjs';
import { createUberWarm2WinnrHttpsSeedBridge } from './uberwarm2-winnr-https-seed-bridge.mjs';

export const UBERWARM2_ONE_SHOT_RUNTIME_VERSION = 'uberbond.uberwarm2-one-shot-runtime.v1';
const REQUIRED_READERS = Object.freeze([
  'readVerifiedHttpsTransport', 'readLocalHold', 'readVerifiedDnsAlignment',
  'readAuthenticatedConsent', 'readCurrentReceiveReady', 'readSuppression'
]);
const reject = reasonCodes => Object.freeze({
  ok: false, status: 'UBERWARM2_ONE_SHOT_NOT_AUTHORIZED',
  reasonCodes: Object.freeze(reasonCodes), providerSubmissions: 0,
  verifiedPlacements: 0, externalEffectAuthority: 'NONE'
});

export function createUberWarm2AuthorizedOneShotRuntime({
  client, pool, senderEmail, userId, trustedReaders = {},
  approvalVerificationKey = '', clock = () => Date.now(),
  operatorExecutionEnabled = false
} = {}) {
  const missing = REQUIRED_READERS.filter(k => typeof trustedReaders?.[k] !== 'function');
  if (operatorExecutionEnabled !== true) missing.push('protected-execution-switch-not-enabled');
  if (typeof approvalVerificationKey !== 'string' || approvalVerificationKey.length < 32)
    missing.push('server-held-approval-verifier-unavailable');
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function')
    missing.push('authoritative-postgresql-primary-ledger-unavailable');
  if (!client || typeof client.listAllMailboxes !== 'function' ||
    typeof client.listAllDomains !== 'function' || typeof client.getDnsStatus !== 'function' ||
    typeof client.getMailbox !== 'function' || typeof client.sendOwnerSeedViaHttps !== 'function')
    missing.push('authenticated-winnr-https-client-unavailable');
  if (typeof clock !== 'function') missing.push('trusted-clock-unavailable');
  const denied = missing.length > 0;
  const source = denied ? null : createUberWarm2ProtectedWinnrRuntime({
    client, clock, transportMode: 'WINNR_INBOX_HTTPS_API', trustedReaders
  });
  const transport = denied ? null : createUberWarm2WinnrHttpsSeedBridge({
    client, userId, senderEmail,
    verifyCurrentSenderHealth: source.verifyCurrentSenderHealth,
    verifyCurrentSeedConsent: source.verifyCurrentSeedConsent, clock
  });
  const configured = !denied && source?.configured === true && transport?.ok === true;
  const reasonCodes = Object.freeze([
    ...missing,
    ...(!denied ? [...(source?.reasonCodes ?? []), ...(transport?.reasonCodes ?? [])] : [])
  ]);
  return Object.freeze({
    version: UBERWARM2_ONE_SHOT_RUNTIME_VERSION,
    configured,
    // Assembly proves neither live authorization nor delivery. Only returned
    // execution receipts and independent receiving-side evidence can do that.
    ready: false, sendAuthority: 'NONE', reasonCodes,
    async executeApprovedOneShot({ batch, probeId, approval } = {}) {
      if (!configured) return reject(reasonCodes.length ? reasonCodes : ['protected-runner-not-configured']);
      // Never manufacture an approval from a chat instruction or the HMAC key.
      // The existing executor cryptographically verifies this provided record.
      return executeUberWarm2SeedProbe({
        batch, probeId, approval, approvalVerificationKey,
        store: createUberWarm2PgLedger({ pool }), transport,
        verifyCurrentSenderHealth: source.verifyCurrentSenderHealth,
        verifyCurrentSeedConsent: source.verifyCurrentSeedConsent, clock
      });
    }
  });
}
