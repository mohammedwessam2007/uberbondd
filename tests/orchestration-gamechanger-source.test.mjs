import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/gamechanger-mesh/sources.json'), 'utf8'));

test('Gamechanger continuously searches for orchestration skills beyond the current Fable baseline', () => {
  const source = config.sources.find(item => item.id === 'search-orchestration-skills-frontier');
  assert.ok(source, 'dedicated orchestration frontier search lane must exist');
  assert.equal(source.mode, 'SEARCH_LANE');
  assert.equal(source.cadenceMinutes, 120);
  assert.equal(source.sourceTier, 'OPEN_SOURCE_ORIGINAL');
  assert.ok(source.query.includes('Claude Code'));
  assert.ok(source.query.includes('Codex'));
  assert.ok(source.query.includes('Gemini'));
  assert.ok(source.query.includes('planner worker DAG'));
  assert.ok(source.query.includes('cross-model review'));
  assert.deepEqual(new Set(source.domains), new Set(['AGENT_RUNTIME', 'AUTOMATION', 'DEVTOOLS', 'OPEN_SOURCE']));
});

test('orchestration discovery does not replace broader runtime and breakout-repository sensing', () => {
  const ids = new Set(config.sources.map(item => item.id));
  assert.ok(ids.has('search-agentic-runtime-breakthroughs'));
  assert.ok(ids.has('search-github-breakout-projects'));
  assert.ok(ids.has('github-trending'));
});
