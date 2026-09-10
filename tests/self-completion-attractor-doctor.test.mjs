import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Self-Completion Attractor doctor keeps physical, commercial and elapsed gaps external to source closure', () => {
  const run = spawnSync(process.execPath, [resolve(root, 'scripts/self-completion-attractor-doctor.mjs')], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.nextInternalGap.id, 'private-sensorium');
  const external = new Set(report.externalEvidenceFrontier.map(row => row.id));
  assert.ok(external.has('owned-founder-host'));
  assert.ok(external.has('real-customer'));
  assert.match(report.doctorBoundary, /NOT_AN_EXACT_CURRENT_TERMINAL_TRIBUNAL/);
  assert.equal(report.externalEffectAuthority, 'NONE');
});
