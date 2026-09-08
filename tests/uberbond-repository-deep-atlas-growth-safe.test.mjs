import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildUberBondRepositoryDeepAtlas } from '../src/uberbond-repository-deep-atlas.mjs';
import {
  BOUNDED_STRUCTURAL_DETAIL_STATUS,
  buildGrowthSafeUberBondRepositoryDeepAtlas,
  normalizeBoundedStructuralDetail
} from '../src/uberbond-repository-deep-atlas-growth-safe.mjs';

function largeJsonFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-deep-atlas-growth-'));
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const relativePath = 'artifacts/large-canon.json';
  const largeObject = {};
  for (let index = 0; index < 21050; index += 1) largeObject[`canonical_${index}`] = index;
  fs.writeFileSync(path.join(root, relativePath), JSON.stringify(largeObject));
  return {
    root,
    relativePath,
    featureGenome: {
      ok: true,
      genomeDigest: 'b'.repeat(64),
      artifactNodes: [{
        id: `artifact:${relativePath}`,
        path: relativePath,
        kind: 'CANON_OR_MEMORY',
        primaryFamily: 'sovereign-canon',
        families: ['sovereign-canon'],
        organs: ['sovereign-continuum'],
        classificationConfidence: 'FIXTURE'
      }]
    }
  };
}

test('a structural detail cap is not a repository-content truncation when full text chunks remain', () => {
  const { root, relativePath, featureGenome } = largeJsonFixture();
  try {
    const raw = buildUberBondRepositoryDeepAtlas({ root, featureGenome });
    assert.equal(raw.ok, false, 'fixture must reproduce the historical false-red');
    assert.equal(raw.status, 'REPOSITORY_DEEP_ATLAS_TRUNCATED');
    assert.ok(raw.truncatedFiles.includes(relativePath));
    const rawCoverage = raw.coverage.find(row => row.path === relativePath);
    assert.ok(rawCoverage.contentChunkCount > 0, 'the supposedly truncated file must still have chunk coverage');
    assert.match(rawCoverage.textDigest, /^[a-f0-9]{64}$/);

    const safe = buildGrowthSafeUberBondRepositoryDeepAtlas({ root, featureGenome });
    assert.equal(safe.ok, true, JSON.stringify(safe));
    assert.equal(safe.status, BOUNDED_STRUCTURAL_DETAIL_STATUS);
    assert.deepEqual(safe.structuralDetailCappedFiles, [relativePath]);
    assert.deepEqual(safe.truncatedFiles, []);
    assert.equal(safe.structuralDetailCoverage, 'BOUNDED_BY_POLICY__FULL_TEXT_CHUNK_COVERAGE_PRESERVED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('normalizer refuses to hide a real missing-chunk coverage defect', () => {
  const broken = {
    ok: false,
    status: 'REPOSITORY_DEEP_ATLAS_TRUNCATED',
    repositoryArtifactCount: 1,
    coverageCount: 1,
    truncatedFiles: ['canon.json'],
    textCoverageWithoutChunks: ['canon.json'],
    coverage: [{ path: 'canon.json', status: 'PARSED_TEXT', contentChunkCount: 0, textDigest: 'c'.repeat(64) }]
  };
  const result = normalizeBoundedStructuralDetail(broken);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REPOSITORY_DEEP_ATLAS_TRUNCATED');
  assert.equal(result.structuralDetailCappedFiles, undefined);
});

test('normalizer refuses to hide incomplete artifact coverage', () => {
  const broken = {
    ok: false,
    status: 'REPOSITORY_DEEP_ATLAS_TRUNCATED',
    repositoryArtifactCount: 2,
    coverageCount: 1,
    truncatedFiles: ['canon.json'],
    textCoverageWithoutChunks: [],
    coverage: [{ path: 'canon.json', status: 'PARSED_TEXT', contentChunkCount: 2, textDigest: 'd'.repeat(64) }]
  };
  const result = normalizeBoundedStructuralDetail(broken);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REPOSITORY_DEEP_ATLAS_TRUNCATED');
});
