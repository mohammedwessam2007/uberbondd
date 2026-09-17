// Turns a health probe into evidence Ubercel can read, or explains why it cannot.
//
// The pieces existed at both ends and nothing joined them. waitForUberLitHealth
// probes a running service and returns a status and a body digest; the Ubercel
// doctor reads contract-bound AUTHENTICATED_HEALTH signals and reports SERVING
// or NOT_SERVING from them. Between the two there was nothing, so a real probe
// -- /api/health returning 200 against the live Render deployment -- was written
// into a handoff document as a sentence and the doctor went on reporting
// UNKNOWN__ONLY_PROVIDER_BADGES, because prose is not a signal.
//
// What this refuses to do is as important as what it does. It never invents a
// probe. It converts one, and when the probe does not match the declared health
// contract it records that fact rather than quietly upgrading it: a 200 from a
// URL nobody declared is a 200 from somewhere else, and a probe with no
// observation time cannot be aged, so it can never be known to be current.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { UBERCEL_ADAPTER_TYPES } from './ubercel-deployment-control-plane.mjs';

export const UBERCEL_HEALTH_EVIDENCE_VERSION = 'uberbond.ubercel-health-evidence.v1';

const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (v, m = 1000) => { const s = String(v ?? '').trim(); return s && s.length <= m ? s : null; };
const digest = v => `sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

/**
 * A health contract is only a contract if it says what to call and what counts.
 * A half-declared one would let any probe bind to it.
 */
export function normalizeHealthContract(raw = {}) {
  const ref = text(raw.authenticatedHealthRef, 1000);
  const status = Number(raw.expectedStatus);
  const reasons = [];
  if (!ref) reasons.push('authenticated-health-ref-required');
  if (!Number.isInteger(status) || status < 100 || status > 599) reasons.push('expected-status-required');
  if (reasons.length) return { ok: false, reasonCodes: reasons };
  return { ok: true, contract: { authenticatedHealthRef: ref, expectedStatus: status } };
}

/**
 * Converts one observed probe into a signal.
 *
 * Returns a signal in every admissible case, including the ones that establish
 * nothing -- an unbound probe is still an observation somebody made, and
 * discarding it would lose the record of having looked.
 */
export function recordHealthObservation({
  healthContract = null,
  probe = {},
  observedAt = null,
  sourceRef = null,
  observedBy = null,
  adapterType = 'OWNED_LINUX',
  provider = null
} = {}) {
  const reasons = [];
  const normalizedContract = normalizeHealthContract(healthContract || {});
  const ref = text(probe.url ?? probe.healthRef, 1000);
  const status = Number(probe.status);
  const when = text(observedAt, 100);
  const source = text(sourceRef, 1000);
  const by = text(observedBy, 240);
  const type = text(adapterType, 80)?.toUpperCase();
  const providerId = text(provider, 120)?.toLowerCase();

  if (!type || !UBERCEL_ADAPTER_TYPES.includes(type)) reasons.push('declared-adapter-type-required');
  if (!providerId) reasons.push('provider-identity-required');
  if (!source) reasons.push('signal-provenance-required');
  // Who observed it is part of the provenance. A probe with no observer cannot
  // be distinguished later from one this repository invented.
  if (!by) reasons.push('observer-identity-required');
  if (!when || !Number.isFinite(Date.parse(when))) reasons.push('observation-time-required');
  if (!Number.isInteger(status)) reasons.push('probe-status-required');
  if (!ref) reasons.push('probe-url-required');
  if (reasons.length) return { ok: false, status: 'HEALTH_OBSERVATION_REFUSED', reasonCodes: reasons, externalEffectLedger: zero() };

  const contract = normalizedContract.ok ? normalizedContract.contract : null;
  const contractBound = Boolean(contract)
    && ref === contract.authenticatedHealthRef
    && status === contract.expectedStatus;

  const unboundReason = contractBound ? null
    : !contract ? 'no-health-contract-declared'
      : ref !== contract.authenticatedHealthRef ? 'probe-url-is-not-the-declared-health-ref'
        : 'probe-status-is-not-the-declared-expected-status';

  const signal = {
    evidenceClass: 'AUTHENTICATED_HEALTH',
    adapterType: type,
    provider: providerId,
    // `serving` is the probe's own answer. Whether it counts is decided by
    // contractBound, not by this field, so an unbound success cannot smuggle a
    // SERVING verdict into the doctor.
    serving: contractBound && status === contract.expectedStatus,
    observedAt: new Date(Date.parse(when)).toISOString(),
    sourceRef: source,
    observedBy: by,
    healthRef: ref,
    status,
    bodyDigest: text(probe.bodyDigest, 200) ?? null,
    contractBound,
    unboundReason,
    deploymentAuthority: 'NONE'
  };

  return {
    ok: true,
    status: contractBound ? 'CONTRACT_BOUND_HEALTH_SIGNAL' : 'OBSERVATION_RECORDED_NOT_CONTRACT_BOUND',
    signal,
    signalDigest: digest(signal),
    boundary: 'This converts an observation somebody made. It never probes, and it never invents a probe.',
    externalEffectLedger: zero()
  };
}

/**
 * How old an observation may be before it stops describing the present.
 *
 * Separated from the doctor's own window so a caller can record a probe it knows
 * is old without the recorder pretending otherwise: a stale observation is still
 * a true record of a past moment, and the doctor is what decides it no longer
 * counts as current.
 */
export function observationAge(signal, now = new Date()) {
  const observed = Date.parse(signal?.observedAt ?? '');
  if (!Number.isFinite(observed)) return { known: false, ageMs: null };
  return { known: true, ageMs: now.getTime() - observed };
}
