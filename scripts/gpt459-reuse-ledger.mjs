#!/usr/bin/env node
/**
 * #459 evidence ledger. This intentionally maps only capability domain/atom
 * rows and never promotes metadata-only atoms. It is derived from the exact
 * checked-out matrix so the ledger cannot silently drop rows.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const matrixPath = 'artifacts/sovereign/implementation-coverage-matrix.json';
const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const rows = matrix.rows.filter(row => row.class === 'CAPABILITY_DOMAIN' || row.class === 'CAPABILITY_ATOM');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const repositoryFiles = execFileSync('rg', ['--files', 'src', 'scripts', 'tests'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const contentCache = new Map();
const contentMatches = row => {
  const tokens = row.literalNames.flatMap(name => String(name).toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 5));
  const distinct = [...new Set(tokens)];
  return repositoryFiles.filter(file => {
    if (!contentCache.has(file)) { try { contentCache.set(file, fs.readFileSync(file, 'utf8').toLowerCase()); } catch { contentCache.set(file, ''); } }
    const body = contentCache.get(file);
    return distinct.length > 0 && distinct.some(token => body.includes(token));
  }).slice(0, 20);
};
const dispositionFor = row => {
  const evidence = row.currentEvidence || {};
  if (row.currentState === 'VERIFIED_CURRENT' && evidence.sourceModules?.length && evidence.testModules?.length && evidence.reachability) return 'VERIFIED_REUSE';
  if (row.currentState === 'PARTIAL_CURRENT' && evidence.sourceModules?.length) return 'PARTIAL_REUSE';
  if (['STRUCTURAL_NOT_A_BUILD_TARGET', 'COVERED_BY_PARENT_ORGAN', 'REFERENCE_ONLY_BY_CANON', 'ALIAS_OF_CANONICAL_CONCEPT'].includes(row.currentState)) return 'MISCLASSIFIED_OR_STRUCTURAL';
  if (['EXTERNAL_BLOCKED', 'ELAPSED_TIME_REQUIRED', 'OWNER_BOUNDARY'].includes(row.currentState)) return 'EXTERNAL_OR_ELAPSED';
  return 'GENUINE_GAP';
};
const ledgerRows = rows.map(row => {
  const evidence = row.currentEvidence || {};
  const disposition = dispositionFor(row);
  const metadataOnly = row.class === 'CAPABILITY_ATOM' && disposition === 'GENUINE_GAP';
  return {
    canonicalId: row.canonicalId,
    literalNames: row.literalNames,
    class: row.class,
    priorState: row.currentState,
    disposition,
    implementationProof: disposition === 'VERIFIED_REUSE' || disposition === 'PARTIAL_REUSE' ? 'matrix-lead-requires-independent-behavioral-review' : metadataOnly ? 'metadata-only-or-no-behavioral-source-found' : 'no-qualifying-behavioral-proof',
    evidenceGrade: disposition === 'GENUINE_GAP' ? 'UNPROVEN_CANDIDATE_NOT_PROOF_OF_ABSENCE' : 'MATRIX_LEAD_NOT_BEHAVIORAL_VERIFICATION',
    absenceClaim: false,
    repositorySearchMatches: contentMatches(row),
    sourceModules: evidence.sourceModules || [],
    focusedTests: evidence.testModules || [],
    reachability: evidence.reachability || 'UNREACHABLE_OR_UNPROVEN',
    authorityClass: row.authorityClass,
    privacyClass: row.privacyClass,
    matchStrength: evidence.matchStrength || 'NO_MATCH',
    matchScope: evidence.matchScope || 'NONE',
    matchedPhrase: evidence.matchedPhrase || null,
    boundary: evidence.boundary || 'NO_BEHAVIORAL_EVIDENCE',
    rationale: disposition === 'VERIFIED_REUSE'
      ? 'Matrix provides a strong source/test/reachability lead; independent behavioral review is still required before promotion.'
      : disposition === 'PARTIAL_REUSE'
        ? 'Matrix provides a source/test lead covering part of the named capability; broader behavior remains unproven.'
        : metadataOnly
          ? 'Capability atom is present in the taxonomy but metadata is not implementation; independent repository search is recorded.'
          : 'No qualifying behavioral proof was found by the matrix lead; this is an unproven candidate for #460, not proof that no implementation exists.'
  };
});
const counts = Object.fromEntries(['VERIFIED_REUSE','PARTIAL_REUSE','GENUINE_GAP','MISCLASSIFIED_OR_STRUCTURAL','EXTERNAL_OR_ELAPSED'].map(k => [k, ledgerRows.filter(row => row.disposition === k).length]));
const out = {
  schemaVersion: 'uberbond.gpt459.reuse-ledger.v1',
  mission: 'Issue #459 capability domain/atom reuse compression',
  generatedAt: new Date().toISOString(),
  sourceCommit,
  matrixSourceCommit: matrix.sourceCommit,
  rowCount: ledgerRows.length,
  expectedClasses: { CAPABILITY_DOMAIN: ledgerRows.filter(r => r.class === 'CAPABILITY_DOMAIN').length, CAPABILITY_ATOM: ledgerRows.filter(r => r.class === 'CAPABILITY_ATOM').length },
  counts,
  truthBoundary: { realCustomers: 0, clearedRevenue: 0, acceptedPaidDeliveries: 0, retainedCustomers: 0 },
  rows: ledgerRows
};
fs.mkdirSync('artifacts/work', { recursive: true });
fs.writeFileSync('artifacts/work/gpt459-capability-reuse-ledger.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ sourceCommit, rowCount: out.rowCount, counts, output: 'artifacts/work/gpt459-capability-reuse-ledger.json' }, null, 2));
