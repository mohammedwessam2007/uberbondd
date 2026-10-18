#!/usr/bin/env node
// Read-only PHOENIX -> existing Capability Genome corpus bridge.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPhoenixPublicHeads } from '../src/phoenix-ten-wave-intake.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'artifacts/research/phoenix-ten-wave-intake');
try {
  if (process.argv.length > 3 || (process.argv.length === 3 && process.argv[2] !== '--write-research-artifact')) throw new Error('ONLY_FIXED_RESEARCH_ARTIFACT_WRITE_ALLOWED');
  const manifestText = fs.readFileSync(path.join(dir, 'repositories.urls.txt'), 'utf8');
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'public-head-243-20261018.json'), 'utf8'));
  const result = importPhoenixPublicHeads({ manifestText, receipt });
  if (!result.ok) throw new Error(result.reasonCodes[0]);
  const { corpus, upstreamCommitRefs, ...meta } = result;
  if (process.argv[2] === '--write-research-artifact') {
    const output = path.join(root, 'artifacts/capability-genome/research/phoenix-public-repository-corpus.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('ARTIFACT_SYMLINK_REFUSED');
    fs.writeFileSync(output, JSON.stringify({
      schema: 'uberbond.capability-genome.phoenix-research-corpus.v1',
      truthClass: 'MEASURED_READ_ONLY_UNTRUSTED_NOT_ADMITTED',
      provenance: { sourceManifestHash: result.sourceManifestHash, sourceSnapshotHash: result.sourceSnapshotHash },
      sourceUrlObservations: 243, canonicalSupplierIdentities: result.canonicalSupplierIdentities,
      caseInsensitiveDuplicateUrls: result.caseInsensitiveDuplicateUrls,
      archivedStatus: 'UNKNOWN_FROM_PUBLIC_GIT_HEAD',
      licenseStatus: 'UNVERIFIED', promotionAuthority: 'NONE',
      upstreamCommitRefs, measured: { manifest: corpus.manifest, candidates: corpus.candidates }
    }, null, 2) + '\n');
  }
  console.log(JSON.stringify({
    ...meta, corpusManifest: corpus.manifest,
    firstCandidate: corpus.candidates[0],
    lastCandidate: corpus.candidates.at(-1),
    upstreamCommitsObserved: upstreamCommitRefs.length,
    outputIsReadOnly: true,
    outputIsSupplierApproval: false
  }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, status: 'PHOENIX_MEASURED_IMPORT_REFUSED', reason: e.message, authority: 'NONE' }));
  process.exitCode = 1;
}
