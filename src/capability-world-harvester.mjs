import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeDiscoveryArtifact, buildCapabilityProvenance } from './capability-genome-discovery.mjs';
import { scanCapabilityInstructions } from './capability-genome-admission.mjs';

export const CAPABILITY_WORLD_HARVESTER_VERSION = 'capability-world-harvester-1.0.1';
const PERMISSIVE = new Set(['MIT','APACHE-2.0','BSD-2-CLAUSE','BSD-3-CLAUSE','ISC','CC-BY-4.0']);
const REFERENCE_ONLY = new Set(['GPL-3.0','AGPL-3.0','SSPL-1.0','UNKNOWN','NOASSERTION','']);

const clone = value => structuredClone(value);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value,max=2000) => String(value ?? '').trim().slice(0,max);
function fail(reasonCodes, extra={}) {
  return { ok:false, status:'WORLD_CAPABILITY_HARVEST_DENIED', reasonCodes:[...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}
function normalizeLicense(value) {
  const raw = clean(value,80).toUpperCase().replaceAll('_','-');
  if (raw === 'APACHE-2') return 'APACHE-2.0';
  return raw || 'UNKNOWN';
}
function validHash(value) { return /^[a-f0-9]{64}$/i.test(String(value || '')); }

export function compileWorldSourceAdapterPlan({ sourceRegistry, sourceIds=[] }={}) {
  if (sourceRegistry?.schemaVersion !== 'uberbond.capability-genome.sources.v1' || !Array.isArray(sourceRegistry.sources)) return fail(['valid-source-registry-required']);
  const wanted = new Set(sourceIds.map(String));
  const selected = sourceRegistry.sources.filter(source => wanted.size === 0 || wanted.has(source.id));
  const unknown = [...wanted].filter(id => !selected.some(source => source.id === id));
  if (unknown.length) return fail(['unknown-source-requested'],{unknownSourceIds:unknown});
  const adapters = selected.map(source => ({
    sourceId: source.id,
    sourceClass: source.sourceClass,
    accessMode: source.accessMode,
    sourceUrl: source.url,
    artifactTypes:[...(source.artifactTypes||[])],
    incrementalCursor: source.incrementalCursor === true,
    executionAuthority:'READ_ONLY_DISCOVERY_ONLY',
    prohibited:[...(source.prohibited||[])],
    adapterState: source.accessMode === 'LOCAL_FILE' ? 'LOCAL_READ_ONLY_READY' : 'AUTHORIZED_NETWORK_ADAPTER_REQUIRED'
  }));
  return { ok:true, status:'WORLD_SOURCE_ADAPTER_PLAN_COMPILED', adapters, adapterDigest:digest(adapters), businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
}

export function normalizeWorldCapabilityObservation({
  sourceId, artifactType, sourceUrl, sourceRevision, contentHash, observedAt,
  maintainer={ name:'UNKNOWN' }, declaredLicense='UNKNOWN', detectedLicense='UNKNOWN',
  instructions='', manifests=[], dependencySpecs=[], metadata={}
}={}) {
  const reasons=[];
  if (!validHash(contentHash)) reasons.push('sha256-content-hash-required');
  if (!Array.isArray(manifests) || !Array.isArray(dependencySpecs)) reasons.push('manifest-and-dependency-arrays-required');
  if (reasons.length) return fail(reasons);
  const artifactResult = normalizeDiscoveryArtifact({ sourceId, artifactType, sourceUrl, sourceRevision, contentHash, observedAt, metadata });
  if (!artifactResult.ok) return fail(artifactResult.reasonCodes || ['artifact-normalization-failed']);
  const screening = scanCapabilityInstructions({ instructions, manifests, dependencySpecs });
  const declared = normalizeLicense(declaredLicense);
  const detected = normalizeLicense(detectedLicense);
  const concluded = detected !== 'UNKNOWN' ? detected : declared;
  const provenanceResult = buildCapabilityProvenance({ artifact:artifactResult.artifact, maintainer, declaredLicense:declared, detectedLicense:detected, concludedLicense:concluded });
  if (!provenanceResult.ok) return fail(provenanceResult.reasonCodes || ['provenance-build-failed']);
  const mutableDependency = screening.findings.some(item => ['mutable-remote-dependency','remote-package-execution','unpinned-container'].includes(item.code));
  const licenseDecision = PERMISSIVE.has(concluded) ? 'PERMISSIVE_OBSERVED' : REFERENCE_ONLY.has(concluded) ? 'REFERENCE_ONLY' : 'LEGAL_REVIEW_REQUIRED';
  let decision='CANDIDATE_FOR_DEEPER_REVIEW';
  const reasonCodes=[];
  if (screening.decision === 'QUARANTINE') { decision='QUARANTINE'; reasonCodes.push('static-security-critical-finding'); }
  else if (screening.decision === 'REVIEW' || mutableDependency) { decision='SECURITY_REVIEW_REQUIRED'; reasonCodes.push('static-security-review-required'); }
  if (licenseDecision === 'REFERENCE_ONLY' && decision !== 'QUARANTINE') { decision='REFERENCE_ONLY'; reasonCodes.push('license-not-integration-cleared'); }
  if (licenseDecision === 'LEGAL_REVIEW_REQUIRED' && !['QUARANTINE','REFERENCE_ONLY'].includes(decision)) { decision='LICENSE_REVIEW_REQUIRED'; reasonCodes.push('license-review-required'); }
  const candidate={
    schemaVersion:'uberbond.world-capability-observation.v1',
    artifact:artifactResult.artifact,
    provenance:provenanceResult.provenance,
    securityScreening:{ decision:screening.decision, findings:clone(screening.findings), scanDigest:screening.scanDigest },
    dependencyState: mutableDependency ? 'MUTABLE_OR_RUNTIME_RESOLVED_DEPENDENCY_PRESENT' : 'NO_MUTABLE_DEPENDENCY_SIGNAL_FROM_STATIC_INPUT',
    licenseDecision,
    admissionDecision:decision,
    reasonCodes,
    promotionAuthority:'NONE',
    executableAuthority:'NONE',
    trustState:'UNTRUSTED_DISCOVERED'
  };
  return { ok:true, status:'WORLD_CAPABILITY_OBSERVATION_NORMALIZED', candidate, candidateDigest:digest(candidate), businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
}

function validateNormalizedObservation(result) {
  const reasons=[];
  if (!result?.ok || !result?.candidate?.artifact?.contentHash) reasons.push('successful-normalized-observation-required');
  if (!validHash(result?.candidateDigest)) reasons.push('candidate-digest-required');
  if (result?.candidate && result.candidateDigest !== digest(result.candidate)) reasons.push('candidate-digest-mismatch');
  if (result?.candidate?.schemaVersion !== 'uberbond.world-capability-observation.v1') reasons.push('candidate-schema-invalid');
  if (result?.candidate?.trustState !== 'UNTRUSTED_DISCOVERED') reasons.push('candidate-trust-state-invalid');
  if (result?.candidate?.promotionAuthority !== 'NONE' || result?.candidate?.executableAuthority !== 'NONE') reasons.push('candidate-authority-inflation');
  return reasons;
}

export function buildWorldCapabilityAssimilationBatch({ observations=[] }={}) {
  if (!Array.isArray(observations) || observations.length === 0) return fail(['observation-array-required']);
  const accepted=[];
  const rejected=[];
  const byContent=new Map();
  const duplicateArtifacts=[];
  for (const result of observations) {
    const integrityReasons=validateNormalizedObservation(result);
    if (integrityReasons.length) return fail(integrityReasons);
    const candidate=clone(result.candidate);
    const hash=candidate.artifact.contentHash;
    if (byContent.has(hash)) { duplicateArtifacts.push({ kept:byContent.get(hash).artifact.artifactIdentity, duplicate:candidate.artifact.artifactIdentity, contentHash:hash }); continue; }
    byContent.set(hash,candidate);
    if (['QUARANTINE','REFERENCE_ONLY'].includes(candidate.admissionDecision)) rejected.push({ artifactIdentity:candidate.artifact.artifactIdentity, decision:candidate.admissionDecision, reasonCodes:[...candidate.reasonCodes], contentHash:hash });
    else accepted.push(candidate);
  }
  const decisionCounts={};
  for (const candidate of byContent.values()) decisionCounts[candidate.admissionDecision]=(decisionCounts[candidate.admissionDecision]||0)+1;
  const batch={
    schemaVersion:'uberbond.world-capability-assimilation-batch.v1',
    inputObservationCount:observations.length,
    distinctContentCount:byContent.size,
    duplicateContentCount:duplicateArtifacts.length,
    deeperReviewCandidateCount:accepted.length,
    rejectionMemoryCount:rejected.length,
    decisionCounts,
    candidates:accepted,
    rejectionMemory:rejected,
    duplicateArtifacts,
    promotionAuthority:'NONE',
    executableAuthority:'NONE',
    truthBoundary:'DISCOVERY_AND_STATIC_SCREENING_ONLY__NO_INSTALL_NO_EXECUTION_NO_PROMOTION_NO_LICENSE_LEGAL_CONCLUSION'
  };
  return { ok:true, status:'WORLD_CAPABILITY_ASSIMILATION_BATCH_BUILT', batch, batchDigest:digest(batch), businessEffectAuthority:'NONE', externalEffectLedger:zeroEffects() };
}
