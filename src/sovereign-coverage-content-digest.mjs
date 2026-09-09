import crypto from 'node:crypto';

export const SOVEREIGN_COVERAGE_CONTENT_DIGEST_VERSION = 'uberbond.sovereign-coverage-content-digest.v1';
const SHA = /^[0-9a-f]{40}$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

export function sovereignCoverageContentDigest(coverage = {}) {
  const sourceCommit = String(coverage?.sourceCommit ?? '').trim().toLowerCase();
  const rows = Array.isArray(coverage?.rows) ? [...coverage.rows] : [];
  if (!SHA.test(sourceCommit) || rows.length === 0) return null;
  if (rows.some(row => !String(row?.canonicalId ?? '').trim())) return null;

  rows.sort((a, b) => String(a.canonicalId).localeCompare(String(b.canonicalId)));
  const payload = canonicalize({
    version: SOVEREIGN_COVERAGE_CONTENT_DIGEST_VERSION,
    schemaVersion: coverage?.schemaVersion ?? null,
    sourceCommit,
    counts: coverage?.counts ?? null,
    rows
  });
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
