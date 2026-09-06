import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildUberBondRepositoryDeepAtlas } from '../src/uberbond-repository-deep-atlas.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-deep-atlas-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'dep.mjs'), `export const dependency = true;\n`);
  fs.writeFileSync(path.join(root, 'src', 'api.mjs'), `import { dependency } from './dep.mjs';\nexport async function run() {}\nconst local = () => true;\nconst key = process.env.TEST_KEY;\napp.get('/health', () => {});\nif (process.argv.includes('--deep-map')) console.log(dependency);\n`);
  fs.writeFileSync(path.join(root, 'tests', 'api.test.mjs'), `test('health route works', () => {});\n`);
  fs.writeFileSync(path.join(root, '.github', 'workflows', 'brain.yml'), `name: Brain\non:\n  schedule:\n    - cron: '17 * * * *'\njobs:\n  map:\n    steps:\n      - name: Build ultimate graph\n        uses: actions/checkout@v4\n`);
  fs.writeFileSync(path.join(root, 'docs', 'BRAIN.md'), `# UberBond Brain\n## Memory\n- [x] Graph indexed\n`);
  fs.writeFileSync(path.join(root, 'config', 'brain.json'), JSON.stringify({ graph: { enabled: true, layers: ['files', 'features'] } }));
  const artifacts = [
    ['src/api.mjs', 'SOURCE_MODULE'],
    ['src/dep.mjs', 'SOURCE_MODULE'],
    ['tests/api.test.mjs', 'TEST'],
    ['.github/workflows/brain.yml', 'WORKFLOW'],
    ['docs/BRAIN.md', 'CANON_OR_MEMORY'],
    ['config/brain.json', 'CONFIG']
  ].map(([relativePath, kind]) => ({
    id: `artifact:${relativePath}`,
    path: relativePath,
    kind,
    primaryFamily: 'general-runtime',
    families: ['general-runtime'],
    organs: ['world-brain'],
    classificationConfidence: 'FIXTURE'
  }));
  return { root, featureGenome: { ok: true, genomeDigest: 'a'.repeat(64), artifactNodes: artifacts } };
}

test('deep atlas covers every artifact, every text body and structural declarations', () => {
  const { root, featureGenome } = fixture();
  const atlas = buildUberBondRepositoryDeepAtlas({ root, featureGenome });
  assert.equal(atlas.ok, true, JSON.stringify(atlas));
  assert.equal(atlas.repositoryArtifactCount, featureGenome.artifactNodes.length);
  assert.equal(atlas.coverageCount, featureGenome.artifactNodes.length);
  assert.equal(atlas.parsedTextFileCount, featureGenome.artifactNodes.length);
  assert.deepEqual(atlas.truncatedFiles, []);
  assert.deepEqual(atlas.textCoverageWithoutChunks, []);
  assert.ok(atlas.contentChunkCount >= featureGenome.artifactNodes.length);
  assert.ok(atlas.coverage.every(item => item.status !== 'PARSED_TEXT' || (item.contentChunkCount > 0 && /^[a-f0-9]{64}$/.test(item.textDigest))));
  const classes = new Set(atlas.details.map(item => item.class));
  for (const expected of [
    'CONTENT_CHUNK', 'CODE_SYMBOL', 'DECLARED_BINDING', 'IMPORT_DECLARATION', 'CLI_FLAG',
    'TEST_CASE', 'HTTP_ROUTE', 'ENVIRONMENT_BINDING', 'WORKFLOW_STEP', 'WORKFLOW_ACTION',
    'WORKFLOW_TRIGGER', 'YAML_KEY', 'DOCUMENT_SECTION', 'DOCUMENT_ASSERTION', 'CONFIG_KEY'
  ]) {
    assert.ok(classes.has(expected), `missing ${expected}`);
  }
  assert.ok(atlas.details.every(item => item.sourcePath && Array.isArray(item.organs)));
  const apiChunk = atlas.details.find(item => item.class === 'CONTENT_CHUNK' && item.sourcePath === 'src/api.mjs');
  assert.ok(apiChunk);
  assert.match(apiChunk.contentDigest, /^[a-f0-9]{64}$/);
  assert.equal(apiChunk.startOffset, 0);
  fs.rmSync(root, { recursive: true, force: true });
});

test('deep atlas keeps coverage while refusing to replicate secret-shaped source text', () => {
  const { root, featureGenome } = fixture();
  const secretFixture = ['sk', 'proj', 'THIS_IS_A_FIXTURE_KEY_1234567890'].join('-');
  fs.appendFileSync(path.join(root, 'src', 'api.mjs'), `\nconst privateFixture = '${secretFixture}';\n`);
  const atlas = buildUberBondRepositoryDeepAtlas({ root, featureGenome });
  assert.equal(atlas.ok, true, JSON.stringify(atlas));
  const serialized = JSON.stringify(atlas);
  assert.equal(serialized.includes(secretFixture), false, 'raw credential-shaped text must not survive into durable atlas strings');
  assert.match(serialized, /\[REDACTED\]/, 'the persisted preview should show that redaction occurred rather than silently dropping coverage');
  const apiCoverage = atlas.coverage.find(item => item.path === 'src/api.mjs');
  assert.match(apiCoverage.textDigest, /^[a-f0-9]{64}$/);
  assert.ok(apiCoverage.contentChunkCount > 0, 'redaction must preserve hashed content coverage');
  fs.rmSync(root, { recursive: true, force: true });
});
