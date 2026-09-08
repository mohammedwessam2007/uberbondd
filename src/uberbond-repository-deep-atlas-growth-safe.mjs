import { buildUberBondRepositoryDeepAtlas } from './uberbond-repository-deep-atlas.mjs';

export const UBERBOND_DEEP_ATLAS_GROWTH_SAFETY_VERSION = 'uberbond-deep-atlas-growth-safety-1.0.0';
export const BOUNDED_STRUCTURAL_DETAIL_STATUS = 'REPOSITORY_DEEP_ATLAS_COMPLETE_WITH_BOUNDED_STRUCTURAL_DETAIL';

const SHA256_RE = /^[a-f0-9]{64}$/;

function completeTextCoverage(result) {
  if (!result || !Array.isArray(result.coverage)) return false;
  if (result.coverageCount !== result.repositoryArtifactCount) return false;
  if (Array.isArray(result.textCoverageWithoutChunks) && result.textCoverageWithoutChunks.length > 0) return false;

  return result.coverage.every(row => {
    if (row?.status !== 'PARSED_TEXT') return true;
    return Number(row.contentChunkCount) > 0 && SHA256_RE.test(String(row.textDigest || ''));
  });
}

/**
 * The base Deep Atlas deliberately caps structural declarations per file.
 * Once large machine-readable canon crossed that cap, the old result called the
 * repository "truncated" even though chunk digests still covered the entire
 * file. That converted healthy repository growth into a deployment failure.
 *
 * This adapter is intentionally narrow and fail-closed. It only reclassifies a
 * result when the *only* failing condition is the bounded structural-detail
 * cap and complete text coverage is independently proven for every parsed file.
 * Missing artifacts, missing chunks, unreadable text, or any other failure stay
 * failures. Structural indexing remains bounded; repository truth coverage does
 * not pretend to be incomplete merely because optional per-key expansion hit a
 * resource limit.
 */
export function normalizeBoundedStructuralDetail(result) {
  if (!result || result.ok === true) return result;
  if (result.status !== 'REPOSITORY_DEEP_ATLAS_TRUNCATED') return result;

  const capped = Array.isArray(result.truncatedFiles)
    ? [...new Set(result.truncatedFiles.filter(Boolean))].sort()
    : [];
  if (capped.length === 0 || !completeTextCoverage(result)) return result;

  const coverageByPath = new Map((result.coverage || []).map(row => [row?.path, row]));
  const everyCappedFileStillCovered = capped.every(file => {
    const row = coverageByPath.get(file);
    return row?.status === 'PARSED_TEXT' && Number(row.contentChunkCount) > 0 && SHA256_RE.test(String(row.textDigest || ''));
  });
  if (!everyCappedFileStillCovered) return result;

  return {
    ...result,
    ok: true,
    status: BOUNDED_STRUCTURAL_DETAIL_STATUS,
    growthSafetyPolicyVersion: UBERBOND_DEEP_ATLAS_GROWTH_SAFETY_VERSION,
    structuralDetailCappedFiles: capped,
    truncatedFiles: [],
    structuralDetailCoverage: 'BOUNDED_BY_POLICY__FULL_TEXT_CHUNK_COVERAGE_PRESERVED',
    truthBoundary: `${result.truthBoundary || ''} STRUCTURAL DECLARATION EXPANSION IS RESOURCE-BOUNDED PER FILE. REACHING THAT BOUND DOES NOT MEAN SOURCE TEXT IS MISSING WHEN EVERY PARSED FILE STILL HAS A FULL-FILE DIGEST AND ONE OR MORE CONTENT-CHUNK POINTERS.`.trim()
  };
}

export function buildGrowthSafeUberBondRepositoryDeepAtlas(options = {}) {
  return normalizeBoundedStructuralDetail(buildUberBondRepositoryDeepAtlas(options));
}
