import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileFrontierCognitivePlan } from './frontier-cognitive-fabric.mjs';
import { validateFrontierCallabilityProbeReceipt } from './frontier-callability-provenance.mjs';

export const FRONTIER_COGNITIVE_ADMISSION_VERSION = 'uberbond.frontier-cognitive-admission-1.1.0';
export const FRONTIER_ADMISSION_SCHEMA = 'uberbond.frontier-admission-bundle.v1';

const BRAND = Symbol('uberbond.frontier-admission-bundle');
const MAX_PROFILES = 64;
const MAX_BENCHMARKS = 1000;
const MAX_CALLABILITY = 256;

function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function timestamp(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) {
  return { policyVersion: FRONTIER_COGNITIVE_ADMISSION_VERSION, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}
function failure(reasonCodes, status = 'FRONTIER_ADMISSION_BLOCKED', extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra });
}
function cognitiveKey(provider, model) { return `${provider}\u0000${model}`; }
function revisionKey(provider, model, revision) { return `${provider}\u0000${model}\u0000${revision}`; }

function profileIdentity(raw = {}, index = 0) {
  const provider = text(raw?.provider, 80)?.toLowerCase();
  const model = text(raw?.model, 120);
  const revision = text(raw?.revision, 240);
  const id = text(raw?.id, 120)?.toLowerCase();
  const reasons = [];
  if (!id) reasons.push(`profile-id-required:${index}`);
  if (!provider) reasons.push(`provider-required:${id ?? index}`);
  if (!model) reasons.push(`model-identity-exceeds-canonical-router-boundary-or-is-missing:${id ?? index}`);
  if (!revision) reasons.push(`revision-required:${id ?? index}`);
  return reasons.length ? { ok: false, reasonCodes: reasons } : { ok: true, id, provider, model, revision };
}

function benchmarkIdentity(raw = {}) {
  const provider = text(raw?.candidate?.provider ?? raw?.provider, 80)?.toLowerCase();
  const model = text(raw?.candidate?.model ?? raw?.model, 120);
  const revision = text(raw?.observedRevision ?? raw?.revision, 240);
  const observedAt = timestamp(raw?.observedAt);
  const evidenceRef = text(raw?.evidenceRef ?? raw?.sourceRef, 1000);
  if (!provider || !model || !revision || !observedAt || !evidenceRef) return null;
  return { provider, model, revision, observedAt, evidenceRef };
}

function callabilityIdentity(raw = {}) {
  const profileId = text(raw?.profileId, 120)?.toLowerCase();
  const provider = text(raw?.observedProvider, 80)?.toLowerCase();
  const model = text(raw?.observedModel, 120);
  const revision = text(raw?.observedRevision, 240);
  const observedAt = timestamp(raw?.observedAt);
  const sourceRef = text(raw?.sourceRef, 1000);
  const status = text(raw?.status, 80)?.toUpperCase();
  const evidenceClass = text(raw?.evidenceClass, 80)?.toUpperCase();
  const identityVerification = text(raw?.identityVerification, 80)?.toUpperCase();
  const transportProvider = text(raw?.observedTransportProvider, 80)?.toLowerCase();
  const transportModel = text(raw?.observedTransportModel, 160);
  if (!profileId || !provider || !model || !revision || !observedAt || !sourceRef || !transportProvider || !transportModel) return null;
  return { profileId, provider, model, revision, observedAt, sourceRef, status, evidenceClass, identityVerification, transportProvider, transportModel };
}

function sameProbeObservation(identity, probe) {
  if (!identity || !probe) return false;
  return identity.profileId === probe.profileId
    && identity.status === probe.status
    && identity.provider === probe.observedProvider
    && identity.model === probe.observedModel
    && identity.revision === probe.observedRevision
    && identity.transportProvider === probe.observedTransportProvider
    && identity.transportModel === probe.observedTransportModel
    && identity.observedAt === probe.observedAt
    && identity.sourceRef === probe.sourceRef
    && identity.evidenceClass === probe.evidenceClass
    && identity.identityVerification === probe.identityVerification;
}

