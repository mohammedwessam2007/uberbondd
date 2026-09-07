import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeExitDrill, survivalPosture, stateDigest, DRILL_STEPS, DRILL_SCOPES } from '../src/supplier-exit-drill.mjs';
import { runExitDrill } from '../scripts/supplier-exit-drill.mjs';

// Every system of this kind claims portability and almost none has tested it.
// The claim is cheap because the failure is invisible until the day it matters:
// the export runs, produces something, and nobody ever restored from it.

const bytes = [{ name: 'a.md', bytes: 'alpha' }, { name: 'b.json', bytes: '{"x":1}' }];
const good = stateDigest(bytes);

const drill = (over = {}) => judgeExitDrill({
  supplier: 'repository-host',
  scope: 'LOCAL_STATE_PORTABILITY',
  steps: {
    EXPORT: good,
    RESTORE: good,
    CUTOVER: { servedFromRestoredCopy: true },
    ROLLBACK: { originalReachable: true },
    ...over
  }
});

test('a restore that does not match the export fails, whatever it reported', () => {
  // "Restore succeeded" is exactly the reassuring thing a broken restore says,
  // which is why the digests are compared rather than the boolean trusted.
  const failed = drill({ RESTORE: stateDigest([{ name: 'a.md', bytes: 'alpha-but-truncated' }]) });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.reasonCodes, ['restored-state-does-not-match-export']);
  assert.notEqual(failed.exportDigest, failed.restoreDigest);
});

test('an empty export cannot pass by restoring perfectly', () => {
  // Nothing matches nothing every time. Without this the drill's happiest
  // result would be the one where it moved no bytes at all.
  const empty = stateDigest([]);
  const failed = drill({ EXPORT: empty, RESTORE: empty });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.reasonCodes, ['export-was-empty']);
});

test('a cutover with no rollback is a migration, not a rehearsal', () => {
  const noRollback = judgeExitDrill({
    supplier: 'x', scope: 'LOCAL_STATE_PORTABILITY',
    steps: { EXPORT: good, RESTORE: good, CUTOVER: { servedFromRestoredCopy: true } }
  });
  assert.equal(noRollback.ok, false);
  assert.deepEqual(noRollback.missing, ['ROLLBACK']);
  assert.match(noRollback.note, /migration nobody decided to make/);
});

test('a rollback that cannot reach the original fails', () => {
  const stranded = drill({ ROLLBACK: { originalReachable: false } });
  assert.equal(stranded.ok, false);
  assert.deepEqual(stranded.reasonCodes, ['original-not-reachable-after-rollback']);
});

test('a cutover that never served from the restored copy fails', () => {
  const notServed = drill({ CUTOVER: { servedFromRestoredCopy: false } });
  assert.equal(notServed.ok, false);
  assert.deepEqual(notServed.reasonCodes, ['cutover-did-not-serve-from-the-restored-copy']);
});

test('every step must have run, and a skipped one is not a pass', () => {
  for (const step of DRILL_STEPS) {
    const steps = {
      EXPORT: good, RESTORE: good,
      CUTOVER: { servedFromRestoredCopy: true }, ROLLBACK: { originalReachable: true }
    };
    delete steps[step];
    const skipped = judgeExitDrill({ supplier: 'x', scope: 'LOCAL_STATE_PORTABILITY', steps });
    assert.equal(skipped.ok, false, `${step} skipped must not pass`);
    assert.deepEqual(skipped.missing, [step]);
  }
});

test('a passing drill states what it does not prove', () => {
  const passed = drill();
  assert.equal(passed.ok, true);
  assert.match(passed.doesNotProve, /replacement provider/);
  assert.equal(passed.scope, 'LOCAL_STATE_PORTABILITY');
  assert.match(DRILL_SCOPES.AUTHORIZED_PROVIDER_CUTOVER.proves, /served from it/);
});

test('having somewhere to go is recorded but never required to pass', () => {
  // Portability and having a replacement are different facts. Merging them
  // would let a configured provider make an untested export look proven.
  const withNone = drill();
  assert.equal(withNone.ok, true);
  assert.equal(withNone.replacementConfigured, false);
});

test('a supplier with no passing drill is unproven, not safe', () => {
  const posture = survivalPosture([
    drill(),
    drill({ ROLLBACK: { originalReachable: false } })
  ]);
  assert.deepEqual(posture.survivable, ['repository-host']);
  assert.equal(posture.unproven.length, 1);
  assert.match(posture.law, /UNPROVEN_NOT_SAFE/);
});

test('a digest is order-independent but content-sensitive', () => {
  assert.equal(stateDigest(bytes).digest, stateDigest([...bytes].reverse()).digest);
  assert.notEqual(stateDigest(bytes).digest, stateDigest([{ name: 'a.md', bytes: 'beta' }, bytes[1]]).digest);
});

// ---- The rehearsal actually runs -------------------------------------------

test('the drill really exports, restores, cuts over and rolls back this repository', () => {
  // The verification law asks for an actual rehearsal, not a plan. This runs
  // one against the real durable canon and reads the restored bytes back off
  // disk rather than reusing the copy in memory.
  const executed = runExitDrill();
  assert.equal(executed.ok, true, JSON.stringify(executed.reasonCodes));
  assert.equal(executed.status, 'EXIT_DRILL_PASSED');
  assert.ok(executed.fileCount >= 8, `only ${executed.fileCount} durable files were exported`);
  assert.match(executed.digest, /^[0-9a-f]{64}$/);
});

test('the rehearsal leaves the repository untouched', () => {
  // A drill that damaged the original would be a very expensive way to learn
  // the export worked.
  const first = runExitDrill();
  const second = runExitDrill();
  assert.equal(first.digest, second.digest, 'the second run must see exactly the state the first left');
});
