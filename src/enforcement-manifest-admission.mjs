import { existsSync } from 'node:fs';

const text = value => String(value ?? '').trim();

export function verifyEnforcementManifestAdmission({ entries = [], fileExists = existsSync } = {}) {
  const problems = [];
  const normalized = Array.isArray(entries) ? entries : [];

  for (const entry of normalized) {
    const concept = text(entry?.concept);
    const sources = [...new Set((Array.isArray(entry?.sources) ? entry.sources : []).map(text).filter(Boolean))];
    const tests = [...new Set((Array.isArray(entry?.tests) ? entry.tests : []).map(text).filter(Boolean))];

    if (!concept) {
      problems.push({ reason: 'enforcement-entry-concept-required' });
      continue;
    }
    if (sources.length === 0) problems.push({ reason: 'enforcement-entry-source-required', concept });
    if (tests.length === 0) problems.push({ reason: 'enforcement-entry-test-required', concept });

    const missingSources = sources.filter(file => !fileExists(file));
    const missingTests = tests.filter(file => !fileExists(file));
    if (missingSources.length) problems.push({ reason: 'enforcement-source-missing', concept, files: missingSources });
    if (missingTests.length) problems.push({ reason: 'enforcement-test-missing', concept, files: missingTests });
  }

  return {
    ok: problems.length === 0,
    status: problems.length === 0 ? 'ENFORCEMENT_MANIFEST_ADMISSION_VERIFIED' : 'ENFORCEMENT_MANIFEST_ADMISSION_REFUSED',
    problems,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'THIS VERIFIER ONLY PROVES THAT EACH DECLARED ENFORCEMENT LAW NAMES AT LEAST ONE PRESENT SOURCE AND ONE PRESENT TEST. IT DOES NOT PROVE THE LAW HOLDS SYSTEM-WIDE, DOES NOT CREATE RUNTIME EVIDENCE, AND DOES NOT GRANT AUTHORITY.'
  };
}
