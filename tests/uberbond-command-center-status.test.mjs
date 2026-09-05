import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildUberBondCommandCenterStatus, UBERBOND_COMMAND_CENTER_RECEIPTS } from '../src/uberbond-command-center-status.mjs';
import { createHandler } from '../api/command-center.mjs';

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uberbond-command-center-'));
  await mkdir(path.join(root, 'artifacts', 'cognitive'), { recursive: true });
  await mkdir(path.join(root, 'config'), { recursive: true });
  await writeFile(path.join(root, 'config', 'frontier-model-candidates.json'), JSON.stringify({ candidates: [
    { id: 'astra', label: 'Astra', provider: 'example', modelId: 'astra', promotionState: 'CANDIDATE' },
    { id: 'fable', label: 'Fable', provider: 'example', modelId: 'fable', promotionState: 'CANDIDATE' }
  ] }));
  await writeFile(path.join(root, 'artifacts', 'perpetual-frontier-implementation-ledger.json'), JSON.stringify({ ideas: [
    { id: 'a', maturity: 'SOURCE_AND_TEST_PRESENT', implementationStatus: 'IMPLEMENTED_PRIMITIVE' },
    { id: 'b', maturity: 'OBSERVED_INTERNAL_RUNTIME_RECEIPT', implementationStatus: 'PARTIAL_PRIMITIVE' }
  ] }));
  return root;
}
async function writeReceipt(root, id, payload) {
  const spec = UBERBOND_COMMAND_CENTER_RECEIPTS.find(item => item.id === id);
  assert.ok(spec, `receipt spec ${id} exists`);
  const file = path.join(root, spec.relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(payload));
}

function fakeResponse() {
  return {
    statusCode: null,
    payload: null,
    headers: null,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(body) { this.payload = body ? JSON.parse(body) : null; }
  };
}

test('command center never invents missing receipt values', async t => {
  const root = await fixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const status = await buildUberBondCommandCenterStatus({ root, now: new Date('2026-09-06T12:00:00Z') });
  assert.equal(status.cognitive.integrity.ok, true);
  assert.equal(status.cognitive.graph.nodeCount, 29);
  assert.equal(status.observability.observedReceiptCount, 0);
  assert.equal(status.observability.unavailableReceiptCount, UBERBOND_COMMAND_CENTER_RECEIPTS.length);
  assert.equal(status.truthState, 'PARTIAL_OBSERVABILITY');
  assert.equal(status.receipts.featureGenome.summary, null);
  assert.equal(status.receipts.synapticMap.state, 'UNAVAILABLE');
  assert.equal(status.frontierModelRegistry.candidateCount, 2);
  assert.equal(status.genesisImplementationLedger.ideaCount, 2);
});

test('available receipts expose only observed scalar summaries and preserve unknown freshness', async t => {
  const root = await fixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeReceipt(root, 'featureGenome', {
    ok: true,
    status: 'FEATURE_GENOME_READY',
    genomeDigest: 'abc',
    repositoryArtifactCount: 901,
    genesisIdeaCount: 275,
    businessEffectAuthority: 'NONE'
  });
  const status = await buildUberBondCommandCenterStatus({ root, now: new Date('2026-09-06T12:00:00Z') });
  assert.equal(status.receipts.featureGenome.state, 'AVAILABLE');
  assert.equal(status.receipts.featureGenome.freshness, 'UNVERIFIED');
  assert.equal(status.receipts.featureGenome.summary.repositoryArtifactCount, 901);
  assert.equal(status.receipts.featureGenome.summary.genesisIdeaCount, 275);
  assert.equal(status.receipts.featureGenome.summary.businessEffectAuthority, 'NONE');
});

test('dated receipts become stale rather than being silently shown as current', async t => {
  const root = await fixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeReceipt(root, 'cognitiveCycle', {
    ok: true,
    status: 'COGNITIVE_CYCLE_READY',
    generatedAt: '2026-09-01T00:00:00Z',
    events: [{ id: 'one' }]
  });
  const status = await buildUberBondCommandCenterStatus({ root, now: new Date('2026-09-06T12:00:00Z') });
  assert.equal(status.receipts.cognitiveCycle.freshness, 'STALE');
  assert.ok(status.reasonCodes.includes('stale:cognitiveCycle'));
  assert.equal(status.truthState, 'PARTIAL_OBSERVABILITY');
});

test('invalid JSON degrades observability instead of substituting defaults', async t => {
  const root = await fixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const spec = UBERBOND_COMMAND_CENTER_RECEIPTS.find(item => item.id === 'synapticMap');
  const file = path.join(root, spec.relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '{broken');
  const status = await buildUberBondCommandCenterStatus({ root, now: new Date('2026-09-06T12:00:00Z') });
  assert.equal(status.receipts.synapticMap.state, 'INVALID');
  assert.equal(status.truthState, 'DEGRADED');
  assert.equal(status.synapticPreview, null);
});

test('synaptic preview is bounded and reports truncation', async t => {
  const root = await fixtureRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const nodes = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, kind: 'FEATURE' }));
  const edges = Array.from({ length: 700 }, (_, i) => ({ from: `n${i % 300}`, to: `n${(i + 1) % 300}`, type: 'DECLARED_IN' }));
  await writeReceipt(root, 'synapticMap', { ok: true, status: 'SYNAPTIC_MAP_READY', nodeCount: 300, edgeCount: 700, nodes, edges });
  const status = await buildUberBondCommandCenterStatus({ root });
  assert.equal(status.synapticPreview.nodes.length, 260);
  assert.equal(status.synapticPreview.edges.length, 620);
  assert.equal(status.synapticPreview.nodeCount, 300);
  assert.equal(status.synapticPreview.edgeCount, 700);
  assert.equal(status.synapticPreview.truncated, true);
});

test('command center API requires the existing ADMIN_TOKEN bearer and leaks no secret', async () => {
  let builds = 0;
  const handler = createHandler({
    env: { ADMIN_TOKEN: 'owner-secret', VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) },
    root: '/irrelevant',
    now: () => new Date('2026-09-06T12:00:00Z'),
    buildUberBondCommandCenterStatus: async input => { builds += 1; return { ok: true, runtime: input.runtime }; }
  });
  const refused = fakeResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, refused);
  assert.equal(refused.statusCode, 401);
  assert.equal(builds, 0);

  const allowed = fakeResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer owner-secret' } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(builds, 1);
  assert.equal(allowed.payload.runtime.platform, 'VERCEL');
  assert.equal(JSON.stringify(allowed.payload).includes('owner-secret'), false);
});

test('command center API fails closed when admin auth is not configured', async () => {
  const handler = createHandler({ env: {}, buildUberBondCommandCenterStatus: async () => ({ ok: true }) });
  const response = fakeResponse();
  await handler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.payload.reasonCodes, ['command-center-admin-auth-not-configured']);
});
