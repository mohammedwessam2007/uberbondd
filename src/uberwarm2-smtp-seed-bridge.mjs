import { createHash } from 'node:crypto';
import { createUberSmtpSubmissionTransport } from './ubersmtp-submission-adapter.mjs';
import { openSmtpAccountCredential } from './uberfleet.mjs';
import { UBERWARM2_SEED_TEMPLATE } from './uberwarm2-seed-executor.mjs';
import { consumeSendCapability, hasSendCapability } from './uberwarm2-send-capability.mjs';

export const UBERWARM2_SMTP_BRIDGE_VERSION = 'uberbond.uberwarm2-smtp-seed-bridge.v1';
const PURPOSE = 'OWNER_CONTROLLED_PLACEMENT_PROBE';
const PROBE_ID = /^[A-Za-z0-9._:-]{1,250}$/;
const RESERVATION_KEY = /^uberwarm2-seed:[a-f0-9]{64}$/;
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{3})?Z$/;
const lower = v => String(v ?? '').trim().toLowerCase();
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower(v));
const sha = v => createHash('sha256').update(String(v)).digest('hex');
// Provider correlation compares the bracket-free, lower-cased form only.
const normalizeMessageId = v => String(v).trim().replace(/^<|>$/g, '').toLowerCase();
// Before transmission: nothing left the process, so the caller may retry safely.
const refused = reason => ({
  ok: false, accepted: false, notTransmitted: true,
  status: 'UBERWARM2_SMTP_BRIDGE_REFUSED', reasonCodes: [reason]
});
// After transmission: the provider may already have accepted the message.
const uncertain = () => ({
  ok: false, accepted: false, notTransmitted: false,
  status: 'SMTP_OUTCOME_UNCERTAIN', reasonCodes: ['external-effect-may-have-occurred-no-retry']
});

// A canonical UTC instant is an ISO-8601 'Z' timestamp whose parsed value
// re-serialises to the same calendar fields. Date-only, offset and impossible
// calendar forms are rejected rather than normalised.
function canonicalUtcMs(value) {
  if (typeof value !== 'string') return null;
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === match[1] ? ms : null;
}

// One read per field, so a getter cannot report one value to the decision and
// another to anything that follows it.
const seedSnapshot = row => ({
  email: row?.email, ownerControlled: row?.ownerControlled, receiveReady: row?.receiveReady,
  consentToTest: row?.consentToTest, consentEvidenceRef: row?.consentEvidenceRef,
  permissionExpiresAt: row?.permissionExpiresAt
});

// Every row for one normalised address must agree and independently grant
// consent. A conflict, a withdrawal, missing evidence, or a missing or expired
// canonical expiry excludes the address entirely: fail closed.
function seedGroupReason(group, nowMs) {
  if (!Number.isFinite(nowMs)) return 'clock-unreadable';
  const [first] = group;
  if (group.some(r => r.ownerControlled !== first.ownerControlled ||
      r.receiveReady !== first.receiveReady || r.consentToTest !== first.consentToTest))
    return 'seed-consent-conflict-fail-closed';
  for (const r of group) {
    if (r.ownerControlled !== true || r.receiveReady !== true || r.consentToTest !== true)
      return 'seed-consent-not-granted';
    if (typeof r.consentEvidenceRef !== 'string' || !r.consentEvidenceRef.trim())
      return 'seed-consent-evidence-required';
    const expiresAt = canonicalUtcMs(r.permissionExpiresAt);
    if (expiresAt === null) return 'seed-permission-expiry-not-canonical-utc';
    if (expiresAt <= nowMs) return 'seed-permission-expired';
  }
  return null;
}

// Decides every address present in the rows at the given instant. Rows are
// read on every call, so a withdrawal after bind is seen at the next send.
function seedDecisions(rows, nowMs) {
  const groups = new Map();
  for (const row of rows) {
    const snap = seedSnapshot(row);
    const address = lower(snap.email);
    if (!groups.has(address)) groups.set(address, []);
    groups.get(address).push(snap);
  }
  const decisions = new Map();
  for (const [address, group] of groups) {
    decisions.set(address, emailOk(address) ? seedGroupReason(group, nowMs) : 'seed-address-malformed');
  }
  return decisions;
}

