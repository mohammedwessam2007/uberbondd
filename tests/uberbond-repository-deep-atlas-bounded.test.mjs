import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildUberBondRepositoryDeepAtlas } from '../src/uberbond-repository-deep-atlas-bounded.mjs';

function largeJsonFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-deep-atlas-bounded-'));
  const relativePath = 'artifacts/sovereign/implementation-coverage-matrix.json';
  fs.mkdirSync(path.join(root, 'artifacts', 'sovereign'), { recursive: true });
  const rows = {};
  for (let index = 0; index < 25_000; index += 1) {
    rows[`concept-${String(index).padStart(5, '0')}`] = {
      state: index % 2 ? 'SPEC_ONLY' : 'ENFORCED_BY_CODE',
      lane: `OMEGA-${String(index % 15).padStart(2, '0')}`
    };
  }
  fs.writeFileSync(path.join(root, relativePath), JSON.stringify({ rows }));
  return {
    root,
    relativePath,
    featureGenome: {
      ok: true,
      genomeDigest: 'b'.repeat(64),
      artifactNodes: [{
        id: `artifact:${relativePath}`,
        path: relativePath,
        kind: 'GENERATED_ARTIFACT',
        primaryFamily: 'sovereign-continuum',
        families: ['sovereign-continuum'],
        organs: ['coverage-matrix'],
        classificationConfidence: 'FIXTURE'
      }]
    }
  };
}

test('large generated JSON remains complete when only structural-key enumeration hits the per-file budget', () => {
  const { root, relativePath, featureGenome } = largeJsonFixture();
  try {
    const atlas = buildUberBondRepositoryDeepAtlas({ root, featureGenome });
    assert.equal(atlas.ok, true, JSON.stringify({ status: atlas.status, truncatedFiles: atlas.truncatedFiles, unsafeBoundedFiles: atlas.unsafeBoundedFiles }));
    assert.equal(atlas.status, 'REPOSITORY_DEEP_ATLAS_COMPLETE_WITH_BOUNDED_STRUCTURAL_DETAIL');
    assert.deepEqual(atlas.structuralDetailBoundedFiles, [relativePath]);
    assert.deepEqual(atlas.unsafeBoundedFiles, []);
    const coverage = atlas.coverage.find(item => item.path === relativePath);
    assert.equal(coverage.status, 'PARSED_TEXT');
    assert.ok(coverage.contentChunkCount > 1, 'large file must retain full sequential content-chunk coverage');
    assert.match(coverage.textDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(atlas.textCoverageWithoutChunks, []);
    assert.ok(atlas.truncatedFiles.includes(relativePath), 'base structural-bound signal remains visible for compatibility/audit');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
