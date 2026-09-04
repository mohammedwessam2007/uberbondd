import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENESIS_IMPLEMENTATION_EVIDENCE } from '../src/genesis-implementation-evidence-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const safeRelative = value => typeof value === 'string'
  && value.length > 0
  && !path.isAbsolute(value)
  && !value.split(/[\\/]+/).includes('..');

test('all 275 GENESIS evidence declarations point to real non-empty repository files', () => {
  const entries = Object.entries(GENESIS_IMPLEMENTATION_EVIDENCE);
  assert.equal(entries.length, 275, 'the evidence registry must cover exactly the canonical 275 ideas');

  const missing = [];
  const empty = [];
  const malformed = [];

  for (const [id, evidence] of entries) {
    assert.ok(Array.isArray(evidence.sources) && evidence.sources.length > 0, `${id}: at least one source path is required`);
    assert.ok(Array.isArray(evidence.tests) && evidence.tests.length > 0, `${id}: at least one focused/hostile test path is required`);

    for (const relative of [...evidence.sources, ...evidence.tests]) {
      if (!safeRelative(relative)) {
        malformed.push(`${id}:${relative}`);
        continue;
      }
      const absolute = path.join(root, relative);
      if (!fs.existsSync(absolute)) {
        missing.push(`${id}:${relative}`);
        continue;
      }
      const stat = fs.statSync(absolute);
      if (!stat.isFile() || stat.size === 0) empty.push(`${id}:${relative}`);
    }

    for (const relative of evidence.tests) {
      assert.match(relative, /^tests\/.+\.test\.mjs$/, `${id}: test evidence must be an executable repository test file`);
    }
  }

  assert.deepEqual(malformed, [], `malformed evidence paths:\n${malformed.join('\n')}`);
  assert.deepEqual(missing, [], `phantom evidence paths:\n${missing.join('\n')}`);
  assert.deepEqual(empty, [], `empty/non-file evidence paths:\n${empty.join('\n')}`);
});

test('no GENESIS idea can claim runtime observation from a missing receipt path', () => {
  const invalid = [];
  for (const [id, evidence] of Object.entries(GENESIS_IMPLEMENTATION_EVIDENCE)) {
    for (const relative of evidence.runtimeReceipts || []) {
      if (!safeRelative(relative)) invalid.push(`${id}:${relative}`);
    }
  }
  assert.deepEqual(invalid, []);
});
