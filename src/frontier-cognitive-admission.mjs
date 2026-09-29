import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileFrontierCognitivePlan } from './frontier-cognitive-fabric.mjs';
import { validateFrontierCallabilityProbeReceipt } from './frontier-callability-provenance.mjs';
import { validateCompiledSealedArchitectureTrial } from './apex-sealed-tournament.mjs';
import { validateCanonicalZeroLossCertificate } from './canonical-zero-loss-certificate.mjs';
import { validateCanonicalFrontierCrownCertificate } from './frontier-crown-certificate.mjs';

export const FRONTIER_COGNITIVE_ADMISSION_VERSION = 'uberbond.frontier-cognitive-admission-1.2.1';
export const FRONTIER_ADMISSION_SCHEMA = 'uberbond.frontier-admission-bundle.v1';

const admittedBundles = new WeakMap();
const canonicalLiveBenchmarks = new WeakMap();
const admittedPlans = new WeakMap();
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



export function buildLiveFrontierBenchmarkFromSealedTrial({
  sealedTrial,
  profile,
  taskClasses = ['general'],
  now = new Date()
} = {}) {
  const provenance = validateCompiledSealedArchitectureTrial(sealedTrial);
  if (!provenance.ok) return failure(provenance.reasonCodes, 'FRONTIER_LIVE_BENCHMARK_REFUSED');

  const subject = sealedTrial?.architectureIdentity?.benchmarkSubject;
  const profileId = text(profile?.id, 120)?.toLowerCase();
  const provider = text(profile?.provider, 80)?.toLowerCase();
  const model = text(profile?.model, 120);
  const revision = text(profile?.revision, 240);
  const reasons = [];
  if (!profileId || !provider || !model || !revision) reasons.push('complete-frontier-profile-identity-required');
  if (!subject || subject.exclusiveCognitiveSubject !== true) reasons.push('exclusive-sealed-benchmark-subject-required');
  if (subject && (
    subject.profileId !== profileId ||
    subject.provider !== provider ||
    subject.model !== model ||
    subject.revision !== revision
  )) reasons.push('sealed-benchmark-subject-profile-mismatch');
  if (!Array.isArray(taskClasses) || !taskClasses.length || taskClasses.some(item => !text(item, 160))) reasons.push('benchmark-task-classes-required');
  const observedAt = timestamp(now);
  if (!observedAt) reasons.push('benchmark-observation-time-required');
  if (reasons.length) return failure(reasons, 'FRONTIER_LIVE_BENCHMARK_REFUSED');

  const quality = Number(sealedTrial?.statistics?.verifiedSuccessRate);
  const falsePositiveRate = Number(sealedTrial?.statistics?.falsePositiveRate);
  const meanLatencyMs = Number(sealedTrial?.economics?.meanLatencyMs);
  const meanCostUsd = Number(sealedTrial?.economics?.meanCostUsd);
  const processScore = Number(sealedTrial?.arenaTrial?.processScore);
  if (![quality, falsePositiveRate, meanLatencyMs, meanCostUsd, processScore].every(Number.isFinite)) {
    return failure(['complete-sealed-benchmark-metrics-required'], 'FRONTIER_LIVE_BENCHMARK_REFUSED');
  }

  const benchmark = {
    ok: true,
    benchmarkId: `sealed:${sealedTrial.receiptDigest}`,
    candidate: {
      provider,
      model,
      taskClasses: [...new Set(taskClasses.map(item => String(item).trim().toLowerCase()).filter(Boolean))]
    },
    taskClass: sealedTrial.taskClass,
    quality,
    reliability: Math.max(0, Math.min(1, 1 - falsePositiveRate)),
    latencyScore: 1 / (1 + Math.max(0, meanLatencyMs) / 1000),
    economicImpact: processScore,
    evidenceConfidence: 1,
    costEfficiency: 1 / (1 + Math.max(0, meanCostUsd)),
    observedAt,
    observedRevision: revision,
    evidenceRef: `apex-sealed-benchmark://${sealedTrial.receiptDigest}`,
    sealedTrialReceiptDigest: sealedTrial.receiptDigest,
    sealedTrialTaskOutcomeDigest: sealedTrial.taskOutcomeDigest,
    sealedSuiteVersion: sealedTrial.suiteVersion,
    sealedCorpusDigest: sealedTrial.corpusDigest,
    sealedManifestDigest: sealedTrial.manifestDigest,
    benchmarkSubject: structuredClone(subject),
    frontierCandidateArchitectureId: sealedTrial.architectureId,
    pairedZeroLossCertified: false,
    pairedZeroLossCertificationDigest: null,
    frontierBaselineArchitectureId: null,
    baselineSealedTrialReceiptDigest: null,
    liveRoutingAuthority: 'CANONICAL_SEALED_SINGLE_PROFILE_BENCHMARK'
  };
  canonicalLiveBenchmarks.set(benchmark, sha256(benchmark));
  return envelope({
    ok: true,
    status: 'FRONTIER_LIVE_BENCHMARK_READY',
    benchmark,
    benchmarkDigest: sha256(benchmark),
    promotionAuthority: 'NONE',
    truthBoundary: 'LIVE ROUTING BENCHMARK AUTHORITY EXISTS ONLY FOR AN UNMODIFIED BENCHMARK DERIVED IN PROCESS FROM A CANONICAL UNTAMPERED SEALED TRIAL WHOSE EXCLUSIVE MODEL SUBJECT WAS FROZEN BEFORE EVALUATION.'
  });
}



