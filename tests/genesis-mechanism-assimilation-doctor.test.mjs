import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { genesisMechanismDonorRegistry } from '../src/genesis-mechanism-donor-registry.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const EXPECTED_DONORS = [
  'agent-crystallize-work-state',
  'argus-role-separated-persistence',
  'chat-on-steroids-durable-continuation',
  'durable-agent-outbox-unknown-outcome',
  'durable-agents-step-checkpointing',
  'jiuwen-autogenetic-memory',
  'open-multi-agent-adaptive-dag-repair',
  'openagents-fenced-session-attachment'
].sort();

test('donor genome is bounded, unique, dated and has zero instruction/execution authority', () => {
  const registry = genesisMechanismDonorRegistry();
  assert.equal(registry.ok, true, JSON.stringify(registry));
  assert.equal(registry.donorCount, 8);
  assert.deepEqual(registry.donors.map(item => item.id).sort(), EXPECTED_DONORS);
  assert.equal(new Set(registry.donors.map(item => item.id)).size, registry.donorCount);
  assert.ok(registry.donors.every(item => /^https:\/\/github\.com\//.test(item.sourceUrl)));
  assert.ok(registry.donors.every(item => item.observedAt === '2026-09-06T00:00:00.000Z'));
  assert.ok(registry.donors.every(item => item.evidenceClass === 'WEAK_SIGNAL_PRIMARY_SOURCE'));
  assert.ok(registry.donors.every(item => item.sourceInstructionAuthority === 'NONE'));
  assert.ok(registry.donors.every(item => item.promotionAuthority === 'NONE'));
  assert.ok(registry.donors.every(item => item.executionAuthority === 'NONE'));
  assert.equal(registry.sourceInstructionAuthority, 'NONE');
  assert.equal(registry.executionAuthority, 'NONE');
  assert.deepEqual(registry.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});

test('every donor records a changed primitive, assumptions, failure modes and evidence pointers', () => {
  const { donors } = genesisMechanismDonorRegistry();
  for (const donor of donors) {
    assert.ok(donor.mechanism.length > 80, `${donor.id}: mechanism too thin`);
    assert.ok(donor.changedPrimitives.length >= 3, `${donor.id}: changed primitives too thin`);
    assert.ok(donor.assumptions.length >= 1, `${donor.id}: missing donor assumptions`);
    assert.ok(donor.failureModes.length >= 2, `${donor.id}: missing failure modes`);
    assert.ok(donor.inputs.length >= 2 && donor.outputs.length >= 2, `${donor.id}: missing IO contract`);
    assert.ok(donor.evidenceRefs.length >= 1 && donor.evidenceRefs.every(ref => ref.startsWith('signal:')), `${donor.id}: invalid evidence pointers`);
  }
});

test('operator doctor executes continuation + all eight donor populations and emits a zero-effect receipt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-assimilation-doctor-'));
  const output = path.join(dir, 'receipt.json');
  const run = spawnSync(process.execPath, ['scripts/genesis-mechanism-assimilation-doctor.mjs', output], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env }
  });
  assert.equal(run.status, 0, `doctor failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
  const stdout = JSON.parse(run.stdout);
  assert.equal(stdout.ok, true);
  assert.equal(stdout.status, 'GENESIS_MECHANISM_ASSIMILATION_DOCTOR_PASSED');
  assert.equal(stdout.donorCount, 8);
  assert.equal(stdout.totalVariants, 128);
  assert.match(stdout.graphDigest, /^[a-f0-9]{64}$/);
  assert.match(stdout.checkpointDigest, /^[a-f0-9]{64}$/);

  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(receipt.status, 'GENESIS_MECHANISM_ASSIMILATION_DOCTOR_PASSED');
  assert.equal(receipt.donorGenome.donorCount, 8);
  assert.deepEqual(receipt.donorGenome.donorIds.sort(), EXPECTED_DONORS);
  assert.equal(receipt.assimilation.assimilatedCount, 8);
  assert.equal(receipt.assimilation.rejectedCount, 0);
  assert.equal(receipt.assimilation.totalVariants, 128);
  assert.equal(receipt.assimilation.topVariants.length, 8);
  assert.ok(receipt.assimilation.topVariants.every(item => Array.isArray(item.mutations) && item.mutations.length >= 1));
  assert.equal(receipt.sourceInstructionAuthority, 'NONE');
  assert.equal(receipt.promotionAuthority, 'NONE');
  assert.equal(receipt.executionAuthority, 'NONE');
  assert.deepEqual(receipt.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
  fs.rmSync(dir, { recursive: true, force: true });
});
