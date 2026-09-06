import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/ultimate-graph.mjs';

function graphFixture() {
  return {
    ok: true,
    status: 'ULTIMATE_GRAPH_COMPLETE',
    graphDigest: 'a'.repeat(64),
    repositoryArtifactCount: 2,
    featureAtomCount: 2,
    deepFeatureCount: 2,
    nodeCount: 6,
    edgeCount: 5,
    classCounts: { COGNITIVE_ORGAN: 2, REPOSITORY_ARTIFACT: 2, DEEP_CODE_SYMBOL: 2 },
    edgeTypeCounts: { ORGAN_RELATION: 1, MEMBER_OF_ORGAN: 2, DETAIL_DECLARED_IN: 2 },
    orphanNodes: [],
    missingArtifacts: [],
    missingFeatureAtoms: [],
    missingDeepFeatures: [],
    memoryContract: { canonicalPointer: 'artifacts/cognitive/uberbond-ultimate-graph-latest.json' },
    truthBoundary: 'STRUCTURAL_ONLY',
    artifactCards: [
      { path: 'src/a.mjs', kind: 'SOURCE_MODULE', primaryFamily: 'brain', organs: ['world-brain'], deepFeatureCount: 1 },
      { path: 'src/b.mjs', kind: 'SOURCE_MODULE', primaryFamily: 'genesis', organs: ['genesis'], deepFeatureCount: 1 }
    ],
    nodes: [
      { id: 'organ:world-brain', class: 'COGNITIVE_ORGAN', organId: 'world-brain', label: 'World Brain', truthClass: 'VERIFIED_CURRENT' },
      { id: 'organ:genesis', class: 'COGNITIVE_ORGAN', organId: 'genesis', label: 'GENESIS', truthClass: 'VERIFIED_CURRENT' },
      { id: 'artifact:src/a.mjs', class: 'REPOSITORY_ARTIFACT', path: 'src/a.mjs', artifactKind: 'SOURCE_MODULE', families: ['brain'] },
      { id: 'artifact:src/b.mjs', class: 'REPOSITORY_ARTIFACT', path: 'src/b.mjs', artifactKind: 'SOURCE_MODULE', families: ['genesis'] },
      { id: 'detail:a', class: 'DEEP_CODE_SYMBOL', name: 'function:think', sourcePath: 'src/a.mjs', organs: ['world-brain'] },
      { id: 'detail:b', class: 'DEEP_CODE_SYMBOL', name: 'function:mutate', sourcePath: 'src/b.mjs', organs: ['genesis'] }
    ],
    edges: [
      { id: 'e1', from: 'organ:world-brain', to: 'organ:genesis', type: 'ORGAN_RELATION' },
      { id: 'e2', from: 'artifact:src/a.mjs', to: 'organ:world-brain', type: 'MEMBER_OF_ORGAN' },
      { id: 'e3', from: 'artifact:src/b.mjs', to: 'organ:genesis', type: 'MEMBER_OF_ORGAN' },
      { id: 'e4', from: 'detail:a', to: 'artifact:src/a.mjs', type: 'DETAIL_DECLARED_IN' },
      { id: 'e5', from: 'detail:b', to: 'artifact:src/b.mjs', type: 'DETAIL_DECLARED_IN' }
    ]
  };
}

function response() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}

function request(url = '/api/ultimate-graph', authorization = 'Bearer owner') {
  return { method: 'GET', url, headers: { authorization } };
}

function handler() {
  return createHandler({ env: { ADMIN_TOKEN: 'owner' }, loadGraph: async () => graphFixture(), root: process.cwd() });
}

test('Ultimate Graph API rejects missing or wrong owner bearer', async () => {
  const run = handler();
  const res = response();
  await run(request('/api/ultimate-graph', ''), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload.reasonCodes, ['unauthorized']);
});

test('overview projection compresses without claiming deletion', async () => {
  const run = handler();
  const res = response();
  await run(request('/api/ultimate-graph?view=overview&lens=brain&limit=20'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.graphDigest, 'a'.repeat(64));
  assert.equal(res.payload.projection.canonicalNodeCount, 6);
  assert.equal(res.payload.projection.amputation, false);
  assert.match(res.payload.projection.law, /HIDDEN_IN_PROJECTION_NEVER_MEANS_DELETED/);
  assert.ok(res.payload.nodes.some(node => node.id === 'organ:world-brain'));
});

test('search projection returns matching repository detail while retaining canonical counts', async () => {
  const run = handler();
  const res = response();
  await run(request('/api/ultimate-graph?view=overview&lens=all&q=mutate&limit=20'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.nodes.length, 1);
  assert.equal(res.payload.nodes[0].id, 'detail:b');
  assert.equal(res.payload.projection.canonicalNodeCount, 6);
  assert.equal(res.payload.projection.hiddenNodeCount, 5);
});

test('neighborhood returns bounded connected context and never broadens authority', async () => {
  const run = handler();
  const res = response();
  await run(request('/api/ultimate-graph?view=neighborhood&id=detail:a&depth=2&limit=20'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.businessEffectAuthority, 'NONE');
  assert.equal(res.payload.externalEffectAuthority, 'NONE');
  assert.ok(res.payload.nodes.some(node => node.id === 'detail:a'));
  assert.ok(res.payload.nodes.some(node => node.id === 'organ:world-brain'));
  assert.equal(res.payload.projection.amputation, false);
});

test('summary exposes anti-amputation coverage, not fake runtime proof', async () => {
  const run = handler();
  const res = response();
  await run(request('/api/ultimate-graph?view=summary'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.coverage.canonicalNodeCount, 6);
  assert.equal(res.payload.coverage.orphanNodeCount, 0);
  assert.equal(res.payload.organs.length, 2);
  assert.equal(res.payload.truthBoundary, 'STRUCTURAL_ONLY');
});