export function buildCrownedFrontierBenchmark({
  sealedTrial,
  crownCertificate,
  profile,
  taskClasses = ['general'],
  now = new Date()
} = {}) {
  const subject = sealedTrial?.architectureIdentity?.benchmarkSubject;
  const profileId = text(profile?.id, 120)?.toLowerCase();
  const crown = validateCanonicalFrontierCrownCertificate(crownCertificate, {
    expectedCrownTrialReceiptDigest: sealedTrial?.receiptDigest ?? null,
    expectedCrownProfileId: profileId
  });
  if (!crown.ok) return failure(crown.reasonCodes, 'FRONTIER_CROWN_BENCHMARK_REFUSED');
  if (crownCertificate.crownArchitectureId !== sealedTrial?.architectureId) {
    return failure(['frontier-crown-architecture-mismatch'], 'FRONTIER_CROWN_BENCHMARK_REFUSED');
  }
  if (!subject || subject.profileId !== profileId) {
    return failure(['frontier-crown-subject-profile-mismatch'], 'FRONTIER_CROWN_BENCHMARK_REFUSED');
  }

  const base = buildLiveFrontierBenchmarkFromSealedTrial({ sealedTrial, profile, taskClasses, now });
  if (!base.ok) return base;
  const benchmark = {
    ...base.benchmark,
    frontierCrownCertified: true,
    frontierCrownCertificateDigest: crownCertificate.certificateDigest,
    frontierCrownProfileUniverseDigest: crownCertificate.profileUniverseDigest,
    frontierCrownCallabilityReceiptDigest: crownCertificate.callabilityReceiptDigest,
    frontierBaselineArchitectureId: crownCertificate.crownArchitectureId,
    frontierCandidateArchitectureId: sealedTrial.architectureId,
    baselineSealedTrialReceiptDigest: crownCertificate.crownTrialReceiptDigest,
    liveRoutingAuthority: 'CANONICAL_FRONTIER_CROWN'
  };
  canonicalLiveBenchmarks.set(benchmark, sha256(benchmark));
  return envelope({
    ok: true,
    status: 'FRONTIER_CROWN_BENCHMARK_READY',
    benchmark,
    benchmarkDigest: sha256(benchmark),
    crownCertificateDigest: crownCertificate.certificateDigest,
    promotionAuthority: 'NONE'
  });
}

