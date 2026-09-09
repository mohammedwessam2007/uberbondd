import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/semantic-requirement-tribunal.mjs', import.meta.url), 'utf8');
const statefulLine = script.split(/\r?\n/).find(line => line.startsWith('const STATEFUL='));

test('semantic recovery classifier ignores evidence words that do not prove durable state', () => {
  assert.ok(statefulLine, 'STATEFUL classifier missing');
  assert.doesNotMatch(statefulLine, /(?:\||\/)state\\b(?:\||\/)/);
  assert.doesNotMatch(statefulLine, /(?:\||\/)receipt(?:\||\/)/);
});

test('semantic recovery classifier still recognizes concrete durable or long-running surfaces', () => {
  for (const marker of ['persist', 'queue', 'database', 'postgres', 'writeFile', 'scheduler', 'worker', 'runtime', 'checkpoint', 'ledger']) {
    assert.match(statefulLine, new RegExp(marker), `${marker} recovery surface must remain classified`);
  }
});
