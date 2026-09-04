// The arsenal chain is doctor -> plan -> tick, each reading what the last wrote.
// When a step is missing its input, the fact worth reporting is which step has
// not run -- not which byte the JSON parser gave up on.
//
// All four paths used to throw into a generic handler that printed the raw
// error: `AVENGERS_TICK_CRASHED / ENOENT: no such file or directory, open
// '.../avengers-squad-plan.json'`. That is the arsenal's most common state on a
// host with no configured provider -- nothing is callable, so the planner
// correctly refuses and writes no plan -- and it was being reported as a crash
// about a filename.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readAvengersArtifact } from '../src/avengers-artifact-input.mjs';

const SPEC = { kind: 'plan', producedBy: 'npm run avengers:plan', describes: 'The squad plan' };

const withDir = body => {
  const dir = mkdtempSync(join(tmpdir(), 'avengers-input-'));
  try { return body(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('a missing artifact names the step that has not run, not the file that is absent', () => {
  withDir(dir => {
    const result = readAvengersArtifact(join(dir, 'nothing.json'), SPEC);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'AVENGERS_PLAN_NOT_GENERATED');
    assert.deepEqual(result.reasonCodes, ['plan-artifact-not-generated']);
    assert.equal(result.nextStep, 'npm run avengers:plan');

    // The producing step can itself be legitimately blocked, and saying so is
    // the difference between "run this" and "run this, and here is why it may
    // still refuse". Without it an operator reads a refusal as a second bug.
    assert.match(result.detail, /has not been generated yet/);
    assert.match(result.detail, /may itself refuse if the arsenal has nothing callable/);

    // And it must not read as a crash. That was the whole defect.
    assert.equal(/CRASHED/.test(result.status), false);
    assert.equal(/ENOENT/.test(result.detail), false);
  });
});

test('a malformed artifact says regenerate, not repair by hand', () => {
  withDir(dir => {
    const file = join(dir, 'half-written.json');
    writeFileSync(file, '{"mission": {');
    const result = readAvengersArtifact(file, SPEC);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'AVENGERS_PLAN_MALFORMED');
    assert.deepEqual(result.reasonCodes, ['plan-artifact-malformed']);
    // A half-written artifact is worse than an absent one: everything
    // downstream would treat whatever parsed as truth.
    assert.match(result.detail, /Regenerate it with `npm run avengers:plan` rather than editing it/);
  });
});

test('unreadable is distinguished from absent, because they need different fixes', () => {
  withDir(dir => {
    const file = join(dir, 'locked.json');
    writeFileSync(file, '{}');
    chmodSync(file, 0o000);
    const result = readAvengersArtifact(file, SPEC);
    // Running as root defeats the permission, so this only asserts when the
    // environment can actually produce the condition.
    if (result.ok) return;
    assert.equal(result.status, 'AVENGERS_PLAN_UNREADABLE');
    assert.deepEqual(result.reasonCodes, ['plan-artifact-unreadable']);
  });
});

test('a valid artifact is returned unchanged', () => {
  withDir(dir => {
    const file = join(dir, 'plan.json');
    const value = { mission: { id: 'm1' }, assignments: [{ nodeId: 'research' }] };
    writeFileSync(file, JSON.stringify(value));
    const result = readAvengersArtifact(file, SPEC);
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, value);
    // No status noise on the success path: a caller checks `ok` and uses
    // `value`, and anything else here would invite it to check the wrong thing.
    assert.equal(result.status, undefined);
  });
});

test('the status is derived from the kind, so a new artifact cannot borrow another one\'s name', () => {
  withDir(dir => {
    const missing = join(dir, 'nothing.json');
    assert.equal(
      readAvengersArtifact(missing, { kind: 'readiness', producedBy: 'npm run avengers:doctor', describes: 'x' }).status,
      'AVENGERS_READINESS_NOT_GENERATED');
    assert.equal(
      readAvengersArtifact(missing, { kind: 'mission', describes: 'x' }).status,
      'AVENGERS_MISSION_NOT_GENERATED');

    // A kind with no producing command says what is wrong without inventing a
    // command that does not exist.
    const noProducer = readAvengersArtifact(missing, { kind: 'mission', describes: 'The mission definition' });
    assert.equal(noProducer.nextStep, null);
    assert.equal(/undefined|null/.test(noProducer.detail), false);
  });
});
