import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareEmbeddedPostgresFixture } from '../scripts/prepare-embedded-postgres-fixture.mjs';

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

test('Linux fixture preparation proves the pinned PostgreSQL executables can actually spawn', {
  skip: process.platform !== 'linux' || process.arch !== 'x64'
}, () => {
  const run = spawnSync(process.execPath, ['scripts/prepare-embedded-postgres-fixture.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, `fixture preparation failed:\n${run.stderr || run.stdout}`);
  assert.match(run.stdout, /embedded-postgres-fixture — READY 18\.4\.0-beta\.17 (?:PACKAGE_NATIVE|TMP_NATIVE_SYMLINK)/);

  const binDir = path.resolve('node_modules/@embedded-postgres/linux-x64/native/bin');
  for (const executable of ['initdb', 'pg_ctl', 'postgres']) {
    const file = path.join(binDir, executable);
    assert.doesNotThrow(() => accessSync(file, constants.X_OK),
      `${executable} must be executable after fixture preparation`);
    const probe = spawnSync(file, ['--version'], { encoding: 'utf8' });
    assert.equal(probe.status, 0, `${executable} must be spawnable, not merely marked executable: ${probe.error?.message || probe.stderr}`);
  }
});

test('fixture can relocate only the pinned native tree to an executable temp mirror', {
  skip: process.platform !== 'linux' || process.arch !== 'x64'
}, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'uberbond-pg-fixture-mirror-test-'));
  const packageRoot = path.join(root, 'platform-package');
  const binDir = path.join(packageRoot, 'native', 'bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '18.4.0-beta.17' }));

  for (const executable of ['initdb', 'pg_ctl', 'postgres']) {
    const file = path.join(binDir, executable);
    writeFileSync(file, '#!/bin/sh\nprintf "fake-postgres-version\\n"\n');
    chmodSync(file, 0o755);
  }

  try {
    const result = await prepareEmbeddedPostgresFixture({
      packageRoot,
      mirrorBaseDir: root,
      forceMirror: true
    });
    assert.equal(result.status, 'READY');
    assert.equal(result.executionProbe, 'PASSED');
    assert.equal(result.executionMode, 'TMP_NATIVE_SYMLINK');

    const nativePath = path.join(packageRoot, 'native');
    assert.equal(lstatSync(nativePath).isSymbolicLink(), true,
      'package native tree must become a symlink only after the temp mirror passes execution probes');
    const resolvedNative = realpathSync(nativePath);
    assert.equal(resolvedNative.startsWith(`${root}${path.sep}`), true,
      'forced mirror must remain inside the supplied bounded temp root');

    for (const executable of ['initdb', 'pg_ctl', 'postgres']) {
      const probe = spawnSync(path.join(nativePath, 'bin', executable), ['--version'], { encoding: 'utf8' });
      assert.equal(probe.status, 0, `${executable} must execute through the mirror symlink`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
