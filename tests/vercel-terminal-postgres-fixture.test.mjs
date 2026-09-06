import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('terminal gate narrowly approves and prepares the pinned embedded Postgres fixture', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const terminal = readFileSync('scripts/vercel-command-center-build.mjs', 'utf8');

  assert.deepEqual(packageJson.allowScripts, {
    '@embedded-postgres/linux-x64@18.4.0-beta.17': true
  }, 'project install-script authority must be exactly one reviewed, version-pinned platform fixture');
  assert.equal(existsSync('.npmrc'), false,
    'do not carry an ambiguous project .npmrc allow-scripts escape hatch alongside canonical allowScripts policy');
  assert.doesNotMatch(JSON.stringify(packageJson), /dangerously-allow-all-scripts/i);

  const rebuild = terminal.indexOf("['npm', ['rebuild', '@embedded-postgres/linux-x64']]");
  const deterministic = terminal.indexOf("['npm', ['run', 'test:deterministic']]");
  const mutationWar = terminal.indexOf("['npm', ['run', 'test:mutation-war']]");

  assert.ok(rebuild >= 0, 'terminal gate must explicitly hydrate the reviewed Linux-x64 fixture');
  assert.ok(deterministic > rebuild, 'fixture preparation must fail fast before the deterministic siege');
  assert.ok(mutationWar > deterministic, 'Mutation War must remain after the complete deterministic suite');
  assert.match(terminal, /process\.platform === 'linux' && process\.arch === 'x64'/);
});
