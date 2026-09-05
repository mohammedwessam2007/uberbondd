import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  sanitizeCommandCenterSnapshot,
  buildLastGoodCache,
  classifyCachedSnapshot,
  capSynapticGraph,
  COMMAND_CENTER_GRAPH_LIMITS
} from '../src/command-center-client-policy.mjs';
import {
  evaluateUiCandidate,
  assertReviewOnlyPromotion,
  COMMAND_CENTER_UI_PROMOTION_AUTHORITY
} from '../src/command-center-ui-evolution.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('last-good cache recursively strips credential-like fields', () => {
  const poisoned = {
    generatedAt: '2026-09-06T00:00:00.000Z',
    token: 'never-store-me',
    nested: { authorization: 'Bearer secret', ok: true, cookie: 'x', apiKey: 'abc' },
    rows: [{ password: 'bad', value: 7 }, { credentialHint: 'bad', label: 'safe' }]
  };
  const cache = buildLastGoodCache(poisoned, { storedAt: Date.parse('2026-09-06T00:00:01.000Z') });
  const serialized = JSON.stringify(cache);
  assert.equal(serialized.includes('never-store-me'), false);
  assert.equal(serialized.includes('Bearer secret'), false);
  assert.equal(serialized.includes('"password"'), false);
  assert.equal(serialized.includes('"apiKey"'), false);
  assert.equal(cache.payload.nested.ok, true);
  assert.equal(cache.payload.rows[0].value, 7);
});

test('stale last-good cache can never classify as live runtime', () => {
  const cache = buildLastGoodCache({ generatedAt: '2026-09-01T00:00:00.000Z' }, { storedAt: Date.parse('2026-09-01T00:00:00.000Z') });
  const result = classifyCachedSnapshot(cache, { now: Date.parse('2026-09-02T00:00:00.000Z'), maxAgeMs: 60_000 });
  assert.equal(result.state, 'CACHED_STALE');
});

test('oversized and poisoned synaptic graph is bounded and orphan edges disappear', () => {
  const nodes = Array.from({ length: 900 }, (_, i) => ({ id: `n${i}` }));
  const edges = Array.from({ length: 2500 }, (_, i) => ({ from: `n${i % 900}`, to: `n${(i + 1) % 900}`, type: 'link' }));
  edges.unshift({ from: 'missing', to: 'n1', type: 'poison' });
  const graph = capSynapticGraph({ nodes, edges, nodeCount: 900, edgeCount: 2501 });
  assert.equal(graph.nodes.length, COMMAND_CENTER_GRAPH_LIMITS.nodes);
  assert.ok(graph.edges.length <= COMMAND_CENTER_GRAPH_LIMITS.edges);
  assert.equal(graph.edges.some(edge => edge.from === 'missing'), false);
  assert.equal(graph.truncated, true);
});

test('UI evolution hard-rejects truth integrity regression regardless of usability gain', () => {
  const receipt = evaluateUiCandidate({
    candidateId: 'pretty-but-less-truthful',
    baseline: { usability: .78, performance: .80, accessibility: .92, truthIntegrity: 1 },
    candidate: { usability: .99, performance: .99, accessibility: .99, truthIntegrity: .99 }
  });
  assert.equal(receipt.decision, 'REJECTED');
  assert.ok(receipt.reasonCodes.includes('truth-integrity-regression'));
  assert.equal(assertReviewOnlyPromotion(receipt), false);
});

test('eligible UI candidate is review-only and carries rollback evidence', () => {
  const receipt = evaluateUiCandidate({
    candidateId: 'touch-density-v2',
    baseline: { usability: .74, performance: .76, accessibility: .90, truthIntegrity: 1 },
    candidate: { usability: .82, performance: .78, accessibility: .93, truthIntegrity: 1 },
    evidenceRefs: ['playwright:ipad-pro-11', 'axe:command-center']
  });
  assert.equal(receipt.decision, 'ELIGIBLE_FOR_REVIEW_PR');
  assert.equal(receipt.promotionAuthority, COMMAND_CENTER_UI_PROMOTION_AUTHORITY);
  assert.equal(receipt.rollback.required, true);
  assert.equal(receipt.rollback.targetFingerprint, receipt.baselineFingerprint);
  assert.equal(assertReviewOnlyPromotion(receipt), true);
});

test('public command center keeps credential memory-only and renders remote text without artifact innerHTML', async () => {
  const js = await read('public/command-center.js');
  assert.match(js, /let credential=''/);
  assert.doesNotMatch(js, /localStorage[^\n]*(token|credential|authorization)/i);
  assert.doesNotMatch(js, /sessionStorage[^\n]*(token|credential|authorization)/i);
  assert.doesNotMatch(js, /innerHTML\s*=/);
  assert.match(js, /textContent=/);
  assert.match(js, /credential='';/);
});

test('service worker refuses API and Authorization caching', async () => {
  const sw = await read('public/command-center-sw.js');
  assert.match(sw, /request\.headers\.has\('authorization'\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /if\(hasAuthorization\|\|isApi\)return/);
});

test('iPad shell carries touch viewport, standalone PWA, safe-area and responsive contracts', async () => {
  const [html, css, manifest] = await Promise.all([read('public/command-center.html'), read('public/command-center.css'), read('public/command-center.webmanifest')]);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /touch-action:pan-x pan-y/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.equal(JSON.parse(manifest).display, 'standalone');
});
