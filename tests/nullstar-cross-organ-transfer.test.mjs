// What transfers between organs, and what only looks like it does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KNOWLEDGE_STATES } from '../src/epistemic-immune-system.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('the transfer measurement reproduces and touches nothing external', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'nullstar-transfer-'));
  try {
    const target = join(tmp, 'transfer.json');
    execFileSync(process.execPath, ['scripts/nullstar-cross-organ-transfer.mjs'], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
      env: { ...process.env, NULLSTAR_TRANSFER_OUT: target }
    });
    const fresh = JSON.parse(readFileSync(target, 'utf8'));
    const recorded = read('artifacts/nullstar-terminal/cross-organ-transfer.json');
    assert.deepEqual(fresh.results, recorded.results, 'the recorded numbers must still be the numbers');
    assert.equal(fresh.externalEffects.providerCalls, 0);
    assert.equal(fresh.businessEffectAuthority, 'NONE');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('the mechanism transfers and the unchanged implementation does not', () => {
  const artifact = read('artifacts/nullstar-terminal/cross-organ-transfer.json');
  assert.equal(artifact.finding, 'THE_MECHANISM_TRANSFERS_AND_THE_IMPLEMENTATION_DOES_NOT');
  assert.equal(artifact.mechanismTransfers, true);
  assert.equal(artifact.codeTransfers, false);
});

test('chance is the baseline, not the rule the mechanism replaced', () => {
  // The first verdict compared every arm against the pre-GA2 ladder and
  // concluded the implementation transferred, because 0.43 beats 0. The ladder
  // scores 0 by being systematically wrong, and beating a systematically wrong
  // rule is not evidence of anything. If this ever reverts, the artifact starts
  // congratulating the arm under test for landing on chance.
  const artifact = read('artifacts/nullstar-terminal/cross-organ-transfer.json');
  assert.equal(artifact.baseline.chance, 0.5);

  const rate = arm => artifact.results.find(row => row.arm === arm).rate;
  assert.ok(rate('PROMOTED_SOLVER_UNCHANGED') > rate('PRE_GA2_FLAT_LADDER'),
    'the unchanged solver does beat the old ladder, which is exactly why the ladder is the wrong baseline');
  assert.ok(rate('PROMOTED_SOLVER_UNCHANGED') <= artifact.baseline.chance + artifact.baseline.margin,
    'and it is still at chance, which is why that is not transfer');
});

test('the receiving organ shares no evidence label with the suite', () => {
  // If the vocabularies ever overlap, the measurement stops being about
  // transfer and becomes about the solver recognising its own table.
  const artifact = read('artifacts/nullstar-terminal/cross-organ-transfer.json');
  const suiteLabels = ['PRIMARY_MEASUREMENT', 'REPLICATED_MEASUREMENT', 'SECONDHAND_SUMMARY', 'UNSOURCED_ASSERTION'];
  for (const label of suiteLabels) {
    assert.ok(!KNOWLEDGE_STATES.includes(label), `${label} appears in both vocabularies`);
  }
  assert.equal(artifact.receivingOrgan.sharesNoLabelWithTheSuite, true);
  assert.deepEqual(artifact.receivingOrgan.states, [...KNOWLEDGE_STATES],
    'the artifact must record the organ\'s ordering as it actually is');
});

test('the ill-posed first construction is recorded rather than quietly replaced', () => {
  // It produced a number that favoured the arm under test. Deleting it and
  // keeping the second run would be the most ordinary way to launder a result.
  const artifact = read('artifacts/nullstar-terminal/cross-organ-transfer.json');
  assert.ok(artifact.taskConstruction.firstConstructionWasIllPosed);
  assert.ok(artifact.taskConstruction.illPosedVersionNotReported);
});

test('the receiving organ is not modified by any of this', () => {
  // Transfer measured on constructed tasks is not transfer to the organ's work,
  // and the difference is a production change nobody authorised.
  const organ = readFileSync(new URL('../src/epistemic-immune-system.mjs', import.meta.url), 'utf8');
  assert.ok(!organ.includes('nullstar'), 'the organ must not import or reference the instrument');
  const artifact = read('artifacts/nullstar-terminal/cross-organ-transfer.json');
  assert.ok(artifact.whatThisIsNot.some(line => line.includes('Not a production change')));
});
