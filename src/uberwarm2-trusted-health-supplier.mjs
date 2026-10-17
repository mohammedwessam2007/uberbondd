import { createHash } from 'node:crypto';

// Protected, read-only supplier that reconciles independent trusted readers into
// the single canonical sender-health row consumed by createUberWarm2LivePreflight
// in src/uberwarm2-smtp-seed-bridge.mjs. It loads no provider credentials, opens
// no provider connection and performs no external effect: every input is an
// injected read callback, re-read fresh on each call.
export const UBERWARM2_TRUSTED_HEALTH_SUPPLIER_VERSION =
  'uberbond.uberwarm2-trusted-health-supplier.v1';

const MAX_AGE_MS = 300000;
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{3})?Z$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = v => (typeof v === 'string' && v.trim() ? v.trim() : '');
const lower = v => String(v ?? '').trim().toLowerCase();
const emailOk = v => EMAIL.test(lower(v));
const domainOf = v => lower(v).split('@')[1] || '';
const digest = refs => `sha256:${createHash('sha256').update(refs.join('\u0000')).digest('hex')}`;

// A canonical UTC instant is an ISO-8601 'Z' timestamp whose parsed value
// re-serialises to the same calendar fields; offset and date-only forms reject.
function canonicalUtcMs(value) {
  if (typeof value !== 'string') return null;
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === match[1] ? ms : null;
}

// Exactly one fresh read per callback. The result is cloned once, so a getter,
// Proxy or later mutation cannot report one value to validation and another to
// the emitted row.
async function readOne(reader, query) {
  if (typeof reader !== 'function') return null;
  try {
    const rows = structuredClone(await reader(query));
    return Array.isArray(rows) && rows.length === 1 && rows[0] && typeof rows[0] === 'object'
      ? rows[0] : null;
  } catch { return null; }
}

// Identity, freshness and evidence must all hold and agree on the exact sender
// email and domain. Any missing, contradictory or stale field denies.
function observed(row, email, domain, now) {
  if (!row || lower(row.email) !== email || lower(row.domain) !== domain) return null;
  const at = canonicalUtcMs(row.observedAt);
  const evidenceRef = str(row.evidenceRef);
  if (at === null || at > now || now - at > MAX_AGE_MS || !evidenceRef) return null;
  return { at, evidenceRef };
}

/** Build a readSenderHealth supplier from protected trusted read callbacks.
 * Each callback returns [row] for { email, domain, at } and must be re-read
 * fresh. Returns the single canonical observation row, or [] when any input is
 * absent, ambiguous, stale, contradictory or throws: it never fails open.
 */
export function createUberWarm2TrustedHealthSupplier({
  readProviderMailbox, readProviderDomainDns, readVerifiedSmtp, readLocalHold,
  readVerifiedDnsAlignment, readVerifiedHttpsTransport, transportMode = 'SMTP', clock
} = {}) {
  const now = typeof clock === 'function' ? clock : () => Date.now();

  async function readSenderHealth({ email, at } = {}) {
    try {
      if (!['SMTP', 'WINNR_INBOX_HTTPS_API'].includes(transportMode)) return [];
      const sender = lower(email);
      const domain = domainOf(sender);
      const nowMs = Number(now());
      // The caller's instant must itself be live, bounded and not in the future.
      if (!emailOk(sender) || !domain || !Number.isFinite(at) || !Number.isFinite(nowMs) ||
          nowMs < at || nowMs - at > MAX_AGE_MS) return [];
      const query = { email: sender, domain, at };
      const [mailbox, dns, smtp, hold, align] = await Promise.all([
        readOne(readProviderMailbox, query),
        readOne(readProviderDomainDns, query),
        readOne(transportMode === 'SMTP' ? readVerifiedSmtp : readVerifiedHttpsTransport, query),
        readOne(readLocalHold, query),
        readOne(readVerifiedDnsAlignment, query)
      ]);
      // The protected readers may await a remote provider. Do not use a clock
      // captured before the wait when deciding observation freshness.
      const postReadNow = Number(now());
      if (!Number.isFinite(postReadNow) || postReadNow < nowMs ||
          postReadNow - at > MAX_AGE_MS) return [];
      const m = observed(mailbox, sender, domain, postReadNow);
      const d = observed(dns, sender, domain, postReadNow);
      const s = observed(smtp, sender, domain, postReadNow);
      const h = observed(hold, sender, domain, postReadNow);
      const a = observed(align, sender, domain, postReadNow);
      if (!m || !d || !s || !h || !a) return [];
      // Provider Active never proves SMTP authentication or HTTPS write scope.
      // Each mode needs its own independent signed, fresh transport observation.
      const transportOk = transportMode === 'SMTP'
        ? smtp.authenticated === true && smtp.signed === true &&
          smtp.transportAuthorized === true && smtp.secure === true &&
          smtp.termsCompatible === true
        : smtp.signed === true && smtp.transportAuthorized === true &&
          smtp.secure === true && smtp.termsCompatible === true &&
          smtp.authenticated === true && smtp.senderIdentityVerified === true &&
          smtp.providerWritePermissionVerified === true &&
          smtp.submissionEndpoint === 'WINNR_INBOX_HTTPS_API' &&
          smtp.authorizedPurpose === 'OWNER_CONTROLLED_PLACEMENT_PROBE';
      if (mailbox.connected !== true ||
          mailbox.paused !== false || mailbox.quarantined !== false ||
          mailbox.placementQuarantine !== false || mailbox.policyCompatible !== true ||
          // A matching DNS row is not proof of readiness. Require a trusted
          // provider-ready verdict in addition to separately verified alignment.
          dns.ready !== true ||
          !transportOk ||
          hold.held !== false || hold.suppressed !== false ||
          align.aligned !== true || align.signed !== true) return [];
      // DNS record presence is never DKIM alignment: only the signed alignment
      // reader sets dnsAuthenticated. The provider DNS row is used strictly to
      // confirm the exact domain was reached, not that any record exists.
      return [{
        email: sender,
        observedAt: new Date(Math.min(m.at, d.at, s.at, h.at, a.at)).toISOString(),
        evidenceRef: `uberwarm2-trusted-health:${digest([m, d, s, h, a].map(x => x.evidenceRef))}`,
        authenticationStatus: 'AUTHENTICATED',
        dnsAuthenticated: true,
        transportAuthorized: true,
        providerPolicyCompatible: true,
        paused: false,
        quarantined: false,
        placementQuarantine: false
      }];
    } catch { return []; }
  }

  return Object.freeze({ readSenderHealth, version: UBERWARM2_TRUSTED_HEALTH_SUPPLIER_VERSION });
}
