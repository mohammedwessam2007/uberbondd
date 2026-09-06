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
  fs.writeFileSync(path.join(root, 'src', 'api.mjs'), `export async function run() {}\nconst local = () => true;\napp.get('/health', () => {});\nconst key = process.env.TEST_KEY;\n`);
  fs.writeFileSync(path.join(root, 'tests', 'api.test.mjs'), `test('health route works', () => {});\n`);
  fs.writeFileSync(path.join(root, '.github', 'workflows', 'brain.yml'), `name: Brain\non:\n  schedule:\n    - cron: '17 * * * *'\njobs:\n  map:\n    steps:\n      - name: Build ultimate graph\n        uses: actions/checkout@v4\n`);
  fs.writeFileSync(path.join(root, 'docs', 'BRAIN.md'), `# UberBond Brain\n## Memory\n- [x] Graph indexed\n`);
  fs.writeFileSync(path.join(root, 'config', 'brain.json'), JSON.stringify({ graph: { enabled: true, layers: ['files', 'features'] } }));
  const artifacts = [
    ['src/api.mjs', 'SOURCE_MODULE'],
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

test('deep atlas covers every artifact and extracts code, tests, workflows, docs and config', () => {
  const { root, featureGenome } = fixture();
  const atlas = buildUberBondRepositoryDeepAtlas({ root, featureGenome });
  assert.equal(atlas.ok, true, JSON.stringify(atlas));
  assert.equal(atlas.repositoryArtifactCount, featureGenome.artifactNodes.length);
  assert.equal(atlas.coverageCount, featureGenome.artifactNodes.length);
  assert.deepEqual(atlas.truncatedFiles, []);
  const classes = new Set(atlas.details.map(item => item.class));
  for (const expected of ['CODE_SYMBOL', 'TEST_CASE', 'HTTP_ROUTE', 'ENVIRONMENT_BINDING', 'WORKFLOW_STEP', 'WORKFLOW_ACTION', 'WORKFLOW_TRIGGER', 'DOCUMENT_SECTION', 'DOCUMENT_ASSERTION', 'CONFIG_KEY']) {
    assert.ok(classes.has(expected), `missing ${expected}`);
  }
  assert.ok(atlas.details.every(item => item.sourcePath && Array.isArray(item.organs)));
  fs.rmSync(root, { recursive: true, force: true });
});