export function buildFrontierAdmissionBundle({
  profiles = [],
  callability = [],
  benchmarks = [],
  contextArtifacts = [],
  source = {},
  callabilityProvenance = null
} = {}) {
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > MAX_PROFILES) return failure(['bounded-profile-list-required']);
  if (!Array.isArray(callability) || callability.length > MAX_CALLABILITY) return failure(['bounded-callability-list-required']);
  if (!Array.isArray(benchmarks) || benchmarks.length > MAX_BENCHMARKS) return failure(['bounded-benchmark-list-required']);
  if (!Array.isArray(contextArtifacts)) return failure(['context-artifacts-list-required']);

  const sourceKind = text(source?.kind, 120)?.toUpperCase();
  const sourceRef = text(source?.ref, 1000);
  const sourceObservedAt = timestamp(source?.observedAt);
  if (!sourceKind || !sourceRef || !sourceObservedAt) return failure(['admission-source-kind-ref-and-time-required']);

  const provenance = validateFrontierCallabilityProbeReceipt(callabilityProvenance ?? {});
  const trustedProbeByProfileId = provenance.ok ? provenance.observationByProfileId : new Map();

  const identities = [];
  const profileById = new Map();
  const profileByRevision = new Map();
  const cognitiveNames = new Map();
  const reasons = [];
  for (const [index, raw] of profiles.entries()) {
    const identity = profileIdentity(raw, index);
    if (!identity.ok) { reasons.push(...identity.reasonCodes); continue; }
    if (profileById.has(identity.id)) reasons.push(`duplicate-profile-id:${identity.id}`);
    const rKey = revisionKey(identity.provider, identity.model, identity.revision);
    if (profileByRevision.has(rKey)) reasons.push(`duplicate-cognitive-revision:${identity.provider}:${identity.model}:${identity.revision}`);
    const cKey = cognitiveKey(identity.provider, identity.model);
    const priorRevision = cognitiveNames.get(cKey);
    if (priorRevision && priorRevision !== identity.revision) reasons.push(`ambiguous-provider-model-multi-revision-profile-set:${identity.provider}:${identity.model}`);
    cognitiveNames.set(cKey, identity.revision);
    profileById.set(identity.id, identity);
    profileByRevision.set(rKey, identity);
    identities.push(identity);
  }
  if (reasons.length) return failure(reasons, 'FRONTIER_ADMISSION_PROFILE_INVALID');

  const admittedCallability = [];
  const rejectedCallability = [];
  for (const raw of callability) {
    const identity = callabilityIdentity(raw);
    const profile = identity ? profileById.get(identity.profileId) : null;
    const exact = Boolean(profile
      && profile.provider === identity.provider
      && profile.model === identity.model
      && profile.revision === identity.revision
      && identity.status === 'CALLABLE_NOW'
      && identity.evidenceClass === 'OBSERVED_RUNTIME'
      && identity.identityVerification === 'OBSERVED');
    if (!exact) {
      rejectedCallability.push({ profileId: identity?.profileId ?? null, reason: 'callability-not-exact-observed-runtime-profile-revision' });
      continue;
    }
    const trustedObservation = trustedProbeByProfileId.get(identity.profileId);
    if (!provenance.ok || !sameProbeObservation(identity, trustedObservation)) {
      rejectedCallability.push({ profileId: identity.profileId, reason: 'trusted-canonical-probe-receipt-required-for-callability' });
      continue;
    }
    admittedCallability.push(raw);
  }

  const admittedBenchmarks = [];
  const rejectedBenchmarks = [];
  for (const raw of benchmarks) {
    const identity = benchmarkIdentity(raw);
    const exactProfile = identity ? profileByRevision.get(revisionKey(identity.provider, identity.model, identity.revision)) : null;
    if (!identity || !exactProfile) {
      rejectedBenchmarks.push({
        provider: identity?.provider ?? null,
        model: identity?.model ?? null,
        observedRevision: identity?.revision ?? null,
        reason: identity ? 'benchmark-revision-not-present-in-admitted-profile-set' : 'benchmark-provider-model-revision-time-evidence-required'
      });
      continue;
    }
    admittedBenchmarks.push({ ...raw, observedRevision: identity.revision, evidenceRef: identity.evidenceRef });
  }

  const provenanceMetadata = provenance.ok
    ? { receiptDigest: provenance.receiptDigest, sourceRef: provenance.sourceRef, generatedAt: provenance.generatedAt }
    : { receiptDigest: null, sourceRef: null, generatedAt: null };
  const identityDigest = sha256({
    source: { kind: sourceKind, ref: sourceRef, observedAt: sourceObservedAt },
    callabilityProvenance: provenanceMetadata,
    profiles: identities,
    callability: admittedCallability.map(item => ({
      profileId: item.profileId,
      observedProvider: item.observedProvider,
      observedModel: item.observedModel,
      observedRevision: item.observedRevision,
      observedTransportProvider: item.observedTransportProvider,
      observedTransportModel: item.observedTransportModel,
      observedAt: item.observedAt,
      sourceRef: item.sourceRef
    })),
    benchmarks: admittedBenchmarks.map(item => ({
      provider: item?.candidate?.provider ?? item?.provider,
      model: item?.candidate?.model ?? item?.model,
      observedRevision: item.observedRevision,
      observedAt: item.observedAt,
      evidenceRef: item.evidenceRef,
      benchmarkId: item.benchmarkId ?? null
    }))
  });

  const bundle = {
    schemaVersion: FRONTIER_ADMISSION_SCHEMA,
    source: { kind: sourceKind, ref: sourceRef, observedAt: sourceObservedAt },
    callabilityProvenance: provenanceMetadata,
    profiles: structuredClone(profiles),
    callability: structuredClone(admittedCallability),
    benchmarks: structuredClone(admittedBenchmarks),
    contextArtifacts: structuredClone(contextArtifacts),
    rejectedCallability,
    rejectedBenchmarks,
    identityDigest,
    truthBoundary: 'CALLER_LABELS_ARE_NOT_PROVENANCE; CALLABLE_NOW_ENTERS_ONLY_WHEN_BOUND_TO_A_VALID_CANONICAL_RUNTIME_PROBE_RECEIPT; BENCHMARKS_BIND_EXACT_PROVIDER_MODEL_REVISION'
  };
  Object.defineProperty(bundle, BRAND, { value: true, enumerable: false, configurable: false, writable: false });
  return envelope({ ok: true, status: 'FRONTIER_ADMISSION_READY', bundle });
}

