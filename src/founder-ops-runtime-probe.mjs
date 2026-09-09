import crypto from 'node:crypto';
import { runtimeTransitionIdentityEquivalent } from './runtime-transition-receipts.mjs';

export const FOUNDER_OPS_RUNTIME_PROBE_VERSION = 'uberbond.founder-ops-runtime-probe.v1.2';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ZERO = Object.freeze({ customerMessages: 0, providerCalls: 0, spendCents: 0, deployments: 0, dnsChanges: 0, credentialChanges: 0, paymentMutations: 0, productionMutations: 0 });
const text = (value, max = 500) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const ledger = providerCallObserved => ({ ...ZERO, providerCalls: providerCallObserved === true ? 1 : 0 });

function fail(reasonCodes, { providerCallObserved = false, ...extra } = {}) {
  return { ok: false, schemaVersion: FOUNDER_OPS_RUNTIME_PROBE_VERSION, status: 'FOUNDER_OPS_RUNTIME_PROBE_REFUSED', reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: ledger(providerCallObserved), ...extra };
}

function canonicalTarget(targetUrl) {
  let url;
  try { url = new URL(String(targetUrl ?? '')); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  const pathname = url.pathname || '/';
  return `${url.origin}${pathname}`;
}

function safeObservedView(view = {}) {
  return {
    ok: view?.ok === true,
    status: text(view?.status, 120),
    businessEffectAuthority: text(view?.businessEffectAuthority, 80),
    runtime: {
      platform: text(view?.runtime?.platform, 80),
      environment: text(view?.runtime?.environment, 120),
      sourceCommit: text(view?.runtime?.sourceCommit, 40)?.toLowerCase() || null,
      region: text(view?.runtime?.region, 120) || 'unknown-region'
    },
    privacy: {
      rawPersonalCivilizationReachable: view?.privacy?.rawPersonalCivilizationReachable,
      privateVaultDataIncluded: view?.privacy?.privateVaultDataIncluded,
      networkLifeStateAccessAuthorized: view?.privacy?.networkLifeStateAccessAuthorized
    }
  };
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

export function founderOpsTargetIdentity(targetUrl) {
  const target = canonicalTarget(targetUrl);
  return target ? `target:${digest(target).slice('sha256:'.length, 'sha256:'.length + 40)}` : null;
}

export function founderOpsRuntimeProbeReceiptPreimage(receipt = {}) {
  return {
    evidenceClass: receipt.evidenceClass,
    receiptClass: receipt.receiptClass,
    sourceCommit: receipt.sourceCommit,
    targetUrl: receipt.targetUrl,
    targetIdentity: receipt.targetIdentity,
    runtimeIdentity: receipt.runtimeIdentity,
    observedViewDigest: receipt.observedViewDigest,
    authenticatedReadSucceeded: receipt.authenticatedReadSucceeded,
    privateLifeStateExposed: receipt.privateLifeStateExposed,
    writeAuthorityGranted: receipt.writeAuthorityGranted,
    evidenceRef: receipt.evidenceRef,
    independentVerifierRef: receipt.independentVerifierRef,
    observedAt: receipt.observedAt
  };
}

export function verifyFounderOpsRuntimeProbeReceiptIntegrity(receipt = {}) {
  if (receipt?.ok !== true) return false;
  if (receipt?.schemaVersion !== FOUNDER_OPS_RUNTIME_PROBE_VERSION) return false;
  if (receipt?.status !== 'FOUNDER_OPS_RUNTIME_READ_INDEPENDENTLY_OBSERVED') return false;
  if (receipt?.evidenceClass !== 'OBSERVED_RUNTIME' || receipt?.receiptClass !== 'FOUNDER_CONTROL_PLANE') return false;
  if (!SHA40.test(String(receipt?.sourceCommit || '').toLowerCase())) return false;
  const target = canonicalTarget(receipt?.targetUrl);
  if (!target || target !== receipt.targetUrl || founderOpsTargetIdentity(target) !== receipt.targetIdentity) return false;
  if (!/^runtime:[0-9a-f]{40}$/.test(String(receipt?.runtimeIdentity || ''))) return false;
  if (!SHA256.test(String(receipt?.observedViewDigest || ''))) return false;
  if (receipt?.authenticatedReadSucceeded !== true || receipt?.privateLifeStateExposed !== false || receipt?.writeAuthorityGranted !== false) return false;
  if (!text(receipt?.evidenceRef) || !text(receipt?.independentVerifierRef)) return false;
  if (runtimeTransitionIdentityEquivalent(receipt.independentVerifierRef, receipt.runtimeIdentity)) return false;
  if (runtimeTransitionIdentityEquivalent(receipt.independentVerifierRef, receipt.targetIdentity)) return false;
  const at = new Date(receipt?.observedAt);
  if (Number.isNaN(at.getTime())) return false;
  const expectedDigest = digest(founderOpsRuntimeProbeReceiptPreimage(receipt));
  return receipt?.receiptDigest === expectedDigest;
}

/** Convert one independently observed authenticated GET into the C17 receipt shape. */
export function compileFounderOpsRuntimeProbeReceipt({
  expectedSourceCommit,
  targetUrl,
  httpStatus,
  view,
  verifierRef,
  evidenceRef,
  providerCallObserved = false,
  observedAt = new Date(),
  now = new Date()
} = {}) {
  const reasons = [];
  const expected = text(expectedSourceCommit, 40)?.toLowerCase() || null;
  const verifier = text(verifierRef);
  const evidence = text(evidenceRef);
  const target = canonicalTarget(targetUrl);
  const targetIdentity = founderOpsTargetIdentity(targetUrl);
  if (!expected || !SHA40.test(expected)) reasons.push('exact-expected-source-commit-required');
  if (!target || !targetIdentity) reasons.push('canonical-https-target-required');
  if (httpStatus !== 200) reasons.push('authenticated-founder-ops-http-200-required');
  if (httpStatus === 200 && providerCallObserved !== true) reasons.push('provider-call-observation-required');
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
  if (verifier && runtimeIdentity && runtimeTransitionIdentityEquivalent(verifier, runtimeIdentity)) reasons.push('runtime-cannot-self-verify-control-plane');
  if (verifier && targetIdentity && runtimeTransitionIdentityEquivalent(verifier, targetIdentity)) reasons.push('target-cannot-self-verify-control-plane');
  const at = observedAt instanceof Date ? observedAt : new Date(observedAt);
  const clock = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(at.getTime())) reasons.push('valid-observed-at-required');
  if (Number.isNaN(clock.getTime())) reasons.push('valid-probe-clock-required');
  if (!Number.isNaN(at.getTime()) && !Number.isNaN(clock.getTime()) && at.getTime() > clock.getTime()) reasons.push('runtime-observation-must-not-be-future-dated');
  if (reasons.length) return fail(reasons, { providerCallObserved, sourceCommit: expected || actual, targetIdentity });

  const observedViewDigest = digest(safeObservedView(view));
  const core = {
    evidenceClass: 'OBSERVED_RUNTIME',
    receiptClass: 'FOUNDER_CONTROL_PLANE',
    sourceCommit: actual,
    targetUrl: target,
    targetIdentity,
    runtimeIdentity,
    observedViewDigest,
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
    truthBoundary: 'This receipt proves only one authenticated read-only founder-ops observation for the exact target, reported source/runtime, and safe observed view. It does not prove private-life access, deployment authority, provider independence, elapsed autonomy, customer outcomes or ASI.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: ledger(true)
  };
}
