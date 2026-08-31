import crypto from 'node:crypto';
import path from 'node:path';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeDiscoveryArtifact } from './capability-genome-discovery.mjs';
import { scanCapabilityInstructions } from './capability-genome-admission.mjs';

export const CAPABILITY_GENOME_BODY_IMPORT_VERSION = 'capability-genome-body-import-1.0.0';
export const SKILL_BODY_CORPUS_SCHEMA = 'uberbond.capability-genome.corpus-state.v1';
const DEFAULT_MAX_BODY_BYTES = 512 * 1024;

const clone = value => structuredClone(value);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
const digestBody = body => crypto.createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex');
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    status: 'CAPABILITY_SKILL_BODY_IMPORT_DENIED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function clean(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function validSha1(value) { return /^[a-f0-9]{40}$/i.test(String(value || '')); }
function safeSkillPath(value) {
  const input = clean(value, 1000).replaceAll('\\', '/');
  if (!input || input.startsWith('/') || input.includes('\0')) return null;
  const normalized = path.posix.normalize(input);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return null;
  if (path.posix.basename(normalized).toUpperCase() !== 'SKILL.MD') return null;
  return normalized;
}

export function normalizePublicSkillBody({
  sourceId = 'github-public-capability-search',
  repositoryFullName,
  sourceCommit,
  gitBlobSha,
  skillPath,
  content,
  observedAt = new Date(),
  declaredLicenseHint = null
} = {}, { maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  const reasons = [];
  const repository = clean(repositoryFullName, 240);
  const pinnedCommit = clean(sourceCommit, 64).toLowerCase();
  const blobSha = clean(gitBlobSha, 64).toLowerCase();
  const normalizedPath = safeSkillPath(skillPath);
  if (sourceId !== 'github-public-capability-search') reasons.push('github-public-source-required');
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) reasons.push('github-repository-full-name-required');
  if (!validSha1(pinnedCommit)) reasons.push('immutable-source-commit-required');
  if (!validSha1(blobSha)) reasons.push('git-blob-sha-required');
  if (!normalizedPath) reasons.push('safe-skill-md-path-required');
  if (typeof content !== 'string') reasons.push('utf8-skill-body-required');
  const byteLength = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : 0;
  if (byteLength <= 0) reasons.push('nonempty-skill-body-required');
  const byteCap = Number.isSafeInteger(maxBodyBytes) ? Math.max(1024, Math.min(2 * 1024 * 1024, maxBodyBytes)) : DEFAULT_MAX_BODY_BYTES;
  if (byteLength > byteCap) reasons.push('skill-body-size-ceiling-exceeded');
  if (typeof content === 'string' && content.includes('\0')) reasons.push('binary-skill-body-prohibited');
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) reasons.push('valid-observed-at-required');
  if (reasons.length) return fail(reasons, { byteLength, byteCap });

  const contentHash = digestBody(content);
  const sourceUrl = `https://github.com/${repository}/blob/${pinnedCommit}/${normalizedPath}`;

  // Screen the bytes here, where they are in hand.
  //
  // scanCapabilityInstructions already existed and already catches this class
  // -- a body carrying `curl | bash`, an SSH-key read and an instruction
  // -hierarchy attack comes back QUARANTINE with four findings. Nothing called
  // it for an imported body, so the corpus grew carrying no risk signal at all.
  // This is the wiring, not a second scanner: a second one would drift from the
  // first and there would be two answers to one question.
  //
  // The screening is bound to the exact bytes and the exact commit it was run
  // against. Security evidence for one revision says nothing about the next, and
  // a finding that could be carried forward to a body nobody scanned would be
  // worse than no finding at all.
  //
  // Screening never promotes. A quarantined body is still imported as evidence,
  // because knowing a dangerous skill exists is worth more than pretending it
  // does not -- it stays UNTRUSTED_DISCOVERED with no authority either way.
  const screening = scanCapabilityInstructions({ instructions: content });
  const securityScreening = {
    decision: screening.decision,
    findings: clone(screening.findings || []),
    scanDigest: screening.scanDigest,
    // What was actually screened, so the evidence cannot be read as covering
    // any other bytes.
    screenedContentSha256: contentHash,
    screenedSourceCommit: pinnedCommit,
    screenedGitBlobSha: blobSha,
    caveat: screening.caveat
  };
  const normalized = normalizeDiscoveryArtifact({
    sourceId,
    artifactType: 'SKILL',
    sourceUrl,
    sourceRevision: pinnedCommit,
    contentHash,
    observedAt: observed.toISOString(),
    metadata: {
      repositoryFullName: repository,
      skillPath: normalizedPath,
      gitBlobSha: blobSha,
      byteLength,
      declaredLicenseHint: declaredLicenseHint == null ? null : clean(declaredLicenseHint, 500),
      storageMode: 'SOURCE_PINNED_REFERENCE_ONLY',
      bodyRetention: 'NOT_COPIED_INTO_UBERBOND_GIT'
    }
  });
  if (!normalized.ok) return fail(normalized.reasonCodes || ['discovery-artifact-normalization-failed']);

  return {
    ok: true,
    status: 'PUBLIC_SKILL_BODY_OBSERVED_AND_HASHED',
    bodyEvidence: {
      artifactIdentity: normalized.artifact.artifactIdentity,
      sourceId,
      repositoryFullName: repository,
      skillPath: normalizedPath,
      sourceCommit: pinnedCommit,
      gitBlobSha: blobSha,
      contentSha256: contentHash,
      byteLength,
      sourceUrl,
      observedAt: observed.toISOString(),
      declaredLicenseHint: declaredLicenseHint == null ? null : clean(declaredLicenseHint, 500),
      trustState: 'UNTRUSTED_DISCOVERED',
      promotionAuthority: 'NONE',
      storageMode: 'SOURCE_PINNED_REFERENCE_ONLY',
      securityScreening
    },
    artifact: normalized.artifact,
    body: content,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function buildMeasuredSkillBodyCorpus({ bodyImports = [], observedAt = new Date(), providerCalls = 0 } = {}) {
  if (!Array.isArray(bodyImports) || bodyImports.length === 0) return fail(['body-imports-required']);
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) return fail(['valid-observed-at-required']);
  if (!Number.isSafeInteger(providerCalls) || providerCalls < 0) return fail(['nonnegative-provider-call-count-required']);
  const byArtifact = new Map();
  const duplicateArtifactIdentities = [];
  for (const item of bodyImports) {
    if (!item?.ok || !item?.bodyEvidence?.artifactIdentity) return fail(['successful-body-import-required']);
    const evidence = item.bodyEvidence;
    if (evidence.trustState !== 'UNTRUSTED_DISCOVERED' || evidence.promotionAuthority !== 'NONE') return fail(['untrusted-zero-authority-body-evidence-required']);
    // A body that reached the corpus without being screened would be counted
    // alongside screened ones and become indistinguishable from them.
    if (!evidence.securityScreening?.decision || evidence.securityScreening.screenedContentSha256 !== evidence.contentSha256) {
      return fail(['revision-bound-security-screening-required']);
    }
    if (byArtifact.has(evidence.artifactIdentity)) duplicateArtifactIdentities.push(evidence.artifactIdentity);
    else byArtifact.set(evidence.artifactIdentity, clone(evidence));
  }
  const bodies = [...byArtifact.values()].sort((a, b) => a.artifactIdentity.localeCompare(b.artifactIdentity));
  const repositories = new Set(bodies.map(item => item.repositoryFullName.toLowerCase()));
  const contentHashes = new Set(bodies.map(item => item.contentSha256));
  const bodyEvidenceDigest = crypto.createHash('sha256').update(JSON.stringify(bodies.map(item => [item.artifactIdentity, item.gitBlobSha, item.contentSha256, item.byteLength]))).digest('hex');
  const manifest = {
    schemaVersion: SKILL_BODY_CORPUS_SCHEMA,
    bodyImportVersion: CAPABILITY_GENOME_BODY_IMPORT_VERSION,
    corpusKind: 'WORLD_SKILL_BODY_EVIDENCE',
    sourceId: 'github-public-capability-search',
    evidenceClass: 'MEASURED_IMPORT',
    observedAt: observed.toISOString(),
    providerCalls,
    repositoryCount: repositories.size,
    skillBodiesImported: bodies.length,
    distinctSkillBodyContentCount: contentHashes.size,
    duplicateSkillBodyArtifacts: duplicateArtifactIdentities.length,
    // Counted apart, never summed into one "imported" number. A corpus that
    // reported only a total would hide whether it was carrying quarantined
    // instructions.
    securityQuarantinedBodies: bodies.filter(item => item.securityScreening.decision === 'QUARANTINE').length,
    securityReviewBodies: bodies.filter(item => item.securityScreening.decision === 'REVIEW').length,
    securityStaticClearBodies: bodies.filter(item => item.securityScreening.decision === 'STATIC_CLEAR').length,
    capabilityRecordsNormalized: 0,
    approvedCapabilities: 0,
    activeCapabilities: 0,
    storageMode: 'SOURCE_PINNED_REFERENCE_ONLY',
    bodyEvidenceDigest,
    truthBoundary: 'BODY_BYTES_WERE_OBSERVED_HASHED_PINNED_AND_STATICALLY_SCREENED__STATIC_CLEAR_IS_NOT_SAFETY_NOT_NORMALIZED_CAPABILITY_NOT_APPROVED_NOT_ACTIVE'
  };
  return {
    ok: true,
    status: 'MEASURED_WORLD_SKILL_BODY_CORPUS_BUILT',
    manifest,
    bodyEvidence: bodies,
    duplicateArtifactIdentities: [...new Set(duplicateArtifactIdentities)].sort(),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...zeroEffects(), providerCalls }
  };
}

export function verifyRefetchedSkillBody({ bodyEvidence, content, gitBlobSha = null } = {}) {
  if (!bodyEvidence?.contentSha256 || !bodyEvidence?.sourceCommit || !bodyEvidence?.skillPath) return fail(['body-evidence-required']);
  if (typeof content !== 'string' || content.includes('\0')) return fail(['utf8-skill-body-required']);
  const actual = digestBody(content);
  const reasons = [];
  if (actual !== bodyEvidence.contentSha256) reasons.push('skill-body-sha256-mismatch');
  if (gitBlobSha != null && clean(gitBlobSha, 64).toLowerCase() !== bodyEvidence.gitBlobSha) reasons.push('git-blob-sha-mismatch');
  if (reasons.length) return fail(reasons, { expectedSha256: bodyEvidence.contentSha256, actualSha256: actual });
  return {
    ok: true,
    status: 'PINNED_SKILL_BODY_REFETCH_VERIFIED',
    contentSha256: actual,
    sourceCommit: bodyEvidence.sourceCommit,
    gitBlobSha: bodyEvidence.gitBlobSha,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