export function buildZeroLossAuthorizedFrontierBenchmark({
  baselineTrial,
  candidateTrial,
  crownCertificate,
  zeroLossCertificate,
  profile,
  taskClasses = ['general'],
  now = new Date()
} = {}) {
  const baselineOrigin = validateCompiledSealedArchitectureTrial(baselineTrial);
  const candidateOrigin = validateCompiledSealedArchitectureTrial(candidateTrial);
  const reasons = [];
  if (!baselineOrigin.ok) reasons.push('canonical-baseline-sealed-trial-required');
  if (!candidateOrigin.ok) reasons.push('canonical-candidate-sealed-trial-required');

  const crown = validateCanonicalFrontierCrownCertificate(crownCertificate, {
    expectedCrownTrialReceiptDigest: baselineTrial?.receiptDigest ?? null
  });
  if (!crown.ok) reasons.push(...crown.reasonCodes);
  if (crown.ok && crownCertificate.crownArchitectureId !== baselineTrial?.architectureId) reasons.push('zero-loss-baseline-is-not-current-frontier-crown');

  const certificate = validateCanonicalZeroLossCertificate(zeroLossCertificate, {
    expectedCandidateArchitectureId: candidateTrial?.architectureId ?? null,
    minimumTaskCount: candidateTrial?.statistics?.sampleSize ?? 1
  });
  if (!certificate.ok) reasons.push(...certificate.reasonCodes);
  if (certificate.ok) {
    if (zeroLossCertificate.baselineArchitectureId !== baselineTrial.architectureId) reasons.push('zero-loss-baseline-architecture-mismatch');
    if (zeroLossCertificate.baselineReceiptDigest !== baselineTrial.receiptDigest) reasons.push('zero-loss-baseline-receipt-mismatch');
    if (zeroLossCertificate.candidateReceiptDigest !== candidateTrial.receiptDigest) reasons.push('zero-loss-candidate-receipt-mismatch');
    if (zeroLossCertificate.baselineTaskOutcomeDigest !== baselineTrial.taskOutcomeDigest) reasons.push('zero-loss-baseline-task-outcome-mismatch');
    if (zeroLossCertificate.candidateTaskOutcomeDigest !== candidateTrial.taskOutcomeDigest) reasons.push('zero-loss-candidate-task-outcome-mismatch');
  }
  if (reasons.length) return failure(reasons, 'FRONTIER_ZERO_LOSS_BENCHMARK_REFUSED');

  const base = buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial: candidateTrial,
    profile,
    taskClasses,
    now
  });
  if (!base.ok) return base;

  const benchmark = {
    ...base.benchmark,
    absoluteFrontierBaseline: false,
    frontierBaselineArchitectureId: baselineTrial.architectureId,
    frontierCandidateArchitectureId: candidateTrial.architectureId,
    frontierCrownCertified: false,
    frontierCrownCertificateDigest: crownCertificate.certificateDigest,
    frontierCrownProfileUniverseDigest: crownCertificate.profileUniverseDigest,
    frontierCrownCallabilityReceiptDigest: crownCertificate.callabilityReceiptDigest,
    pairedZeroLossCertified: true,
    pairedZeroLossCertificationDigest: zeroLossCertificate.certificationDigest,
    baselineSealedTrialReceiptDigest: baselineTrial.receiptDigest,
    liveRoutingAuthority: 'CANONICAL_PAIRED_ZERO_LOSS_AGAINST_EXACT_CROWN'
  };
  canonicalLiveBenchmarks.set(benchmark, sha256(benchmark));

  return envelope({
    ok: true,
    status: 'FRONTIER_ZERO_LOSS_BENCHMARK_READY',
    benchmark,
    benchmarkDigest: sha256(benchmark),
    zeroLossCertificationDigest: zeroLossCertificate.certificationDigest,
    baselineArchitectureId: baselineTrial.architectureId,
    baselineReceiptDigest: baselineTrial.receiptDigest,
    promotionAuthority: 'NONE',
    truthBoundary: 'THIS CANDIDATE BENCHMARK HAS LIVE ROUTING AUTHORITY ONLY AGAINST THE EXACT CANONICAL BASELINE TRIAL RECEIPT NAMED IN ITS PROCESS-BOUND ZERO-LOSS CERTIFICATE. A NEW BASELINE REQUIRES NEW PAIRED PROOF.'
  });
}

export function validateLiveFrontierBenchmark(benchmark) {
  const expected = benchmark && typeof benchmark === 'object' ? canonicalLiveBenchmarks.get(benchmark) : null;
  const actual = benchmark && typeof benchmark === 'object' ? sha256(benchmark) : null;
  if (!expected || expected !== actual) {
    return failure(['canonical-untampered-live-frontier-benchmark-required'], 'FRONTIER_LIVE_BENCHMARK_PROVENANCE_BLOCKED');
  }
  return envelope({
    ok: true,
    status: 'FRONTIER_LIVE_BENCHMARK_PROVENANCE_VALID',
    benchmarkDigest: actual,
    evidenceRef: benchmark.evidenceRef,
    observedRevision: benchmark.observedRevision
  });
}

