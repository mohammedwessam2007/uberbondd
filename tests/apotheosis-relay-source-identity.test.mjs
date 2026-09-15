import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/agent-relay-worker.yml', import.meta.url), 'utf8');

test('APOTHEOSIS relay config forces git abbreviations to the full 40-character source identity', () => {
  assert.match(workflow, /git config core\.abbrev 40/);
  assert.match(workflow, /node scripts\/github-relay-worker\.mjs/);
});
