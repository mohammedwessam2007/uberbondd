import test from 'node:test';
import assert from 'node:assert/strict';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('terminal gate narrowly approves and prepares the pinned embedded Postgres fixture at both required boundaries', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const terminal = readFileSync('scripts/vercel-command-center-build.mjs', 'utf8');

  assert.deepEqual(packageJson.allowScripts, {
    '@embedded-postgres/linux-x64@18.4.0-beta.17': true
  }, 'project install-script authority must be exactly one reviewed, version-pinned platform fixture');
  assert.equal(existsSync('.npmrc'), false,
    'do not carry an ambiguous project .npmrc allow-scripts escape hatch alongside canonical allowScripts policy');
  assert.doesNotMatch(JSON.stringify(packageJson), /dangerously-allow-all-scripts/i);

  const rebuild = terminal.indexOf("['npm', ['rebuild', '@embedded-postgres/linux-x64']]");
  const executablePreparation = terminal.indexOf("['node', ['scripts/prepare-embedded-postgres-fixture.mjs']]");
  const firstPreparation = terminal.indexOf('...fixturePreparation');
  const secondPreparation = terminal.indexOf('...fixturePreparation', firstPreparation + 1);
  const deterministic = terminal.indexOf("['npm', ['run', 'test:deterministic']]");
  const mutationWar = terminal.indexOf("['npm', ['run', 'test:mutation-war']]");

  assert.ok(rebuild >= 0, 'terminal gate must explicitly hydrate the reviewed Linux-x64 fixture');
  assert.ok(executablePreparation >= 0, 'terminal gate must explicitly prove the reviewed fixture executables are runnable');
  assert.ok(firstPreparation >= 0 && firstPreparation < deterministic,
    'fixture preparation must fail fast before the deterministic siege');
  assert.ok(secondPreparation > deterministic && secondPreparation < mutationWar,
    'fixture preparation must be reasserted after deterministic and immediately before Mutation War');
  assert.ok(mutationWar > deterministic, 'Mutation War must remain after the complete deterministic suite');
  assert.match(terminal, /process\.platform === 'linux' && process\.arch === 'x64'/);
});

test('Linux fixture preparation leaves the pinned PostgreSQL executables runnable', {
  skip: process.platform !== 'linux' || process.arch !== 'x64'
}, () => {
  const run = spawnSync(process.execPath, ['scripts/prepare-embedded-postgres-fixture.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, `fixture preparation failed:\n${run.stderr || run.stdout}`);
  assert.match(run.stdout, /embedded-postgres-fixture — READY 18\.4\.0-beta\.17/);

  const binDir = path.resolve('node_modules/@embedded-postgres/linux-x64/native/bin');
  for (const executable of ['initdb', 'pg_ctl', 'postgres']) {
    assert.doesNotThrow(() => accessSync(path.join(binDir, executable), constants.X_OK),
      `${executable} must be executable after fixture preparation`);
  }
});