export function buildFrontierAdmissionBundle({
  profiles = [],
  callability = [],
  benchmarks = [],
  contextArtifacts = [],
  source = {},
  callabilityProvenance = null,
  frontierCrownCertificate = null
} = {}) {
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > MAX_PROFILES) return failure(['bounded-profile-list-required']);
  if (!Array.isArray(callability) || callability.length > MAX_CALLABILITY) return failure(['bounded-callability-list-required']);
  if (!Array.isArray(benchmarks) || benchmarks.length > MAX_BENCHMARKS) return failure(['bounded-benchmark-list-required']);
  if (!Array.isArray(contextArtifacts)) return failure(['context-artifacts-list-required']);

  const sourceKind = text(source?.kind, 120)?.toUpperCase();
  const sourceRef = text(source?.ref, 1000);
  const sourceObservedAt = timestamp(source?.observedAt);
  if (!sourceKind || !sourceRef || !sourceObservedAt) return failure(['admission-source-kind-ref-and-time-required']);

  const provenance = validateFrontierCallabilityProbeReceipt({ ...(callabilityProvenance ?? {}), allowSynthetic: true });
  const trustedProbeByProfileId = provenance.ok ? provenance.observationByProfileId : new Map();
  const crownValidation = frontierCrownCertificate == null
    ? null
    : validateCanonicalFrontierCrownCertificate(frontierCrownCertificate, {
        expectedCallabilityReceiptDigest: provenance.ok ? provenance.receiptDigest : null
      });
  if (provenance.trustedForLiveExecution === true && (!crownValidation || !crownValidation.ok || crownValidation.trustedForLiveExecution !== true)) {
    return failure(
      crownValidation?.reasonCodes ?? ['live-frontier-crown-certificate-required'],
      'FRONTIER_ADMISSION_CROWN_BLOCKED'
    );
  }
  if (frontierCrownCertificate != null && !crownValidation?.ok) {
    return failure(crownValidation.reasonCodes, 'FRONTIER_ADMISSION_CROWN_BLOCKED');
  }

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
  const liveBenchmarkAuthorityRequired = provenance.trustedForLiveExecution === true && provenance.simulationOnly !== true;
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
    if (liveBenchmarkAuthorityRequired) {
      const benchmarkProvenance = validateLiveFrontierBenchmark(raw);
      if (!benchmarkProvenance.ok) {
        rejectedBenchmarks.push({
          provider: identity.provider,
          model: identity.model,
          observedRevision: identity.revision,
          reason: 'canonical-sealed-live-benchmark-required'
        });
        continue;
      }
    }
    admittedBenchmarks.push(raw);
  }

  const provenanceMetadata = provenance.ok
    ? {
        receiptDigest: provenance.receiptDigest,
        sourceRef: provenance.sourceRef,
        generatedAt: provenance.generatedAt,
        simulationOnly: provenance.simulationOnly === true,
        trustedForLiveExecution: provenance.trustedForLiveExecution === true
      }
    : { receiptDigest: null, sourceRef: null, generatedAt: null, simulationOnly: false, trustedForLiveExecution: false };
  const identityDigest = sha256({
    source: { kind: sourceKind, ref: sourceRef, observedAt: sourceObservedAt },
    callabilityProvenance: provenanceMetadata,
    frontierCrown: crownValidation?.ok ? {
      certificateDigest: frontierCrownCertificate.certificateDigest,
      profileUniverseDigest: frontierCrownCertificate.profileUniverseDigest,
      crownProfileId: frontierCrownCertificate.crownProfileId,
      crownArchitectureId: frontierCrownCertificate.crownArchitectureId,
      crownTrialReceiptDigest: frontierCrownCertificate.crownTrialReceiptDigest,
      simulationOnly: frontierCrownCertificate.simulationOnly === true,
      trustedForLiveExecution: frontierCrownCertificate.trustedForLiveExecution === true
    } : null,
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
    frontierCrown: crownValidation?.ok ? {
      certificateDigest: frontierCrownCertificate.certificateDigest,
      profileUniverseDigest: frontierCrownCertificate.profileUniverseDigest,
      crownProfileId: frontierCrownCertificate.crownProfileId,
      crownArchitectureId: frontierCrownCertificate.crownArchitectureId,
      crownTrialReceiptDigest: frontierCrownCertificate.crownTrialReceiptDigest,
      simulationOnly: frontierCrownCertificate.simulationOnly === true,
      trustedForLiveExecution: frontierCrownCertificate.trustedForLiveExecution === true
    } : null,
    profiles: structuredClone(profiles),
    callability: structuredClone(admittedCallability),
    benchmarks: structuredClone(admittedBenchmarks),
    contextArtifacts: structuredClone(contextArtifacts),
    rejectedCallability,
    rejectedBenchmarks,
    identityDigest,
    simulationOnly: provenance.simulationOnly === true,
    trustedForLiveExecution: provenance.trustedForLiveExecution === true,
    truthBoundary: 'CALLER_LABELS_ARE_NOT_PROVENANCE; CALLABLE_NOW_ENTERS_ONLY_WHEN_BOUND_TO_A_VALID_PRODUCER_RECEIPT; SYNTHETIC_PROVENANCE_MAY_PLAN_TESTS_BUT_CAN_NEVER_AUTHORIZE_LIVE_EXECUTION; LIVE BENCHMARKS REQUIRE CANONICAL UNTAMPERED SEALED-TRIAL PRODUCER ORIGIN AND EXACT PROVIDER_MODEL_REVISION'
  };
  admittedBundles.set(bundle, { digest: sha256(bundle), callabilityProvenance });
  return envelope({ ok: true, status: 'FRONTIER_ADMISSION_READY', bundle });
}

