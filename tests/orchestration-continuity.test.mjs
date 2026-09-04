import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const bootstrap = JSON.parse(fs.readFileSync(path.join(root, 'UBERBOND_BOOTSTRAP.json'), 'utf8'));
const addendumPath = 'docs/UBERBOND_TOTAL_BRAIN_ORCHESTRATION_ADDENDUM.md';
const addendum = fs.readFileSync(path.join(root, addendumPath), 'utf8');

const requiredPointers = [
  addendumPath,
  'docs/ORCHESTRATION_CAPABILITY_CANON.md',
  'artifacts/orchestration-assimilation/2026-09-04-fable-n-plus-one.json',
  'src/orchestration-frontier.mjs',
  'scripts/orchestration-frontier-tick.mjs',
  '.claude/skills/uberbond-orchestrator/SKILL.md',
  '.codex/skills/uberbond-orchestrator/SKILL.md'
];

test('bootstrap makes the Fable N+1 orchestration lineage mandatory startup memory', () => {
  for (const pointer of requiredPointers) {
    assert.ok(bootstrap.canonPointers.includes(pointer), `missing startup pointer: ${pointer}`);
    assert.equal(fs.existsSync(path.join(root, pointer)), true, `startup pointer does not exist: ${pointer}`);
  }
  assert.ok(bootstrap.goals.some(goal => goal.includes('Fable N+1 orchestration lineage')));
  assert.ok(bootstrap.startupProtocol.some(step => step.includes('UBERBOND_TOTAL_BRAIN_ORCHESTRATION_ADDENDUM.md')));
});

test('orchestration Total Brain addendum preserves donors and continuous challenger search', () => {
  for (const required of [
    'codejunkie99/fable-orchestrator',
    'dsifry/metaswarm',
    'obra/superpowers',
    'Fable N+1 law',
    'No-evaporation law',
    'Silence is not deletion.'
  ]) {
    assert.ok(addendum.includes(required), `missing orchestration memory invariant: ${required}`);
  }
});
