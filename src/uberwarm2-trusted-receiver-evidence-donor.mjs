/**
 * UberWarm² trusted receiver-evidence donor (Lane R).
 *
 * Bridges an external, protected, authenticated, READ-ONLY receiver connector
 * (receiver OAuth/IMAP credentials stay entirely outside this module) into the
 * exact shape compileUberWarm2ReceivedEvidence consumes. That compiler's
 * verifyReceivingObservation is synchronous, so the async authenticated read
 * happens here in inspect(); inspect() returns (a) the verified raw observation
 * and (b) a synchronous, content-bound proof whose verify() accepts only the
 * exact correlated identity this call authenticated. It never turns an async
 * reader into a sync callback, never trusts a sender-supplied folder label,
 * never honors a caller-key-only proof, and fails closed on duplicates,
 * timestamp inversion, unknown folder, provider mismatch or unavailable proof.
 * Unit fixture construction only: no network, secret, provider or effect.
 */
import { createHash } from 'node:crypto';

export const UBERWARM2_TRUSTED_RECEIVER_EVIDENCE_DONOR_VERSION =
  'uberbond.uberwarm2-trusted-receiver-evidence-donor.v1';

const MAX_FRESHNESS_MS = 300000;
const PROBE_ID = /^[A-Za-z0-9._:-]{1,250}$/;
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{3})?Z$/;
const PROVIDER_FOLDERS = Object.freeze(['INBOX', 'SPAM', 'OTHER']);
const RAW_PII_FIELDS = Object.freeze(['rawBody', 'bodyHtml', 'bodyText', 'rawHeaders', 'attachments', 'rawMessage', 'raw']);
const DOMAIN_PROVIDER = Object.freeze({
  gmail: 'google', googlemail: 'google', outlook: 'microsoft', hotmail: 'microsoft',
  live: 'microsoft', msn: 'microsoft', yahoo: 'yahoo', aol: 'yahoo'
});

const str = (v, n = 800) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const lower = v => String(v ?? '').trim().toLowerCase();
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower(v));
const digest = parts => `sha256:${createHash('sha256').update(parts.join('\u0000')).digest('hex')}`;
const providerFromEmail = v => DOMAIN_PROVIDER[lower(v).split('@')[1]?.split('.')[0] || ''] || '';

// Canonical UTC instant: an ISO-8601 'Z' timestamp whose parsed value
// re-serialises to the same calendar fields. Offset/date-only forms reject.
function canonicalUtcMs(value) {
  if (typeof value !== 'string') return null;
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === match[1] ? ms : null;
}

const deny = reasonCodes => Object.freeze({
  ok: false, status: 'UBERWARM2_RECEIVER_EVIDENCE_REFUSED',
  reasonCodes: [...new Set(reasonCodes)], externalEffectAuthority: 'NONE', acceptedObservations: 0
});
const hasRawPii = row => RAW_PII_FIELDS.some(field => field in row);

/** Build the donor from a protected authenticated read-only receiver connector
 * plus a current verified-evidence-reference proof source. Both are re-read,
 * exactly-one-row, on every inspect call; absence fails closed.
 */