export function compileAdmittedFrontierPlan({ task, admissionBundle, ...policy } = {}) {
  const trusted = admissionBundle && typeof admissionBundle === 'object' ? admittedBundles.get(admissionBundle) : null;
  if (!admissionBundle || admissionBundle.schemaVersion !== FRONTIER_ADMISSION_SCHEMA || !trusted || trusted.digest !== sha256(admissionBundle)) {
    return failure(['process-validated-untampered-frontier-admission-bundle-required'], 'FRONTIER_PLAN_ADMISSION_BLOCKED');
  }
  const result = compileFrontierCognitivePlan({
    ...policy,
    task,
    profiles: admissionBundle.profiles,
    callability: admissionBundle.callability,
    callabilityProvenance: trusted.callabilityProvenance,
    benchmarks: admissionBundle.benchmarks,
    contextArtifacts: admissionBundle.contextArtifacts
  });
  const simulationOnly = admissionBundle.simulationOnly === true;
  const trustedForLiveExecution = !simulationOnly && admissionBundle.trustedForLiveExecution === true;
  if (!result.ok) return envelope({
    ...result,
    simulationOnly,
    trustedForLiveExecution,
    admissionDigest: admissionBundle.identityDigest,
    admissionRejectedEvidence: { callability: admissionBundle.rejectedCallability, benchmarks: admissionBundle.rejectedBenchmarks }
  });
  const output = envelope({
    ...result,
    simulationOnly,
    trustedForLiveExecution,
    admissionDigest: admissionBundle.identityDigest,
    admissionSource: admissionBundle.source,
    callabilityProvenance: admissionBundle.callabilityProvenance,
    admissionRejectedEvidence: { callability: admissionBundle.rejectedCallability, benchmarks: admissionBundle.rejectedBenchmarks },
    truthBoundary: `${result.plan?.truthBoundary ? `${result.plan.truthBoundary}; ` : ''}${simulationOnly ? 'SYNTHETIC_PROVENANCE_TEST_PLAN_NOT_LIVE_AUTHORITY; ' : ''}PLAN_WAS_COMPILED_ONLY_FROM_PROCESS_VALIDATED_UNTAMPERED_EXACT_REVISION_ADMISSION_EVIDENCE`
  });
  admittedPlans.set(output, {
    planDigest: output.planDigest,
    planObjectDigest: sha256(output.plan),
    admissionDigest: output.admissionDigest,
    simulationOnly,
    trustedForLiveExecution
  });
  return output;
}

export function validateAdmittedFrontierPlan(planResult) {
  const trusted = planResult && typeof planResult === 'object' ? admittedPlans.get(planResult) : null;
  const reasons = [];
  if (!trusted) reasons.push('process-bound-admitted-frontier-plan-required');
  if (!planResult?.plan || !planResult?.planDigest) reasons.push('frontier-plan-and-digest-required');
  if (trusted && trusted.planDigest !== planResult.planDigest) reasons.push('frontier-plan-digest-mutation-detected');
  if (trusted && trusted.planObjectDigest !== sha256(planResult.plan)) reasons.push('frontier-plan-object-mutation-detected');
  if (trusted && trusted.admissionDigest !== planResult.admissionDigest) reasons.push('frontier-plan-admission-binding-mutation-detected');
  if (reasons.length) return failure(reasons, 'FRONTIER_PLAN_PROVENANCE_BLOCKED');
  return envelope({
    ok: true,
    status: 'FRONTIER_ADMITTED_PLAN_PROVENANCE_VALID',
    admissionDigest: trusted.admissionDigest,
    planDigest: trusted.planDigest,
    simulationOnly: trusted.simulationOnly,
    trustedForLiveExecution: trusted.trustedForLiveExecution
  });
}
