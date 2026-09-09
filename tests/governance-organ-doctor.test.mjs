import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGovernanceOrgans } from '../scripts/governance-organ-doctor.mjs';
import { measureReachability } from '../scripts/system-readiness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expected = [
  'src/capability-scaled-security.mjs',
  'src/composed-effect-authority-audit.mjs',
  'src/finite-closure-tribunal.mjs',
  'src/genesis-self-improvement-bridge.mjs',
  'src/model-adaptation-admission.mjs',
  'src/operational-world-resource-admission.mjs',
  'src/portable-paypal-bridge.mjs',
  'src/provider-neutral-runtime-acceptance.mjs',
  'src/recursive-governance-principals.mjs',
  'src/recursive-governance-security.mjs',
  'src/recursive-improvement-retention.mjs',
  'src/runtime-evidence-attestation.mjs',
  'src/self-improvement-causal-admission.mjs',
  'src/system-level-asi-evidence.mjs',
  'src/world-resource-observed-value.mjs'
];

test('governance doctor loads the exact current terminal organ set without granting authority', () => {
  const result = inspectGovernanceOrgans();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.organCount, expected.length);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.runtimeTruth, 'NOT_INFERRED');
  assert.equal(result.commercialTruth, 'NOT_INFERRED');
  assert.equal(result.asiTruth, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.ok(result.organs.every(row => row.exportedBindings > 0));
});

test('doctor remains an inert import surface rather than a hidden executor', () => {
  const source = readFileSync(join(root, 'scripts/governance-organ-doctor.mjs'), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/);
  assert.doesNotMatch(source, /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rm|rmSync|unlink|unlinkSync)\s*\(/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test('the exact Vercel-refused organ set is operator-reachable rather than silently unclassified', () => {
  const measured = measureReachability();
  assert.equal(measured.measurementMode, 'LIVE_COMPUTED_FROM_IMPORT_GRAPH');
  assert.equal(measured.partitionExact, true);
  for (const file of expected) {
    assert.ok(!measured.unclassified.includes(file), `${file} remained unclassified`);
  }
});