export function compileAdmittedFrontierPlan({ task, admissionBundle, ...policy } = {}) {
  if (!admissionBundle || admissionBundle[BRAND] !== true || admissionBundle.schemaVersion !== FRONTIER_ADMISSION_SCHEMA) {
    return failure(['process-validated-frontier-admission-bundle-required'], 'FRONTIER_PLAN_ADMISSION_BLOCKED');
  }
  const result = compileFrontierCognitivePlan({
    task,
    profiles: admissionBundle.profiles,
    callability: admissionBundle.callability,
    benchmarks: admissionBundle.benchmarks,
    contextArtifacts: admissionBundle.contextArtifacts,
    ...policy
  });
  if (!result.ok) return envelope({ ...result, admissionDigest: admissionBundle.identityDigest, admissionRejectedEvidence: { callability: admissionBundle.rejectedCallability, benchmarks: admissionBundle.rejectedBenchmarks } });
  return envelope({
    ...result,
    admissionDigest: admissionBundle.identityDigest,
    admissionSource: admissionBundle.source,
    callabilityProvenance: admissionBundle.callabilityProvenance,
    admissionRejectedEvidence: { callability: admissionBundle.rejectedCallability, benchmarks: admissionBundle.rejectedBenchmarks },
    truthBoundary: `${result.plan?.truthBoundary ? `${result.plan.truthBoundary}; ` : ''}PLAN_WAS_COMPILED_ONLY_FROM_PROCESS_VALIDATED_EXACT_REVISION_ADMISSION_EVIDENCE_WITH_CANONICAL_CALLABILITY_PROVENANCE`
  });
}
