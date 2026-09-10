import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/semantic-requirement-tribunal.mjs', import.meta.url), 'utf8');
const statefulLine = script.split(/\r?\n/).find(line => line.startsWith('const STATEFUL='));

test('semantic recovery classifier ignores evidence words that do not prove durable state', () => {
  assert.ok(statefulLine, 'STATEFUL classifier missing');
  assert.doesNotMatch(statefulLine, /(?:\||\/)state\\b(?:\||\/)/);
  assert.doesNotMatch(statefulLine, /(?:\||\/)receipt(?:\||\/)/);
  assert.doesNotMatch(statefulLine, /(?:\||\/)runtime(?:\||\/)/);
});

test('semantic recovery classifier still recognizes concrete durable or long-running surfaces', () => {
  for (const marker of ['persist', 'queue', 'database', 'postgres', 'writeFile', 'scheduler', 'worker', 'checkpoint', 'ledger', 'createServer', 'server\\.listen', 'setInterval', 'daemon']) {
    assert.ok(statefulLine.includes(marker), `${marker} recovery surface must remain classified`);
  }
});

test('runtime evidence vocabulary cannot manufacture recovery obligations', () => {
  assert.match(script, /runtimeEvidenceRequirement:/, 'runtime evidence boundary must remain explicit');
  assert.doesNotMatch(statefulLine, /runtime/, 'bare runtime vocabulary is evidence-plane metadata, not proof of owned durable state');
});
