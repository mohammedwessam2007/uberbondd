/**
 * UberWarm² protected receiver-placement wiring donor (Lane B).
 *
 * Composes an externally trusted authenticated recipient connector and a
 * protected evidence-reference validator into the exact path
 * compileUberWarm2ReceivedEvidence consumes. Receipts are matched exactly to
 * the immutable batch and to current SMTP_ACCEPTED_PLACEMENT_UNKNOWN status;
 * each unique matched receipt is read asynchronously, one call at a time, and
 * only its immutable observation plus a synchronous content-bound verifier is
 * handed to the compiler. It never upgrades SMTP acceptance to an inbox
 * verdict, never invents a default folder, never turns the async read into an
 * async verify callback, and never sends email. Fixture-level composition only:
 * no network, provider, secret, database or side effect.
 */
import { createUberWarm2TrustedReceiverEvidenceDonor } from './uberwarm2-trusted-receiver-evidence-donor.mjs';
import { compileUberWarm2ReceivedEvidence } from './uberwarm2-seed-executor.mjs';

export const UBERWARM2_PROTECTED_RECEIVER_PLACEMENT_WIRING_VERSION =
  'uberbond.uberwarm2-protected-receiver-placement-wiring-donor.v1';

const RECEIPT_STATUS = 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN';
const isFn = value => typeof value === 'function';
const text = (value, limit = 500) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');
const lower = value => String(value ?? '').trim().toLowerCase();
const deny = reasonCodes => Object.freeze({
  ok: false, status: 'UBERWARM2_PROTECTED_PLACEMENT_REFUSED',
  reasonCodes: [...new Set(reasonCodes)], externalEffectAuthority: 'NONE',
  acceptedObservations: 0, verifiedPlacements: 0
});

