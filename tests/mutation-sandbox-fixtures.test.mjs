import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTATION_SANDBOX_FIXTURES } from '../scripts/mutation-war.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('mutation fixture list contains only small, real, source-controlled paths', () => {
  assert.deepEqual([...MUTATION_SANDBOX_FIXTURES].sort(), [...new Set(MUTATION_SANDBOX_FIXTURES)].sort());
  for (const name of MUTATION_SANDBOX_FIXTURES) {
    assert.ok(!name.startsWith('/') && !name.includes('..') && !name.includes('node_modules'));
    const source = resolve(repo, name);
    assert.ok(source.startsWith(repo + sep));
    assert.equal(lstatSync(source).isSymbolicLink(), false, `${name} must not be a symlink`);
    assert.ok(statSync(source).isDirectory() || statSync(source).isFile());
  }
});

test('copying fixtures into an isolated sandbox does not link them to the operator tree', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'ub-mut-fixtures-test-'));
  try {
    for (const name of MUTATION_SANDBOX_FIXTURES) {
      const destination = resolve(sandbox, name);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(repo, name), destination, { recursive: true });
      assert.ok(realpathSync(destination).startsWith(sandbox + sep));
    }
    const readiness = join(sandbox, 'artifacts/system-readiness.json');
    const j = JSON.parse(readFileSync(readiness, 'utf8'));
    assert.ok(j && typeof j === 'object');
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});
