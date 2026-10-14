import { createHash } from 'node:crypto';
import { createUberSmtpSubmissionTransport } from './ubersmtp-submission-adapter.mjs';
import { openSmtpAccountCredential } from './uberfleet.mjs';
import { UBERWARM2_SEED_TEMPLATE } from './uberwarm2-seed-executor.mjs';

export const UBERWARM2_SMTP_BRIDGE_VERSION = 'uberbond.uberwarm2-smtp-seed-bridge.v1';
const lower = v => String(v ?? '').trim().toLowerCase();
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower(v));
const sha = v => createHash('sha256').update(String(v)).digest('hex');
const refused = reason => ({ ok: false, accepted: false, status: 'UBERWARM2_SMTP_BRIDGE_REFUSED', reasonCodes: [reason] });

/**
 * Bind a single already-authorized encrypted UberFleet SMTP identity
 * to an explicit consenting owned-seed allowlist. This never provisions
 * accounts or operates a reputation/engagement network.
 */
export function createUberWarm2SmtpSeedBridge({
  account = {}, encryptionKey = '', allowedSeeds = [],
  credentialReader = openSmtpAccountCredential,
  transportFactory = createUberSmtpSubmissionTransport
} = {}) {
  const sender = lower(account.email);
  const mailboxId = String(account.sendingMailboxId || '').trim();
  const route = account.smtpRoute || {};
  const allowed = new Set((Array.isArray(allowedSeeds) ? allowedSeeds : [])
    .filter(s => emailOk(s?.email) && s.ownerControlled === true &&
      s.receiveReady === true && s.consentToTest === true &&
      typeof s.consentEvidenceRef === 'string' && s.consentEvidenceRef.trim())
    .map(s => lower(s.email)));
  const valid = emailOk(sender) && mailboxId && account.connected === true &&
    account.paused !== true && account.quarantined !== true &&
    account.placementQuarantine !== true && account.tokens &&
    route.authorized === true && route.termsCompatible === true && route.evidenceRef &&
    typeof route.host === 'string' && route.host.trim() &&
    route.secure === true && String(encryptionKey) && allowed.size > 0;
  if (!valid) return {
    ok: false, authorizedSmtp: false,
    status: 'UBERWARM2_SMTP_BRIDGE_BLOCKED',
    reasonCodes: ['encrypted-account-authorized-route-and-real-seed-evidence-required'],
    messagesSent: 0
  };
  return Object.freeze({
    ok: true, authorizedSmtp: true, boundSender: sender,
    boundMailboxId: mailboxId, version: UBERWARM2_SMTP_BRIDGE_VERSION,
    async sendOwnedSeed({ from, to, subject, body, probeId, reservationKey, permittedPurpose } = {}) {
      const recipient = lower(to);
      // The body must be the approved template rendered for this probe, with no
      // text appended. A substring test would let an attached sentence through.
      if (lower(from) !== sender || !allowed.has(recipient) ||
          permittedPurpose !== 'OWNER_CONTROLLED_PLACEMENT_PROBE' ||
          !/^uberwarm2-seed:[a-f0-9]{64}$/.test(String(reservationKey)) ||
          !/^UberBond permitted mailbox delivery test$/.test(String(subject)) ||
          String(body) !== `${UBERWARM2_SEED_TEMPLATE.bodyPrefix}${String(probeId)}`)
        return refused('probe-identity-purpose-or-seed-not-allowlisted');
      let secret;
      try { secret = credentialReader(account, encryptionKey); }
      catch { return refused('encrypted-credential-unavailable'); }
      // Errors from the factory and transport are not forwarded: a provider
      // message may echo the username or password it was handed.
      let transport;
      try {
        transport = transportFactory({
          host: route.host, port: route.port, secure: true,
          username: secret?.username, password: secret?.password,
          authorized: true, termsCompatible: true, evidenceRef: route.evidenceRef
        });
      } catch { return refused('authorized-smtp-transport-not-ready'); }
      if (transport?.ok !== true || typeof transport.send !== 'function')
        return refused('authorized-smtp-transport-not-ready');
      // Idempotent Message-ID is a correlation token only, NOT duplicate
      // prevention; the atomic PostgreSQL reservation provides that boundary.
      const messageId = `<uw2-${sha(reservationKey).slice(0,32)}@${sender.split('@')[1]}>`;
      let result;
      try {
        result = await transport.send({ from: sender, to: recipient, subject, body, messageId });
      } catch {
        // A thrown send may already have been accepted. Report it as uncertain.
        return { ok: false, accepted: false, status: 'SMTP_OUTCOME_UNCERTAIN' };
      }
      return result?.confirmed === true && result?.messageId
        ? { ok: true, accepted: true, messageId: String(result.messageId),
            status: 'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN' }
        : { ok: false, accepted: false, status: 'SMTP_OUTCOME_UNCERTAIN' };
    }
  });
}
