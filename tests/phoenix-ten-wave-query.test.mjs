import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(root, 'scripts/phoenix-ten-wave-query.mjs');
const call = (...args) => JSON.parse(execFileSync(process.execPath, [script, ...args], {
  cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024
}));

test('PHOENIX source-pinned search returns bounded original pointers with zero authority', () => {
  const result = call('model verification tools', '3');
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PHOENIX_SOURCE_LINKED_RESEARCH_ONLY');
  assert.equal(result.universe, 1560);
  assert.equal(result.missing_wave4, 0);
  assert.ok(result.count > 0 && result.count <= 3);
  assert.equal(result.promotion_authority, 'NONE');
  assert.equal(result.external_effects, 'NONE');
  for (const match of result.matches) {
    assert.match(match.id, /^phoenix-(capability|wave\d+)-\d{4}$/);
    assert.match(match.source_pointer, /^\/(capabilities|candidates)\/\d+$/);
    assert.equal(match.promotion_authority, 'NONE');
    assert.equal(match.truth_class, 'PROPOSED_RESEARCH_ONLY');
  }
});
test('PHOENIX query is deterministic for an unchanged pinned corpus', () => {
  assert.deepEqual(call('durable recovery', '2'), call('durable recovery', '2'));
});
test('PHOENIX query rejects missing input and bound violations', () => {
  for (const args of [[], [''], ['abc', '0'], ['abc', '21'], ['abc', '2.5']]) {
    const proc = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(proc.status, 0);
    const output = JSON.parse(proc.stderr.trim());
    assert.equal(output.status, 'PHOENIX_RESEARCH_QUERY_REFUSED');
  }
});