function bindAtConstruction({ account, encryptionKey, seedRows, nowMs }) {
  const sender = lower(account.email);
  const mailboxId = String(account.sendingMailboxId || '').trim();
  const route = account.smtpRoute || {};
  const seedAllowed = [...seedDecisions(seedRows, nowMs).values()].some(reason => reason === null);
  const valid = emailOk(sender) && mailboxId && account.connected === true &&
    !account.paused && !account.quarantined && !account.placementQuarantine && account.tokens &&
    route.authorized === true && route.termsCompatible === true && route.evidenceRef &&
    typeof route.host === 'string' && route.host.trim() &&
    route.secure === true && String(encryptionKey) && seedAllowed;
  return valid
    ? { sender, mailboxId, route, host: route.host.trim(), port: route.port, evidenceRef: route.evidenceRef }
    : null;
}

/**
 * Bind a single already-authorized encrypted UberFleet SMTP identity
 * to an explicit consenting owned-seed allowlist. This never provisions
 * accounts or operates a reputation/engagement network.
 *
 * Every send re-reads the live account, route and seed rows, and needs a
 * live one-shot send capability (src/uberwarm2-send-capability.mjs) that is
 * spent only at the point of transmission. The bridge never rejects.
 */
export function createUberWarm2SmtpSeedBridge({
  account = {}, encryptionKey = '', allowedSeeds = [],
  credentialReader = openSmtpAccountCredential,
  transportFactory = createUberSmtpSubmissionTransport,
  clock = () => Date.now()
} = {}) {
  const accountRef = account && typeof account === 'object' ? account : {};
  // Rows are kept by reference: the allowlist is evaluated against them on
  // every send, not frozen at construction.
  const seedRows = Array.isArray(allowedSeeds) ? allowedSeeds.slice() : [];
  let bound = null;
  try { bound = bindAtConstruction({ account: accountRef, encryptionKey, seedRows, nowMs: Number(clock()) }); }
  catch { bound = null; }
  if (!bound) return {
    ok: false, authorizedSmtp: false,
    status: 'UBERWARM2_SMTP_BRIDGE_BLOCKED',
    reasonCodes: ['encrypted-account-authorized-route-and-real-seed-evidence-required'],
    messagesSent: 0, notTransmitted: true
  };
  const boundRoute = bound.route;

  // Re-reads account and route at call time. The returned snapshot, not the
  // live object, feeds the transport, so a field cannot change between the
  // check and the use.
  function liveSnapshot() {
    if (accountRef.smtpRoute !== boundRoute) return { reason: 'smtp-route-object-replaced' };
    const a = {
      connected: accountRef.connected, paused: accountRef.paused, quarantined: accountRef.quarantined,
      placementQuarantine: accountRef.placementQuarantine, tokens: accountRef.tokens,
      email: lower(accountRef.email), mailboxId: String(accountRef.sendingMailboxId || '').trim()
    };
    const r = {
      authorized: boundRoute.authorized, termsCompatible: boundRoute.termsCompatible,
      evidenceRef: boundRoute.evidenceRef, host: boundRoute.host, port: boundRoute.port, secure: boundRoute.secure
    };
    if (a.connected !== true || a.paused || a.quarantined || a.placementQuarantine || !a.tokens)
      return { reason: 'sender-account-not-live' };
    if (a.email !== bound.sender || a.mailboxId !== bound.mailboxId)
      return { reason: 'sender-identity-changed' };
    if (r.authorized !== true || r.termsCompatible !== true || !r.evidenceRef || r.evidenceRef !== bound.evidenceRef)
      return { reason: 'smtp-route-authorization-or-terms-revoked' };
    if (typeof r.host !== 'string' || r.host.trim() !== bound.host || r.port !== bound.port || r.secure !== true)
      return { reason: 'smtp-route-changed' };
    return { reason: null, route: r };
  }

  return Object.freeze({
    ok: true, authorizedSmtp: true, boundSender: bound.sender,
    boundMailboxId: bound.mailboxId, version: UBERWARM2_SMTP_BRIDGE_VERSION,
    async sendOwnedSeed(request) {
      let spent = false;
      try {
        if (!request || typeof request !== 'object') return refused('probe-request-required');
        const { from, to, subject, body, probeId, reservationKey, permittedPurpose } = request;
        // Only primitive strings pass. An object whose toString changes between
        // reads cannot be checked as one value and transmitted as another.
        if ([from, to, subject, body, probeId, reservationKey, permittedPurpose].some(v => typeof v !== 'string'))
          return refused('probe-fields-must-be-strings');
        if (!PROBE_ID.test(probeId)) return refused('probe-id-malformed');
        // The body must be the approved template for this probe, with nothing
        // appended. A substring test would let an attached sentence through.
        if (body !== `${UBERWARM2_SEED_TEMPLATE.bodyPrefix}${probeId}`)
          return refused('body-not-approved-template-for-probe');
        if (subject !== UBERWARM2_SEED_TEMPLATE.subject) return refused('subject-not-approved-template');
        if (permittedPurpose !== PURPOSE) return refused('permitted-purpose-mismatch');
        if (!RESERVATION_KEY.test(reservationKey)) return refused('reservation-key-malformed');
        const recipient = lower(to);
        const live = liveSnapshot();
        if (live.reason) return refused(live.reason);
        if (lower(from) !== bound.sender) return refused('sender-not-bound-identity');
        const decisions = seedDecisions(seedRows, Number(clock()));
        const seedReason = decisions.has(recipient) ? decisions.get(recipient) : 'seed-not-allowlisted';
        if (seedReason !== null) return refused(seedReason);
        // The capability must be bound to exactly this send: sender, seed, probe,
        // subject, body, purpose and reservation. A capability for another probe
        // cannot authorize this one.
        const binding = { from, to, probeId, subject, body, permittedPurpose, reservationKey };
        // Non-spending pre-check: no credential is decrypted and no transport is
        // built for a request that holds no authority.
        if (!hasSendCapability(reservationKey, binding)) return refused('send-capability-not-live');
        let secret;
        try { secret = credentialReader(accountRef, encryptionKey); }
        catch { return refused('encrypted-credential-unavailable'); }
        // Errors from the factory and transport are not forwarded: a provider
        // message may echo the username or password it was handed.
        let transport, send;
        try {
          transport = transportFactory({
            host: live.route.host, port: live.route.port, secure: true,
            username: secret?.username, password: secret?.password,
            authorized: true, termsCompatible: true, evidenceRef: live.route.evidenceRef
          });
          if (transport?.ok !== true) return refused('authorized-smtp-transport-not-ready');
          send = transport.send;
        } catch { return refused('authorized-smtp-transport-not-ready'); }
        if (typeof send !== 'function') return refused('authorized-smtp-transport-not-ready');
        // Point of transmission: every other check has passed. The one-shot
        // authority is spent here, so no refused request above consumes it.
        if (consumeSendCapability(reservationKey, binding) !== true) return refused('send-capability-not-live');
        spent = true;
        // The Message-ID is a correlation token only, NOT duplicate prevention;
        // the atomic PostgreSQL reservation provides that boundary.
        const messageId = `<uw2-${sha(reservationKey).slice(0, 32)}@${bound.sender.split('@')[1]}>`;
        let result;
        try {
          result = await send.call(transport, { from: bound.sender, to: recipient, subject, body, messageId });
        } catch {
          // A thrown send may already have been accepted. Report it as uncertain.
          return uncertain();
        }
        // Only the messageId this bridge generated can correlate a provider
        // result. A provider-chosen id is not evidence of this submission.
        try {
          const confirmed = result?.confirmed;
          const providerId = result?.messageId;
          if (confirmed === true && typeof providerId === 'string' &&
              normalizeMessageId(providerId) === normalizeMessageId(messageId))
            return { ok: true, accepted: true, notTransmitted: false, messageId,
              status: 'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN' };
          return uncertain();
        } catch { return uncertain(); }
      } catch {
        // Any unreadable state before the capability is spent is a refusal. After
        // it is spent, the outcome is uncertain.
        return spent ? uncertain() : refused('bridge-state-unreadable');
      }
    }
  });
}
