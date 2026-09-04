// GENESIS runs as a chain: gamechanger -> evolve -> scientist -> ontology, each
// step reading what the last one wrote. Every step correctly refuses when its
// input is absent, which is the right behaviour and was reported the wrong way:
// a status and a path, with no indication of which earlier step had not run.
//
// On a host with no configured provider that is the normal state, so an
// operator meets these refusals first and has nothing to act on. The producing
// command is knowable, so it is named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;
const read = relative => readFileSync(join(repoRoot, relative), 'utf8');

// Each refusing step, and the step whose output it is waiting for.
const CHAIN = [
  { script: 'scripts/genesis-evolution-tick.mjs', status: 'GENESIS_EVOLUTION_GAMECHANGER_INPUT_REQUIRED', producedBy: 'npm run gamechanger:plan' },
  { script: 'scripts/genesis-scientist-tick.mjs', status: 'GENESIS_SCIENTIST_EVOLUTION_INPUT_REQUIRED', producedBy: 'npm run genesis:evolve' },
  { script: 'scripts/genesis-ontology-tick.mjs', status: 'ONTOGENESIS_INPUT_REQUIRED', producedBy: 'npm run genesis:scientist or npm run genesis:evolve' }
];

test('every GENESIS refusal names the step that produces what it is missing', () => {
  for (const link of CHAIN) {
    const source = read(link.script);
    assert.ok(source.includes(link.status), `${link.script} no longer emits ${link.status}`);
    assert.ok(source.includes(`producedBy: '${link.producedBy}'`) || source.includes(`producedBy:'${link.producedBy}'`),
      `${link.script} refuses with ${link.status} without naming what produces its input`);
    assert.match(source, /detail:\s*'[^']{40,}'/,
      `${link.script} must explain the refusal, not only label it`);
  }
});

test('every command a refusal points at is a script that exists', () => {
  // The failure mode of naming a next step is naming one that is wrong. A
  // refusal that sends an operator to a command that does not exist is worse
  // than one that says nothing, because it costs them the trip.
  for (const link of CHAIN) {
    for (const command of link.producedBy.split(' or ')) {
      const name = command.trim().replace(/^npm run /, '');
      assert.ok(scripts[name], `${link.script} points at \`${command}\`, which package.json does not define`);
    }
  }
});

test('the chain each refusal describes matches the order the scripts actually read in', () => {
  // Stated as a dependency edge rather than prose, so reordering the pipeline
  // without updating the guidance breaks a test instead of misleading a reader.
  const evolution = read('scripts/genesis-evolution-tick.mjs');
  assert.match(evolution, /gamechanger-mesh-latest\.json/,
    'the evolution tick should read the gamechanger artifact its refusal names');

  const scientist = read('scripts/genesis-scientist-tick.mjs');
  assert.match(scientist, /genesis-evolution-latest\.json/,
    'the scientist tick should read the evolution artifact its refusal names');

  const ontology = read('scripts/genesis-ontology-tick.mjs');
  assert.ok(/genesis-scientist-latest\.json/.test(ontology) || /genesis-evolution-latest\.json/.test(ontology),
    'the ontology tick should read one of the artifacts its refusal names');
});
