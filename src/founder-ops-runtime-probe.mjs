import crypto from 'node:crypto';

export const FOUNDER_OPS_RUNTIME_PROBE_VERSION = 'uberbond.founder-ops-runtime-probe.v1';
const SHA40 = /^[0-9a-f]{40}$/;
const ZERO = Object.freeze({ customerMessages: 0, providerCalls: 0, spendCents: 0, deployments: 0, dnsChanges: 0, credentialChanges: 0, paymentMutations: 0, productionMutations: 0 });
const text = (value, max = 500) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function fail(reasonCodes, extra = {}) {
  return { ok: false, schemaVersion: FOUNDER_OPS_RUNTIME_PROBE_VERSION, status: 'FOUNDER_OPS_RUNTIME_PROBE_REFUSED', reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO }, ...extra };
}

export function founderOpsRuntimeIdentity(runtime = {}) {
  const sourceCommit = text(runtime.sourceCommit, 40)?.toLowerCase() || null;
  if (!sourceCommit || !SHA40.test(sourceCommit)) return null;
  const platform = text(runtime.platform, 80);
  const environment = text(runtime.environment, 120);
  const region = text(runtime.region, 120) || 'unknown-region';
  if (!platform || !environment) return null;
  return `runtime:${digest({ platform, environment, region, sourceCommit }).slice('sha256:'.length, 'sha256:'.length + 40)}`;
}

/** Convert one independently observed authenticated GET into the C17 receipt shape. */
export function compileFounderOpsRuntimeProbeReceipt({
  expectedSourceCommit,
  httpStatus,
  view,
  verifierRef,
  evidenceRef,
  observedAt = new Date()
} = {}) {
  const reasons = [];
  const expected = text(expectedSourceCommit, 40)?.toLowerCase() || null;
  const verifier = text(verifierRef);
  const evidence = text(evidenceRef);
  if (!expected || !SHA40.test(expected)) reasons.push('exact-expected-source-commit-required');
  if (httpStatus !== 200) reasons.push('authenticated-founder-ops-http-200-required');
  if (view?.ok !== true || view?.status !== 'FOUNDER_OPS_READ_ONLY') reasons.push('founder-ops-read-only-view-required');
  if (view?.businessEffectAuthority !== 'NONE') reasons.push('control-plane-business-authority-must-be-none');
  const actual = text(view?.runtime?.sourceCommit, 40)?.toLowerCase() || null;
  if (!actual || !SHA40.test(actual)) reasons.push('runtime-source-commit-required');
  if (expected && actual && expected !== actual) reasons.push('control-plane-source-commit-mismatch');
  if (view?.privacy?.rawPersonalCivilizationReachable !== false) reasons.push('raw-personal-civilization-must-be-unreachable');
  if (view?.privacy?.privateVaultDataIncluded !== false) reasons.push('private-vault-data-must-not-be-included');
  if (view?.privacy?.networkLifeStateAccessAuthorized !== false) reasons.push('network-life-state-access-must-not-be-authorized');
  if (!verifier) reasons.push('independent-verifier-reference-required');
  if (!evidence) reasons.push('evidence-reference-required');
  const runtimeIdentity = founderOpsRuntimeIdentity(view?.runtime);
  if (!runtimeIdentity) reasons.push('canonical-runtime-identity-required');
  if (verifier && runtimeIdentity && verifier === runtimeIdentity) reasons.push('runtime-cannot-self-verify-control-plane');
  const at = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(at.getTime())) reasons.push('valid-observed-at-required');
  if (reasons.length) return fail(reasons, { sourceCommit: expected || actual });

  const core = {
    evidenceClass: 'OBSERVED_RUNTIME',
    receiptClass: 'FOUNDER_CONTROL_PLANE',
    sourceCommit: actual,
    runtimeIdentity,
    authenticatedReadSucceeded: true,
    privateLifeStateExposed: false,
    writeAuthorityGranted: false,
    evidenceRef: evidence,
    independentVerifierRef: verifier,
    observedAt: at.toISOString()
  };
  return {
    ok: true,
    schemaVersion: FOUNDER_OPS_RUNTIME_PROBE_VERSION,
    status: 'FOUNDER_OPS_RUNTIME_READ_INDEPENDENTLY_OBSERVED',
    ...core,
    receiptDigest: digest(core),
    truthBoundary: 'This receipt proves only one authenticated read-only founder-ops observation for the exact reported source/runtime. It does not prove private-life access, deployment authority, provider independence, elapsed autonomy, customer outcomes or ASI.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO }
  };
}
