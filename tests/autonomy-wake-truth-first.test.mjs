import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wake = readFileSync(new URL('../.github/workflows/uberbond-autonomy-wake.yml', import.meta.url), 'utf8');

function indexOfRequired(pattern, label) {
  const index = wake.search(pattern);
  assert.ok(index >= 0, `${label} missing`);
  return index;
}

test('finite completion wake measures terminal truth before seeding work', () => {
  const terminal = indexOfRequired(/node scripts\/terminal-realization\.mjs/, 'terminal realization');
  const seed = indexOfRequired(/node scripts\/uberbond-finite-completion-seed\.mjs/, 'finite completion seed');
  const dispatch = indexOfRequired(/uberbond-self-maintainer\.yml\/dispatches/, 'self-maintainer dispatch');
  assert.ok(terminal < seed, 'terminal truth must precede task selection');
  assert.ok(seed < dispatch, 'task selection must precede self-maintainer dispatch');
});

test('measured incomplete terminal state may continue to seeding but unexpected crash cannot', () => {
  assert.match(wake, /if \[ "\$rc" -ne 0 \] && \[ "\$rc" -ne 2 \]; then/);
  assert.match(wake, /if \[ "\$rc" -eq 2 \]; then/);
  assert.match(wake, /the seeder will consume that exact evidence rather than guessing/i);
});

test('truth-first step remains behind founder pause and active-maintainer fences', () => {
  const terminalBlock = wake.slice(wake.indexOf('- name: Regenerate exact-current terminal truth before choosing work'), wake.indexOf('- name: Seed exactly one finite-completion task'));
  assert.match(terminalBlock, /if: steps\.control\.outputs\.paused != 'true' && steps\.active\.outputs\.count == '0'/);
});

test('wake still grants no business-effect authority surface', () => {
  assert.doesNotMatch(wake, /paypal|stripe|customer-contact|dns.*write|credential.*write|production.*mutation/i);
});
