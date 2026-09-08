import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitPorcelainPaths } from '../scripts/current-truth-regeneration.mjs';

test('porcelain parser preserves a first-line leading status column', () => {
  const paths = parseGitPorcelainPaths(
    ' M artifacts/sovereign/implementation-coverage-matrix.json\n' +
    ' M artifacts/system-readiness.json\n' +
    ' M docs/CURRENT_SYSTEM_STATE.md\n'
  );
  assert.deepEqual(paths, [
    'artifacts/sovereign/implementation-coverage-matrix.json',
    'artifacts/system-readiness.json',
    'docs/CURRENT_SYSTEM_STATE.md'
  ]);
});

test('porcelain parser returns the destination of a rename', () => {
  const paths = parseGitPorcelainPaths('R  docs/old.md -> docs/CURRENT_SYSTEM_STATE.md\n');
  assert.deepEqual(paths, ['docs/CURRENT_SYSTEM_STATE.md']);
});
