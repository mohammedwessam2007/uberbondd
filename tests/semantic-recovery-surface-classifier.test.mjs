import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  detectConcreteRecoverySurfaces,
  hasConcreteRecoverySurface
} from '../src/semantic-recovery-surface.mjs';

// The classifier used to live as a single `const STATEFUL=` line inside the
// tribunal script, and this test grepped that line. It now lives in its own
// module, so the assertions below exercise the behaviour the grep was standing
// in for. Behaviour is what the tribunal actually depends on, and unlike a
// source-text match it cannot silently stop protecting anything when the
// implementation is refactored again.
const script = readFileSync(new URL('../scripts/semantic-requirement-tribunal.mjs', import.meta.url), 'utf8');

test('semantic recovery classifier ignores evidence words that do not prove durable state', () => {
  // Evidence-plane vocabulary. A module that merely says "runtime" or
  // "receipt" owns no durable state and must not inherit a recovery
  // obligation from the word alone.
  for (const prose of [
    'const state = computeState(input);',
    'return { receipt, runtimeEvidenceRequirement: "exact source execution" };',
    'export const RUNTIME_TRUTH = "runtime evidence stays external";',
    '// persists nothing; the queue name is only a label in this comment',
    'const ledgerSummary = describeLedger(rows); // daemon-free',
    'function schedulerReport(){ return "worker checkpoint database"; }'
  ]) {
    assert.deepEqual(detectConcreteRecoverySurfaces(prose), [], `vocabulary must not classify: ${prose}`);
    assert.equal(hasConcreteRecoverySurface(prose), false);
  }
});

test('semantic recovery classifier still recognizes concrete durable or long-running surfaces', () => {
  for (const [label, source] of [
    ['filesystem write', 'await writeFile(path, body);'],
    ['filesystem append', 'appendFileSync(path, line);'],
    ['write stream', 'const out = createWriteStream(path);'],
    ['http server', 'const server = createServer(handler);'],
    ['listener bind', 'server.listen(PORT);'],
    ['interval loop', 'setInterval(tick, 1000);'],
    ['worker thread', 'const w = new Worker(url);'],
    ['process spawn', 'spawn("node", [script]);'],
    ['postgres pool', 'const pool = new Pool({ connectionString });'],
    ['sql insert', 'await client.query("INSERT INTO orders (id) VALUES ($1)", [id]);'],
    ['sql transaction', 'await client.query("BEGIN;");']
  ]) {
    assert.equal(hasConcreteRecoverySurface(source), true, `${label} recovery surface must remain classified`);
    assert.ok(detectConcreteRecoverySurfaces(source).length > 0, `${label} must report a surface id`);
  }
});

test('runtime evidence vocabulary cannot manufacture recovery obligations', () => {
  assert.match(script, /runtimeEvidenceRequirement:/, 'runtime evidence boundary must remain explicit');
  // The tribunal asks the classifier; it never re-derives durability from the
  // word "runtime" appearing in a module.
  assert.match(script, /hasConcreteRecoverySurface/, 'tribunal must delegate to the concrete-surface classifier');
  assert.equal(hasConcreteRecoverySurface('runtime runtime runtime'), false);
});