export function createUberWarm2TrustedReceiverEvidenceDonor({
  readAuthenticatedReceivingEvidence, readVerifiedEvidenceReference,
  clock = () => Date.now(), maxAgeMs = MAX_FRESHNESS_MS
} = {}) {
  const bound = Number.isInteger(maxAgeMs) && maxAgeMs > 0 && maxAgeMs <= MAX_FRESHNESS_MS;
  // Process-local only: durable cross-run duplicate protection belongs to the authoritative ledger.
  const usedIdentity = new Set();
  const usedEvidence = new Set();

  // Exactly one fresh read per callback. The row is cloned once so a getter,
  // Proxy or later mutation cannot show validation one value and emit another.
  async function readOne(reader, query) {
    if (typeof reader !== 'function') return null;
    try {
      const rows = structuredClone(await reader(query));
      return Array.isArray(rows) && rows.length === 1 && rows[0] && typeof rows[0] === 'object' ? rows[0] : null;
    } catch { return null; }
  }

  return Object.freeze({
    async inspect({ probe = {}, receipt = {}, at } = {}) {
      const reasons = [];
      const sender = lower(probe.senderEmail), seed = lower(probe.seedEmail);
      const probeId = str(probe.probeId, 250), bodyToken = str(probe.bodyToken, 200);
      const seedProvider = lower(probe.seedProvider);
      const messageId = str(receipt.providerMessageId, 500);
      const submittedMs = canonicalUtcMs(receipt.submittedAt);
      const nowMs = Number(clock());
      if (!bound) reasons.push('invalid-freshness-bound');
      if (!PROBE_ID.test(probeId)) reasons.push('probe-id-required');
      if (!emailOk(sender)) reasons.push('sender-email-required');
      if (!emailOk(seed)) reasons.push('owned-seed-email-required');
      if (!seedProvider || !bodyToken) reasons.push('seed-provider-and-body-token-required');
      if (lower(receipt.senderEmail) !== sender || lower(receipt.seedEmail) !== seed ||
          str(receipt.probeId, 250) !== probeId) reasons.push('receipt-identity-mismatch');
      if (!messageId) reasons.push('provider-message-id-required');
      if (submittedMs === null) reasons.push('receipt-submitted-at-required');
      if (!Number.isFinite(nowMs) || !Number.isFinite(at) || nowMs < at || nowMs - at > maxAgeMs)
        reasons.push('stale-or-impossible-observation-request');
      if (reasons.length) return deny(reasons);

      const query = { probeId, senderEmail: sender, seedEmail: seed, seedProvider, providerMessageId: messageId, bodyToken, at };
      const [row, refRow] = await Promise.all([
        readOne(readAuthenticatedReceivingEvidence, query),
        readOne(readVerifiedEvidenceReference, query)
      ]);
      const finalNow = Number(clock());
      if (!row || !refRow) return deny(['authenticated-receiving-provider-verification-required']);
      if (!Number.isFinite(finalNow) || finalNow < nowMs || finalNow - at > maxAgeMs)
        return deny(['stale-or-impossible-observation-request']);
      if (hasRawPii(row)) return deny(['no-raw-pii-in-operational-receipt']);

      const observedMs = canonicalUtcMs(row.observedAt);
      const evidenceRef = str(row.receivingProviderEvidenceRef, 800);
      const providerFolder = str(row.providerFolder, 40).toUpperCase();
      const rowReasons = [];
      if (str(row.messageId, 500) !== messageId) rowReasons.push('message-id-mismatch');
      if (lower(row.senderEmail) !== sender) rowReasons.push('sender-mismatch');
      if (lower(row.seedEmail) !== seed) rowReasons.push('seed-mismatch');
      if (str(row.probeId, 250) !== probeId) rowReasons.push('probe-id-mismatch');
      if (str(row.bodyToken, 200) !== bodyToken) rowReasons.push('body-token-mismatch');
      // Cross-provider mismatch: the provider-attested provider must equal the
      // planned seed provider, and any domain-derived provider must agree too.
      if (lower(row.provider) !== seedProvider || (providerFromEmail(seed) && providerFromEmail(seed) !== seedProvider))
        rowReasons.push('seed-provider-mismatch');
      if (row.authenticated !== true) rowReasons.push('authenticated-receiving-provider-verification-required');
      if (!PROVIDER_FOLDERS.includes(providerFolder)) rowReasons.push('unknown-provider-folder');
      if (!evidenceRef) rowReasons.push('receiving-provider-evidence-ref-required');
      if (observedMs === null || observedMs < submittedMs || observedMs > finalNow + 5 * 60 * 1000 ||
          finalNow - observedMs > maxAgeMs) rowReasons.push('invalid-observation-timestamp');
      if (refRow.verified !== true || refRow.immutable !== true || refRow.signed !== true ||
          refRow.receiverAuthenticated !== true ||
          str(refRow.receivingProviderEvidenceRef, 800) !== evidenceRef ||
          str(refRow.probeId, 250) !== probeId ||
          str(refRow.messageId, 500) !== messageId ||
          lower(refRow.seedEmail) !== seed ||
          lower(refRow.senderEmail) !== sender ||
          lower(refRow.provider) !== seedProvider) rowReasons.push('evidence-reference-not-verified');
      const identityKey = digest([probeId, sender, seed, seedProvider, messageId, bodyToken, evidenceRef]);
      if (usedIdentity.has(identityKey) || usedEvidence.has(evidenceRef)) rowReasons.push('duplicate-receiving-provider-evidence');
      if (rowReasons.length) return deny(rowReasons);
      usedIdentity.add(identityKey);
      usedEvidence.add(evidenceRef);

      const observation = Object.freeze({
        probeId, senderEmail: sender, seedEmail: seed, seedProvider,
        messageId, folder: providerFolder, observedAt: new Date(observedMs).toISOString(),
        evidenceRef, observationSource: 'RECIPIENT_PROVIDER',
        receivingProviderEvidenceRef: evidenceRef, donorProofKey: identityKey,
        donorProofVersion: UBERWARM2_TRUSTED_RECEIVER_EVIDENCE_DONOR_VERSION
      });

      // Synchronous, content-bound verifier for compileUberWarm2ReceivedEvidence.
      // It validates the exact identity captured above, never a caller-made key.
      const verifyReceivingObservation = ({ observation: candidate, probe: p, receipt: r } = {}) => {
        if (!candidate || typeof candidate !== 'object') return false;
        if (str(candidate.donorProofKey, 200) !== identityKey) return false;
        if (str(candidate.probeId, 250) !== probeId) return false;
        if (lower(candidate.senderEmail) !== sender || lower(candidate.seedEmail) !== seed) return false;
        if (lower(candidate.seedProvider || providerFromEmail(candidate.seedEmail)) !== seedProvider) return false;
        if (str(candidate.messageId, 500) !== messageId) return false;
        if (str(candidate.receivingProviderEvidenceRef, 800) !== evidenceRef) return false;
        if (str(candidate.evidenceRef, 800) !== evidenceRef) return false;
        // A copied proof key must never let an adversary relabel SPAM as INBOX.
        if (str(candidate.folder, 40).toUpperCase() !== providerFolder) return false;
        if (str(candidate.donorProofVersion, 150) !== UBERWARM2_TRUSTED_RECEIVER_EVIDENCE_DONOR_VERSION) return false;
        if (candidate.observationSource !== 'RECIPIENT_PROVIDER') return false;
        if (canonicalUtcMs(candidate.observedAt) !== observedMs) return false;
        if (p && typeof p === 'object' && p.probeId !== undefined && str(p.probeId, 250) !== probeId) return false;
        if (r && typeof r === 'object' && r.providerMessageId !== undefined && str(r.providerMessageId, 500) !== messageId) return false;
        return true;
      };

      return Object.freeze({
        ok: true, status: 'UBERWARM2_RECEIVER_EVIDENCE_VERIFIED',
        version: UBERWARM2_TRUSTED_RECEIVER_EVIDENCE_DONOR_VERSION,
        observation, mappingKey: identityKey, verifyReceivingObservation,
        externalEffectAuthority: 'NONE', acceptedObservations: 1,
        truthBoundary: 'Authenticated read-only receipt evidence for these exact owner-controlled probe messages only. It never proves general inbox reputation, genuine engagement, cold-outreach consent, or that a provider folder label describes any other message.'
      });
    }
  });
}