export function createUberWarm2ProtectedReceiverPlacementWiring({
  readAuthenticatedReceivingEvidence, readVerifiedEvidenceReference,
  clock = () => Date.now(), maxAgeMs
} = {}) {
  const separable = isFn(readAuthenticatedReceivingEvidence) && isFn(readVerifiedEvidenceReference);
  const usable = separable && isFn(clock);
  let donor = null;
  if (usable) {
    try {
      donor = createUberWarm2TrustedReceiverEvidenceDonor({
        readAuthenticatedReceivingEvidence, readVerifiedEvidenceReference, clock,
        ...(maxAgeMs === undefined ? {} : { maxAgeMs })
      });
    } catch { donor = null; }
  }
  const configured = usable && !!donor && isFn(donor.inspect);

  async function compileProtectedReceivedEvidence({ batch = {}, receipts = [], at } = {}) {
    try {
      if (!configured) return deny(['protected-receiver-placement-wiring-not-configured']);
      // An explicitly invalid timestamp must never be replaced by a fresh clock.
      if (at !== undefined && (!Number.isSafeInteger(at) || at <= 0)) return deny(['invalid-clock']);
      // Snapshot untrusted inputs before the first await. Accessors, proxies,
      // functions and mutable caller-owned objects must not change attribution.
      ({ batch, receipts } = structuredClone({ batch, receipts }));
      if (!batch || batch.ok !== true || !Array.isArray(batch.probes)) return deny(['valid-seed-batch-required']);
      if (!Array.isArray(receipts)) return deny(['receipts-array-required']);
      const ids = batch.probes.map(probe => probe && typeof probe === 'object' ? probe.probeId : null);
      if (ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,250}$/.test(id)))
        return deny(['invalid-probe-id']);
      if (new Set(ids).size !== ids.length) return deny(['duplicate-probe-id']);
      const atMs = at === undefined ? Number(clock()) : at;
      if (!Number.isSafeInteger(atMs) || atMs <= 0) return deny(['invalid-clock']);
      const probes = new Map();
    for (const probe of batch.probes) {
      if (probe && typeof probe === 'object' && typeof probe.probeId === 'string' && !probes.has(probe.probeId))
        probes.set(probe.probeId, probe);
    }
    const reasons = [];
    const matched = [];
    const seen = new Set();
    for (const receipt of Array.isArray(receipts) ? receipts : []) {
      if (!receipt || typeof receipt !== 'object') { reasons.push('receipt-not-an-object'); continue; }
      const probeId = typeof receipt.probeId === 'string' ? receipt.probeId : '';
      const probe = probes.get(probeId);
      if (!probe || receipt.status !== RECEIPT_STATUS || receipt.batchDigest !== batch.batchDigest ||
          !text(receipt.providerMessageId) ||
          lower(receipt.senderEmail) !== lower(probe.senderEmail) ||
          lower(receipt.seedEmail) !== lower(probe.seedEmail)) continue;
      if (seen.has(probeId)) { reasons.push(`duplicate-accepted-receipt-for-probe:${probeId}`); continue; }
      seen.add(probeId);
      matched.push(Object.freeze({
        probeId, batchDigest: batch.batchDigest, status: RECEIPT_STATUS,
        senderEmail: lower(probe.senderEmail), seedEmail: lower(probe.seedEmail),
        providerMessageId: text(receipt.providerMessageId, 500),
        submittedAt: text(receipt.submittedAt, 40)
      }));
    }
    if (reasons.length) return deny(reasons);
    if (!matched.length) return deny(['no-exactly-matched-accepted-placement-receipt']);
    const observations = [];
    const verifiers = new Map();
    const inspectionExclusions = [];
    // One awaited read per unique matched receipt, strictly in sequence: the
    // compiler's verifier is synchronous and must never wrap this read.
    for (const receipt of matched) {
      let result = null;
      try { result = await donor.inspect({ probe: probes.get(receipt.probeId), receipt, at: atMs }); }
      catch { result = null; }
      if (!result || result.ok !== true || !result.observation || !isFn(result.verifyReceivingObservation)) {
        inspectionExclusions.push({
          probeId: receipt.probeId,
          reasonCodes: Array.isArray(result?.reasonCodes)
            ? [...result.reasonCodes] : ['authenticated-receiving-provider-verification-required']
        });
        continue;
      }
      verifiers.set(text(result.observation.donorProofKey, 200), result.verifyReceivingObservation);
      observations.push(result.observation);
    }
    if (!observations.length) return deny(inspectionExclusions.flatMap(x => x.reasonCodes));
    const verifyReceivingObservation = ({ observation, probe, receipt } = {}) => {
      if (!observation || typeof observation !== 'object') return false;
      const verifier = verifiers.get(text(observation.donorProofKey, 200));
      return isFn(verifier) && verifier({ observation, probe, receipt }) === true;
    };
    const compiled = compileUberWarm2ReceivedEvidence({
      batch, receipts: matched, receivingObservations: observations,
      verifyReceivingObservation, now: new Date(atMs)
    });
    return Object.freeze({
      ...compiled,
      wiringVersion: UBERWARM2_PROTECTED_RECEIVER_PLACEMENT_WIRING_VERSION,
      matchedAcceptedReceipts: matched.length,
      inspectedObservations: observations.length,
      inspectionExclusions,
      exclusions: [...inspectionExclusions, ...(Array.isArray(compiled.exclusions) ? compiled.exclusions : [])],
      truthBoundary: 'Placement evidence is accepted only from a separately authenticated read-only receiver connector for these exact owner-controlled probe messages; SMTP acceptance is never upgraded to an inbox verdict.'
      });
    } catch {
      // A hostile accessor or failed snapshot is a denial, not an exception
      // escaping into the protected orchestration loop.
      return deny(['protected-placement-input-unreadable']);
    }
  }

  return Object.freeze({
    version: UBERWARM2_PROTECTED_RECEIVER_PLACEMENT_WIRING_VERSION,
    ready: false, configured, liveAuthorized: false, externalEffectAuthority: 'NONE', compileProtectedReceivedEvidence
  });
}
