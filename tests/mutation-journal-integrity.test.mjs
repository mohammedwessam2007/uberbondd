// A resumable gate is a gate that can lie about work it never did.
//
// The mutation war takes over an hour against a real database, and four
// consecutive runs on this host were killed in flight, each discarding every
// verdict it had already earned. The journal fixes that by remembering
// verdicts across runs -- which is exactly the mechanism by which a run could
// report KILLED for a guard nobody broke.
//
// So the binding is the feature. Every entry carries a fingerprint of the
// mutation that produced it: the file, the anchor, the replacement, and the
// suites that had to fail. Move any of them and the entry stops matching and
// the mutation runs again. These tests hold that down, because the failure mode
// is a green summary line rather than a red one, and a green lie is not
// something a later run corrects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadJournal, appendVerdict, mutationFingerprint } from '../scripts/mutation-journal.mjs';

const MUTATION = Object.freeze({
  id: 'TEST-01',
  guard: 'a guard',
  file: 'src/example.mjs',
  find: 'if (!allowed) return refuse();',
  replace: '',
  suites: ['tests/example.test.mjs']
});

const withJournal = body => {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-journal-'));
  try { return body(join(dir, 'journal.jsonl')); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test('a verdict is replayed only for the mutation that earned it', () => {
  withJournal(path => {
    appendVerdict(path, MUTATION, 'KILLED');
    assert.equal(loadJournal(path, [MUTATION]).get('TEST-01'), 'KILLED');

    // Each field is part of what the verdict was about. Changing any one of
    // them means the recorded run tested something that is no longer there.
    const moved = [
      { ...MUTATION, file: 'src/somewhere-else.mjs' },
      { ...MUTATION, find: 'if (!allowed) return refuse(); // reworded' },
      { ...MUTATION, replace: 'return allow();' },
      { ...MUTATION, suites: ['tests/a-different-suite.test.mjs'] }
    ];
    for (const mutation of moved) {
      assert.equal(loadJournal(path, [mutation]).has('TEST-01'), false,
        `a verdict was replayed for a mutation that changed: ${JSON.stringify(mutation)}`);
    }
  });
});

test('an id alone cannot claim a verdict', () => {
  withJournal(path => {
    // The shape a hand-written or corrupted line would take: the right id, the
    // verdict somebody wants, and no evidence it was ever run.
    writeFileSync(path, `${JSON.stringify({ id: 'TEST-01', verdict: 'KILLED' })}\n`);
    assert.equal(loadJournal(path, [MUTATION]).has('TEST-01'), false,
      'a journal line with no fingerprint was accepted');

    writeFileSync(path, `${JSON.stringify({ id: 'TEST-01', verdict: 'KILLED', fingerprint: 'x'.repeat(32) })}\n`);
    assert.equal(loadJournal(path, [MUTATION]).has('TEST-01'), false,
      'a journal line with a wrong fingerprint was accepted');
  });
});

test('a damaged journal loses its verdicts rather than inventing them', () => {
  withJournal(path => {
    appendVerdict(path, MUTATION, 'KILLED');
    const good = readFileSync(path, 'utf8');

    writeFileSync(path, `not json at all\n${good}{"id":"TEST-01"\n`);
    assert.equal(loadJournal(path, [MUTATION]).get('TEST-01'), 'KILLED',
      'a valid line surrounded by junk must still be readable');

    writeFileSync(path, 'not json at all\n');
    assert.equal(loadJournal(path, [MUTATION]).size, 0);

    assert.equal(loadJournal(join(tmpdir(), 'no-such-journal-9f2c.jsonl'), [MUTATION]).size, 0,
      'a missing journal is an empty journal, not an error and not a pass');
  });
});

test('a later verdict supersedes an earlier one', () => {
  withJournal(path => {
    // Re-running one mutation must correct the record. Otherwise a SURVIVED
    // recorded before a fix would outlive the fix.
    appendVerdict(path, MUTATION, 'SURVIVED');
    appendVerdict(path, MUTATION, 'KILLED');
    assert.equal(loadJournal(path, [MUTATION]).get('TEST-01'), 'KILLED');

    appendVerdict(path, MUTATION, 'SURVIVED');
    assert.equal(loadJournal(path, [MUTATION]).get('TEST-01'), 'SURVIVED',
      'the record must be able to go back to bad news, not only forward to good');
  });
});

test('the fingerprint does not depend on how the suites were ordered', () => {
  // Two registrations naming the same suites in a different order describe the
  // same test. Treating them as different would silently re-run the whole war
  // after a cosmetic edit, and a resume nobody trusts is a resume nobody uses.
  assert.equal(
    mutationFingerprint({ ...MUTATION, suites: ['b.test.mjs', 'a.test.mjs'] }),
    mutationFingerprint({ ...MUTATION, suites: ['a.test.mjs', 'b.test.mjs'] })
  );
  assert.notEqual(mutationFingerprint(MUTATION), mutationFingerprint({ ...MUTATION, id: 'TEST-02' }));
});
