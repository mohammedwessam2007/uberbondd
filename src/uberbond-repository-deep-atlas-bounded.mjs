import { buildUberBondRepositoryDeepAtlas as buildBaseAtlas } from './uberbond-repository-deep-atlas.mjs';

export const UBERBOND_REPOSITORY_DEEP_ATLAS_BOUNDED_POLICY_VERSION = 'uberbond-repository-deep-atlas-bounded-1.0.0';

function hasCompleteContentCoverage(result, pathname) {
  const row = (result?.coverage || []).find(item => item?.path === pathname);
  return row?.status === 'PARSED_TEXT'
    && Number(row?.contentChunkCount || 0) > 0
    && /^[a-f0-9]{64}$/i.test(String(row?.textDigest || ''));
}

/**
 * Preserve the base atlas' strictness for missing files, unreadable text, and
 * missing content chunks, while treating the structural-detail cap as the
 * bounded index it actually is.
 *
 * The base extractor always emits full-file text digests and sequential
 * CONTENT_CHUNK coverage before structural JSON/code enumeration. Once that
 * full content coverage exists, exhausting MAX_DETAILS_PER_FILE means only
 * that the convenience structural index was bounded. It must not turn a large
 * generated machine artifact into a repository-wide build failure.
 */
export function buildUberBondRepositoryDeepAtlas(options = {}) {
  const result = buildBaseAtlas(options);
  if (result?.ok === true || result?.status !== 'REPOSITORY_DEEP_ATLAS_TRUNCATED') return result;

  const bounded = [...new Set(result?.truncatedFiles || [])].sort();
  const unsafe = bounded.filter(pathname => !hasCompleteContentCoverage(result, pathname));
  if (unsafe.length) {
    return {
      ...result,
      boundedPolicyVersion: UBERBOND_REPOSITORY_DEEP_ATLAS_BOUNDED_POLICY_VERSION,
      structuralDetailBoundedFiles: bounded,
      unsafeBoundedFiles: unsafe,
      truthBoundary: `${result?.truthBoundary || ''} STRUCTURAL DETAIL BOUNDS NEVER OVERRIDE MISSING FULL-TEXT DIGEST OR CONTENT-CHUNK COVERAGE.`.trim()
    };
  }

  return {
    ...result,
    ok: true,
    status: 'REPOSITORY_DEEP_ATLAS_COMPLETE_WITH_BOUNDED_STRUCTURAL_DETAIL',
    boundedPolicyVersion: UBERBOND_REPOSITORY_DEEP_ATLAS_BOUNDED_POLICY_VERSION,
    structuralDetailBoundedFiles: bounded,
    unsafeBoundedFiles: [],
    truthBoundary: `${result?.truthBoundary || ''} FILES IN structuralDetailBoundedFiles HAVE COMPLETE DIGESTED CONTENT-CHUNK COVERAGE; ONLY THEIR OPTIONAL STRUCTURAL-KEY ENUMERATION HIT THE PER-FILE BUDGET. BOUNDED STRUCTURAL ENUMERATION IS NOT CLAIMED AS EXHAUSTIVE.`.trim()
  };
}
