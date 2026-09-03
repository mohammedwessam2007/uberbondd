import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('repository-root Vercel builds must execute syntax and deterministic verification', () => {
  assert.equal(vercel.buildCommand, 'npm run check:syntax && npm run test:deterministic');
  assert.equal(pkg.scripts['vercel-build'], vercel.buildCommand);
  assert.equal(pkg.scripts['test:deterministic'], 'node scripts/run-tests.mjs deterministic');
});
