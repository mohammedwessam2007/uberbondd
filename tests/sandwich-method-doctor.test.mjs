import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Sandwich Method doctor exercises exact-head evidence-bound folding and local task compilation without external claims', () => {
  const run = spawnSync(process.execPath, [resolve(root, 'scripts/sandwich-method-doctor.mjs')], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.status, 'SANDWICH_METHOD_DOCTOR_HEALTHY');
  assert.equal(report.evidenceBindingHealthy, true);
  assert.equal(report.agentTaskBridgeHealthy, true);
  assert.equal(report.selectedSyntheticFold, 'memory');
  assert.equal(report.businessEffectAuthority, 'NONE');
  assert.equal(report.externalEffectAuthority, 'NONE');
  assert.match(report.truthBoundary, /EVIDENCE_BINDING_AND_LOCAL_TASK_COMPILATION_ONLY/);
  assert.match(report.truthBoundary, /NOT_GLOBAL_COMPLETENESS_RUNTIME_PHYSICAL_COMMERCIAL_LIFE_OUTCOME_OR_ASI_EVIDENCE/);
});
