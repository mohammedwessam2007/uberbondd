import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePublicSkillBody,
  buildMeasuredSkillBodyCorpus,
  verifyRefetchedSkillBody
} from '../src/capability-genome-body-import.mjs';

const base = {
  repositoryFullName: 'anthropics/skills',
  sourceCommit: '3b3fad96af16a10759d930941b4520ba0c40edae',
  gitBlobSha: '47c72c607bdb5dd81bdea5de2b5e4f3992a5fd59',
  skillPath: 'skills/brand-guidelines/SKILL.md',
  content: '---\nname: brand-guidelines\n---\n\n# Brand\n',
  observedAt: '2026-08-31T16:10:00.000Z'
};

test('pinned public SKILL.md becomes untrusted body evidence with no promotion authority', () => {
  const result = normalizePublicSkillBody(base);
  assert.equal(result.ok, true);
  assert.equal(result.bodyEvidence.trustState, 'UNTRUSTED_DISCOVERED');
  assert.equal(result.bodyEvidence.promotionAuthority, 'NONE');
  assert.equal(result.bodyEvidence.storageMode, 'SOURCE_PINNED_REFERENCE_ONLY');
  assert.match(result.bodyEvidence.contentSha256, /^[a-f0-9]{64}$/);
  assert.match(result.bodyEvidence.sourceUrl, /blob\/3b3fad96af16a10759d930941b4520ba0c40edae\/skills\/brand-guidelines\/SKILL\.md$/);
  assert.equal(result.artifact.trustState, 'UNTRUSTED_DISCOVERED');
});

test('mutable branch names cannot substitute for an immutable commit', () => {
  const result = normalizePublicSkillBody({ ...base, sourceCommit: 'main' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('immutable-source-commit-required'));
});

test('non-SKILL paths and traversal attempts fail closed', () => {
  for (const skillPath of ['README.md', '../SKILL.md', '/skills/x/SKILL.md', 'skills/x/NOT_SKILL.md']) {
    const result = normalizePublicSkillBody({ ...base, skillPath });
    assert.equal(result.ok, false, skillPath);
    assert.ok(result.reasonCodes.includes('safe-skill-md-path-required'), skillPath);
  }
});

test('binary and oversized bodies are rejected before evidence normalization', () => {
  const binary = normalizePublicSkillBody({ ...base, content: 'safe\0evil' });
  assert.equal(binary.ok, false);
  assert.ok(binary.reasonCodes.includes('binary-skill-body-prohibited'));

  const oversized = normalizePublicSkillBody({ ...base, content: 'x'.repeat(4097) }, { maxBodyBytes: 4096 });
  assert.equal(oversized.ok, false);
  assert.ok(oversized.reasonCodes.includes('skill-body-size-ceiling-exceeded'));
});

test('body corpus dedupes exact artifacts but never manufactures capability or approval truth', () => {
  const first = normalizePublicSkillBody(base);
  const duplicate = normalizePublicSkillBody(base);
  const second = normalizePublicSkillBody({
    ...base,
    repositoryFullName: 'vercel-labs/skills',
    sourceCommit: '435076e78988e1e6ec40d00b0b1d76bdbbc5419a',
    gitBlobSha: 'a41bdd074bb587afd861332cf2f473f3154de4d7',
    skillPath: 'skills/find-skills/SKILL.md',
    content: '---\nname: find-skills\n---\n\n# Find Skills\n'
  });
  const corpus = buildMeasuredSkillBodyCorpus({ bodyImports: [first, duplicate, second], providerCalls: 3, observedAt: base.observedAt });
  assert.equal(corpus.ok, true);
  assert.equal(corpus.manifest.skillBodiesImported, 2);
  assert.equal(corpus.manifest.repositoryCount, 2);
  assert.equal(corpus.manifest.duplicateSkillBodyArtifacts, 1);
  assert.equal(corpus.manifest.capabilityRecordsNormalized, 0);
  assert.equal(corpus.manifest.approvedCapabilities, 0);
  assert.equal(corpus.manifest.activeCapabilities, 0);
  assert.equal(corpus.businessEffectAuthority, 'NONE');
});

test('corpus builder rejects any body evidence that already claims trust or authority', () => {
  const imported = normalizePublicSkillBody(base);
  imported.bodyEvidence.trustState = 'APPROVED';
  imported.bodyEvidence.promotionAuthority = 'AUTO';
  const corpus = buildMeasuredSkillBodyCorpus({ bodyImports: [imported] });
  assert.equal(corpus.ok, false);
  assert.ok(corpus.reasonCodes.includes('untrusted-zero-authority-body-evidence-required'));
});

test('refetch verification catches changed bytes even at the same logical skill path', () => {
  const imported = normalizePublicSkillBody(base);
  const verified = verifyRefetchedSkillBody({ bodyEvidence: imported.bodyEvidence, content: base.content, gitBlobSha: base.gitBlobSha });
  assert.equal(verified.ok, true);

  const changed = verifyRefetchedSkillBody({ bodyEvidence: imported.bodyEvidence, content: `${base.content}\nchanged`, gitBlobSha: base.gitBlobSha });
  assert.equal(changed.ok, false);
  assert.ok(changed.reasonCodes.includes('skill-body-sha256-mismatch'));
});

test('refetch verification binds both content hash and Git blob identity', () => {
  const imported = normalizePublicSkillBody(base);
  const wrongBlob = verifyRefetchedSkillBody({ bodyEvidence: imported.bodyEvidence, content: base.content, gitBlobSha: 'a'.repeat(40) });
  assert.equal(wrongBlob.ok, false);
  assert.ok(wrongBlob.reasonCodes.includes('git-blob-sha-mismatch'));
});
