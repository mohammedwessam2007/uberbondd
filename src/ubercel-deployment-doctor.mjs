// Ubercel deployment state, read through UberBond rather than off a vendor.
//
// The control plane beside this one already carries the law:
// NO_PROVIDER_IS_THE_CONTROL_PLANE. It is enforced at plan time -- an adapter
// declaring deploymentAuthority is refused -- and it was enforced nowhere at
// read time, because nothing answered "what is our deployment state?" at all.
// So the only thing available to answer it was a provider's own badge, and a
// session reading that badge reported a vendor's red build as UberBond's
// deployment truth. Ubercel treats VERCEL as one of five replaceable adapter
// types holding no authority; the report treated it as the answer.
//
// The distinction this module exists to hold: a provider badge describes the
// provider. Only an authenticated probe of the health contract UberBond
// declared, or liveness from a runtime UberBond owns, describes UberBond.
//
// It reports. It does not deploy, probe, or call anything.
import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { UBERCEL_ADAPTER_TYPES } from './ubercel-deployment-control-plane.mjs';

export const UBERCEL_DEPLOYMENT_DOCTOR_VERSION = 'uberbond.ubercel-deployment-doctor.v1';

const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (v, m = 1000) => { const s = String(v ?? '').trim(); return s && s.length <= m ? s : null; };
const digest = v => `sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

/**
 * What a signal is allowed to establish.
 *
 * PROVIDER_BADGE is the whole point of the separation. A vendor's build status
 * is a fact about that vendor's build, and it is evidence about UberBond's
 * service only if UberBond serves from it, which is a question the badge cannot
 * answer about itself.
 */
export const EVIDENCE_CLASSES = Object.freeze({
  PROVIDER_BADGE: { establishesServing: false, establishesNotServing: false },
  AUTHENTICATED_HEALTH: { establishesServing: true, establishesNotServing: true },
  OWNED_RUNTIME_LIVENESS: { establishesServing: true, establishesNotServing: true }
});

export const UBERCEL_DEPLOYMENT_STATES = Object.freeze([
  'SERVING__AUTHENTICATED',
  'NOT_SERVING__AUTHENTICATED',
  'UNKNOWN__ONLY_PROVIDER_BADGES',
  'UNKNOWN__NO_EVIDENCE',
  'UNKNOWN__EVIDENCE_STALE'
]);

function normalizeSignal(raw = {}, { healthContract, now, maxAgeMs }) {
  const evidenceClass = text(raw.evidenceClass, 60)?.toUpperCase();
  const adapterType = text(raw.adapterType, 80)?.toUpperCase();
  const provider = text(raw.provider, 120)?.toLowerCase();
  const observedAt = text(raw.observedAt, 100);
  const sourceRef = text(raw.sourceRef, 1000);
  const reasons = [];

  if (!evidenceClass || !(evidenceClass in EVIDENCE_CLASSES)) reasons.push('known-evidence-class-required');
  if (!adapterType || !UBERCEL_ADAPTER_TYPES.includes(adapterType)) reasons.push('declared-adapter-type-required');
  if (!provider) reasons.push('provider-identity-required');
  if (!sourceRef) reasons.push('signal-provenance-required');
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) reasons.push('signal-observation-time-required');
  // An adapter cannot promote its own evidence. This is the plan-time law
  // (adapter-must-not-own-deployment-authority) applied to the read path, where
  // it would otherwise be a comment.
  if (raw.deploymentAuthority === true || raw.authoritative === true) reasons.push('adapter-must-not-claim-deployment-authority');
  if (reasons.length) return { ok: false, reasonCodes: reasons, sourceRef, provider };

  const observed = Date.parse(observedAt);
  const ageMs = now - observed;
  // Future-dated evidence is not fresh evidence; it is a clock problem or a
  // fabricated one, and neither should read as current.
  const stale = ageMs > maxAgeMs || ageMs < 0;

  // An authenticated probe counts only against the health contract UberBond
  // declared. A 200 from some other URL is a 200 from some other URL.
  let contractBound = true;
  if (evidenceClass === 'AUTHENTICATED_HEALTH') {
    const ref = text(raw.healthRef, 1000);
    const status = Number(raw.status);
    contractBound = Boolean(healthContract)
      && ref === text(healthContract.authenticatedHealthRef, 1000)
      && Number.isInteger(status)
      && status === Number(healthContract.expectedStatus);
  }

  return {
    ok: true,
    signal: {
      evidenceClass,
      adapterType,
      provider,
      sourceRef,
      observedAt: new Date(observed).toISOString(),
      ageMs,
      stale,
      contractBound,
      serving: raw.serving === true,
      deploymentAuthority: 'NONE'
    }
  };
}

/**
 * Reports deployment state from the evidence supplied. Never probes anything.
 *
 * The verdict is deliberately UNKNOWN rather than NOT_SERVING when the only
 * thing available is a red provider badge. A vendor build failing does not show
 * that UberBond is down -- it may be building a surface UberBond does not serve
 * from -- and reporting it as down would be the same error in the other
 * direction.
 */
export function diagnoseUbercelDeployment({
  serviceId,
  healthContract = null,
  signals = [],
  maxEvidenceAgeMs = 15 * 60 * 1000,
  date = new Date()
} = {}) {
  const id = text(serviceId, 160);
  if (!id) {
    return {
      ok: false,
      status: 'UBERCEL_DEPLOYMENT_DOCTOR_BLOCKED',
      reasonCodes: ['service-identity-required'],
      businessEffectAuthority: 'NONE',
      deploymentAuthority: 'NONE',
      externalEffectLedger: zero()
    };
  }

  const now = date.getTime();
  const normalized = (Array.isArray(signals) ? signals : [])
    .map(raw => normalizeSignal(raw, { healthContract, now, maxAgeMs: maxEvidenceAgeMs }));
  const rejected = normalized.filter(row => !row.ok)
    .map(row => ({ sourceRef: row.sourceRef ?? null, provider: row.provider ?? null, reasonCodes: row.reasonCodes }));
  const admitted = normalized.filter(row => row.ok).map(row => row.signal);

  const authoritative = admitted.filter(row =>
    EVIDENCE_CLASSES[row.evidenceClass].establishesServing && !row.stale && row.contractBound);
  const badges = admitted.filter(row => row.evidenceClass === 'PROVIDER_BADGE');

  let state;
  if (authoritative.length) {
    // One authenticated observation of not-serving outranks any number of
    // healthy ones: something is failing to serve and the others did not see it.
    state = authoritative.every(row => row.serving) ? 'SERVING__AUTHENTICATED' : 'NOT_SERVING__AUTHENTICATED';
  } else if (admitted.some(row => EVIDENCE_CLASSES[row.evidenceClass].establishesServing)) {
    // Authoritative evidence existed but was stale or unbound from the contract.
    state = 'UNKNOWN__EVIDENCE_STALE';
  } else if (badges.length) {
    state = 'UNKNOWN__ONLY_PROVIDER_BADGES';
  } else {
    state = 'UNKNOWN__NO_EVIDENCE';
  }

  const report = {
    schemaVersion: 'uberbond.ubercel-deployment-report.v1',
    version: UBERCEL_DEPLOYMENT_DOCTOR_VERSION,
    serviceId: id,
    state,
    observedAt: new Date(now).toISOString(),
    authoritativeSignals: authoritative.length,
    providerBadges: badges.map(row => ({
      provider: row.provider,
      adapterType: row.adapterType,
      serving: row.serving,
      sourceRef: row.sourceRef,
      establishes: 'NOTHING_ABOUT_UBERBOND_DEPLOYMENT_STATE'
    })),
    admittedSignals: admitted,
    rejectedSignals: rejected,
    laws: [
      'NO_PROVIDER_IS_THE_CONTROL_PLANE',
      'A_PROVIDER_BADGE_DESCRIBES_THE_PROVIDER',
      'ONLY_A_CONTRACT_BOUND_AUTHENTICATED_PROBE_OR_OWNED_RUNTIME_LIVENESS_DESCRIBES_UBERBOND',
      'UNKNOWN_IS_REPORTED_RATHER_THAN_INFERRED_FROM_A_VENDOR'
    ],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    deploymentAuthority: 'NONE'
  };

  return { ok: true, status: 'UBERCEL_DEPLOYMENT_REPORT_READY', report, reportDigest: digest(report), externalEffectLedger: zero() };
}
