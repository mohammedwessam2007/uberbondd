import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static contract, not a native Docker build or proof of runtime compatibility.
const patterns = new Set(readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8')
  .split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')));

test('historical forensics and recovery indexes remain in Git but outside image context', () => {
  for (const p of [
    'artifacts/recovery/', 'artifacts/recovery/**',
    'docs/forensics/', 'docs/forensics/**',
    'docs/UBERBOND_SOL_CLAUDE_CODE_5MB_EXTERNAL_EXECUTION_PACK.md',
    'artifacts/backup/', 'artifacts/backup/**'
  ]) assert.ok(patterns.has(p), `missing exclusion: ${p}`);
});

test('runtime source, GENESIS and founder corpus are not blanket-excluded', () => {
  for (const p of [
    'src/', 'src/**', 'docs/', 'docs/**', 'artifacts/', 'artifacts/**',
    'artifacts/research/', 'artifacts/research/**',
    'data/', 'data/**', 'data/genesis/', 'data/genesis/**',
    'server.mjs', 'worker.mjs'
  ]) assert.equal(patterns.has(p), false, `overbroad exclusion: ${p}`);
});

test('credentials and local data remain excluded', () => {
  for (const p of ['**/.env', '**/.env.*', '**/.ssh', '**/.ssh/**', 'data/db.json'])
    assert.ok(patterns.has(p), `missing credential exclusion: ${p}`);
});
