/**
 * UberWarm² trusted seed-consent supplier.
 *
 * Composes three independent, protected, read-only trusted observation sources
 * (authenticated consent, current recipient receive-readiness, and suppression/
 * opt-out) into the single fresh row shape expected by
 * createUberWarm2LivePreflight's readSeedConsent. The three callbacks are
 * re-read on every invocation.
 *
 * This module establishes no consent, verifies nothing on behalf of the caller,
 * performs no network, SMTP, provider or production call, and can only narrow
 * what the trusted sources already assert. Missing, stale, duplicate,
 * contradictory, mismatched, expired, thrown or impossible-clock inputs all
 * collapse to an empty list (fail closed).
 */
export const UBERWARM2_TRUSTED_SEED_CONSENT_SUPPLIER_VERSION =
  'uberbond.uberwarm2-trusted-seed-consent-supplier.v1';

const MAX_FRESHNESS_MS = 300000;
const PROBE_ID = /^[A-Za-z0-9._:-]{1,250}$/;
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{3})?Z$/;
const lower = v => String(v ?? '').trim().toLowerCase();
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower(v));
const nonEmpty = v => typeof v === 'string' && v.trim().length > 0;

// Canonical UTC instant: an ISO-8601 'Z' timestamp whose parsed value
// re-serialises to the same calendar fields. Date-only, offset and impossible
// calendar forms are rejected rather than normalised.
function canonicalUtcMs(value) {
  if (typeof value !== 'string') return null;
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === match[1] ? ms : null;
}

// Reads one protected source into a fresh, single, exact-identity, proof-carrying
// row. Exactly one row is required: duplicates or a missing row fail closed.
// Each row must carry a nonempty receipt identifier AND verified/signed proof
// booleans, so a caller-supplied string alone can never stand in for proof.
async function readOne(reader, { email, probeId, at }, guard, clock) {
  try {
    if (typeof reader !== 'function') return null;
    if (typeof at !== 'number' || !Number.isFinite(at)) return null;
    const rows = structuredClone(await reader({ email, probeId, at }));
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const row = rows[0];
    if (!row || typeof row !== 'object' || lower(row.email) !== email) return null;
    if (row.probeId !== undefined && row.probeId !== probeId) return null;
    const observed = canonicalUtcMs(row.observedAt);
    const now = Number(clock());
    if (!Number.isFinite(now) || now < at || now - at > MAX_FRESHNESS_MS ||
        observed === null || observed > now || now - observed > MAX_FRESHNESS_MS) return null;
    if (!nonEmpty(row.receiptId) || row.receiptId.length > 250 ||
        row.verified !== true || row.signed !== true) return null;
    if (!nonEmpty(row.evidenceRef) || row.evidenceRef.length > 500 || !guard(row)) return null;
    return row;
  } catch {
    return null;
  }
}

/**
 * Build the supplier from three trusted, read-only sources. Trust must be
 * established by the caller; this factory does not create consent, contacts
 * recipients, or register any route.
 */
export function createUberWarm2TrustedSeedConsentSupplier({
  readAuthenticatedConsent, readCurrentReceiveReady, readSuppression,
  clock = () => Date.now(), maxAgeMs = MAX_FRESHNESS_MS
} = {}) {
  const freshBound = Number.isInteger(maxAgeMs) && maxAgeMs > 0 && maxAgeMs <= MAX_FRESHNESS_MS;
  return Object.freeze({
    async readSeedConsent({ email, probeId, at } = {}) {
      try {
        if (!freshBound || typeof email !== 'string' || !emailOk(email) ||
            typeof probeId !== 'string' || !PROBE_ID.test(probeId) || !Number.isFinite(at))
          return [];
        const now = Number(clock());
        if (!Number.isFinite(now) || now < at || now - at > maxAgeMs) return [];
        const base = { email: lower(email), probeId, at, now };

        const consent = await readOne(readAuthenticatedConsent, base, row =>
          row.ownerControlled === true && row.consentToTest === true && row.withdrawn === false &&
          row.optedOut === false && row.suppressed === false &&
          nonEmpty(row.consentEvidenceRef) && row.consentEvidenceRef.length <= 500 &&
          Array.isArray(row.probeIds) && row.probeIds.length === 1 &&
          row.probeIds[0] === probeId, clock);
        const ready = await readOne(readCurrentReceiveReady, base, row =>
          row.ownerControlled === true && row.independentMailbox === true &&
          row.receiveReady === true, clock);
        const suppression = await readOne(readSuppression, base, row =>
          row.withdrawn === false && row.optedOut === false && row.suppressed === false &&
          row.consentToTest !== true, clock);
        if (!consent || !ready || !suppression) return [];

        // A slow provider read must not inherit the pre-await consent time.
        const finalNow = Number(clock());
        if (!Number.isFinite(finalNow) || finalNow < now ||
            finalNow < at || finalNow - at > maxAgeMs) return [];
        for (const row of [consent, ready, suppression]) {
          const observed = canonicalUtcMs(row.observedAt);
          if (observed === null || observed > finalNow || finalNow - observed > maxAgeMs) return [];
        }
        const expiry = canonicalUtcMs(consent.permissionExpiresAt);
        if (expiry === null || expiry <= finalNow) return [];
        // Three independent sources cannot share one receipt; a collision means
        // the inputs are not independently attested.
        if (new Set([consent.receiptId, ready.receiptId, suppression.receiptId].map(String)).size !== 3)
          return [];

        return [Object.freeze({
          email: base.email,
          observedAt: consent.observedAt,
          evidenceRef: `${consent.evidenceRef}|${ready.evidenceRef}|${suppression.evidenceRef}`,
          ownerControlled: true,
          receiveReady: true,
          consentToTest: true,
          withdrawn: false,
          suppressed: false,
          consentEvidenceRef: consent.consentEvidenceRef,
          probeIds: [probeId],
          permissionExpiresAt: consent.permissionExpiresAt
        })];
      } catch {
        return [];
      }
    }
  });
}
