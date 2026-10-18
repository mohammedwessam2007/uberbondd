import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { importPhoenixPublicHeads } from '../src/phoenix-ten-wave-intake.mjs';

const dir = new URL('../artifacts/research/phoenix-ten-wave-intake/', import.meta.url);
const manifestText = fs.readFileSync(new URL('repositories.urls.txt', dir), 'utf8');
const snapshot = JSON.parse(fs.readFileSync(new URL('public-head-243-20261018.json', dir), 'utf8'));
const check = (patch = {}) => importPhoenixPublicHeads({ manifestText, receipt: { ...structuredClone(snapshot), ...patch } });

test('real 243 GitHub observations feed current measured Capability Genome with zero authority', () => {
  const result = check();
  assert.equal(result.ok, true);
  assert.equal(result.corpus.manifest.distinctRepositoryCandidates, 240);
  assert.equal(result.corpus.manifest.rawRepositoryHits, 243);
  assert.equal(result.corpus.manifest.providerCalls, 0);
  assert.equal(result.corpus.manifest.approvedCapabilities, 0);
  assert.equal(result.corpus.manifest.activeCapabilities, 0);
  assert.equal(result.corpus.candidates.length, 240);
  assert.ok(result.corpus.candidates.every(c => c.trustState === 'UNTRUSTED_REPOSITORY_CANDIDATE' && c.promotionAuthority === 'NONE'));
  assert.equal(result.upstreamCommitRefs.length, 243);
  assert.equal(result.caseInsensitiveDuplicateUrls, 3);
  assert.equal(result.totalSourceUrls, 243);
  assert.equal(result.canonicalSupplierIdentities, 240);
  assert.ok(result.upstreamCommitRefs.every(r => /^[0-9a-f]{40}$/.test(r.observedHead)));
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(result.externalEffects.providerCalls, 0);
});

test('repeated import is deterministic with same immutable evidence', () => {
  const a = check(), b = check();
  assert.equal(a.corpus.manifest.batchId, b.corpus.manifest.batchId);
  assert.equal(a.corpus.manifest.candidateDigest, b.corpus.manifest.candidateDigest);
});

test('tampering source SHA, missing record, forged license or promotion fails closed', () => {
  const mutated = structuredClone(snapshot); mutated.rows[17].head_sha = '0'.repeat(40).replace(/^0/, 'x');
  assert.equal(check({ rows: mutated.rows }).ok, false);
  const validFormatButForged = structuredClone(snapshot);
  validFormatButForged.rows[17].head_sha = 'a'.repeat(40);
  assert.equal(check({ rows: validFormatButForged.rows }).ok, false);
  assert.equal(check({ rows: snapshot.rows.slice(1) }).ok, false);
  assert.equal(check({ supplier_promotion: 'ACTIVE' }).ok, false);
  assert.equal(check({ license_status: 'LICENSE_APPROVED' }).ok, false);
  assert.equal(check({ source_manifest_sha256: '0'.repeat(64) }).ok, false);
  assert.equal(importPhoenixPublicHeads({ manifestText: manifestText.replace('github.com', 'evil.invalid'), receipt: snapshot }).ok, false);
});

test('reordered refs, invented visibility and corrupt observation time fail closed', () => {
  const rows = structuredClone(snapshot.rows);
  [rows[1], rows[2]] = [rows[2], rows[1]];
  assert.equal(check({ rows }).ok, false);
  assert.equal(check({ observed_at_utc: '2033-10-17' }).ok, false);
  assert.equal(check({ checked: 242 }).ok, false);
});

test('generated measured research corpus is persisted with immutable lineage and no promotion', () => {
  const artifact = JSON.parse(fs.readFileSync(new URL('../artifacts/capability-genome/research/phoenix-public-repository-corpus.json', import.meta.url), 'utf8'));
  const measured = check();
  assert.equal(artifact.truthClass, 'MEASURED_READ_ONLY_UNTRUSTED_NOT_ADMITTED');
  assert.equal(artifact.measured.manifest.batchId, measured.corpus.manifest.batchId);
  assert.equal(artifact.measured.manifest.candidateDigest, measured.corpus.manifest.candidateDigest);
  assert.deepEqual(artifact.measured.candidates, measured.corpus.candidates);
  assert.deepEqual(artifact.upstreamCommitRefs, measured.upstreamCommitRefs);
  assert.equal(artifact.canonicalSupplierIdentities, 240);
  assert.equal(artifact.sourceUrlObservations, 243);
  assert.equal(artifact.promotionAuthority, 'NONE');
  assert.equal(artifact.archivedStatus, 'UNKNOWN_FROM_PUBLIC_GIT_HEAD');
  assert.equal(artifact.licenseStatus, 'UNVERIFIED');
});

test('public importer denies arbitrary output paths and unrecognized operations', () => {
  const script = new URL('../scripts/phoenix-ten-wave-import.mjs', import.meta.url).pathname;
  for (const args of [['--deploy'], ['--write', '/tmp/forbidden']]) {
    const p = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.notEqual(p.status, 0);
    assert.equal(JSON.parse(p.stderr.trim()).status, 'PHOENIX_MEASURED_IMPORT_REFUSED');
  }
});
