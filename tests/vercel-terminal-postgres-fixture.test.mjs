import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Vercel terminal gate narrowly approves and prepares the pinned embedded Postgres fixture', () => {
  const npmrc = readFileSync('.npmrc', 'utf8');
  const terminal = readFileSync('scripts/vercel-command-center-build.mjs', 'utf8');

  assert.match(npmrc, /^allow-scripts=@embedded-postgres\/linux-x64@18\.4\.0-beta\.17$/m);
  assert.doesNotMatch(npmrc, /dangerously-allow-all-scripts|allow-scripts=\*/i);

  const rebuild = terminal.indexOf("['npm', ['rebuild', '@embedded-postgres/linux-x64']]");
  const deterministic = terminal.indexOf("['npm', ['run', 'test:deterministic']]");
  const mutationWar = terminal.indexOf("['npm', ['run', 'test:mutation-war']]");

  assert.ok(rebuild >= 0, 'terminal gate must explicitly hydrate the reviewed Linux-x64 fixture');
  assert.ok(deterministic > rebuild, 'fixture preparation must fail fast before the deterministic siege');
  assert.ok(mutationWar > deterministic, 'Mutation War must remain after the complete deterministic suite');
  assert.match(terminal, /process\.platform === 'linux' && process\.arch === 'x64'/);
});
