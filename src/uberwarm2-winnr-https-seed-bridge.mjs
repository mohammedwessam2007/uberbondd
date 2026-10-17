/**
 * Winnr HTTPS alternative for one already-approved owner-controlled seed
 * submission. Railway Hobby need not open outbound SMTP ports.
 *
 * This object is intentionally inert without the executor's exact send
 * capability, independently trusted current health/consent readers and a
 * provider-confirmed sender identity. The durable one-shot PostgreSQL claim
 * and signed batch approval happen in executeUberWarm2SeedProbe BEFORE this.
 *
 * No bulk send, forwarding, SMTP, warmer purchase, automatic retry or receive
 * placement claim is possible through this bridge.
 */
import { hasSendCapability, consumeSendCapability } from './uberwarm2-send-capability.mjs';
import { UBERWARM2_SEED_TEMPLATE } from './uberwarm2-seed-executor.mjs';

export const UBERWARM2_WINNR_HTTPS_BRIDGE_VERSION = 'uberbond.uberwarm2-winnr-https-seed-bridge.v1';
const STRICT_EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+$/;
const PROBE_ID = /^[A-Za-z0-9._:-]{1,250}$/;
const USER_ID = /^[A-Za-z0-9._:-]{1,240}$/;
const RESERVATION_KEY = /^uberwarm2-seed:[a-f0-9]{64}$/;
const PURPOSE = 'OWNER_CONTROLLED_PLACEMENT_PROBE';

const blocked = reason => Object.freeze({
  ok: false, accepted: false, notTransmitted: true, status: 'UBERWARM2_WINNR_HTTPS_REFUSED',
  reasonCodes: Object.freeze([reason]), automaticRetryAuthorized: false
});
const unknown = () => Object.freeze({
  ok: false, accepted: false, notTransmitted: false, status: 'SUBMISSION_OUTCOME_UNCERTAIN',
  automaticRetryAuthorized: false
});

export function createUberWarm2WinnrHttpsSeedBridge({
  client, userId, senderEmail, verifyCurrentSenderHealth,
  verifyCurrentSeedConsent, clock = () => Date.now()
} = {}) {
  const sender = typeof senderEmail === 'string' ? senderEmail : '';
  const valid = STRICT_EMAIL.test(sender) && sender === sender.toLowerCase() &&
    typeof userId === 'string' && USER_ID.test(userId) &&
    client && typeof client === 'object' &&
    typeof client.getMailbox === 'function' &&
    typeof client.sendOwnerSeedViaHttps === 'function' &&
    typeof verifyCurrentSenderHealth === 'function' &&
    typeof verifyCurrentSeedConsent === 'function' &&
    typeof clock === 'function';
  if (!valid) {
    return Object.freeze({
      ok: false, authorizedSmtp: false, authorizedHttpsApi: false,
      transportKind: 'WINNR_INBOX_HTTPS_API',
      status: 'UBERWARM2_WINNR_HTTPS_BRIDGE_BLOCKED',
      reasonCodes: Object.freeze(['authenticated-winnr-client-exact-sender-and-trusted-readers-required']),
      sendOwnedSeed: async () => blocked('transport-not-configured')
    });
  }

  return Object.freeze({
    ok: true, authorizedSmtp: false, authorizedHttpsApi: true,
    transportKind: 'WINNR_INBOX_HTTPS_API', boundSender: sender,
    version: UBERWARM2_WINNR_HTTPS_BRIDGE_VERSION,
    async sendOwnedSeed(request) {
      let spent = false;
      try {
        if (!request || typeof request !== 'object') return blocked('missing-exact-send');
        const { from, to, subject, body, probeId, reservationKey, permittedPurpose } = request;
        if (![from, to, subject, body, probeId, reservationKey, permittedPurpose].every(x => typeof x === 'string') ||
            from !== sender || !STRICT_EMAIL.test(to) || to === sender ||
            !PROBE_ID.test(probeId) || !RESERVATION_KEY.test(reservationKey) ||
            permittedPurpose !== PURPOSE ||
            subject !== UBERWARM2_SEED_TEMPLATE.subject ||
            body !== UBERWARM2_SEED_TEMPLATE.bodyPrefix + probeId)
          return blocked('immutable-seed-send-identity-or-template-mismatch');
        const binding = { from, to, subject, body, probeId, reservationKey, permittedPurpose };
        if (!hasSendCapability(reservationKey, binding)) return blocked('durable-claim-send-capability-required');
        let now;
        try { now = Number(clock()); } catch { return blocked('clock-unavailable'); }
        if (!Number.isFinite(now) || now <= 0) return blocked('clock-unavailable');
        // Independent current evidence, not an immutable authorization from
        // an earlier receipt. One provider GET checks the exact mailbox ID.
        const [mailbox, health, consent] = await Promise.all([
          client.getMailbox({ userId }),
          verifyCurrentSenderHealth(sender, now),
          verifyCurrentSeedConsent(to, probeId, now)
        ]);
        const row = mailbox?.data;
        const rowId = row?.id ?? row?.userId ?? row?.user_id;
        const rowEmail = row?.email ?? row?.address;
        const status = String(row?.status ?? '').toLowerCase();
        if (mailbox?.ok !== true || !mailbox?.receipt?.responseDigest ||
            rowId !== userId || rowEmail !== sender || status !== 'active' ||
            row?.paused === true || row?.quarantined === true ||
            health !== true || consent !== true)
          return blocked('provider-identity-sender-hold-or-seed-consent-not-current');
        // Exact capability spent before the provider write. A timeout after
        // this point might have delivered the message and MUST NOT be retried.
        if (!consumeSendCapability(reservationKey, binding))
          return blocked('send-capability-revoked-before-write');
        spent = true;
        let result;
        try {
          result = await client.sendOwnerSeedViaHttps({
            userId, to, subject, body, writeAuthorized: true
          });
        } catch { return unknown(); }
        const id = result?.data?.message_id ?? result?.data?.messageId;
        if (result?.ok === true && result?.status === 'UBERWINNR_WRITE_CONFIRMED' &&
            typeof id === 'string' && id.trim().length > 0 && id.length <= 500 &&
            result?.receipt?.responseDigest)
          return Object.freeze({
            ok: true, accepted: true, notTransmitted: false, messageId: id,
            status: 'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN', automaticRetryAuthorized: false
          });
        return unknown();
      } catch {
        return spent ? unknown() : blocked('protected-provider-read-failed');
      }
    }
  });
}
