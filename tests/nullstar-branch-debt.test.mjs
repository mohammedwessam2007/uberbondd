// Branch debt, and the one way ancestry lies about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const repo = new URL('..', import.meta.url).pathname;
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const debt = read('artifacts/nullstar-terminal/branch-debt.json');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

test('a branch merged and then reverted is debt, not convergence', () => {
  // Merging a branch and reverting it leaves its tip an ancestor of main while
  // none of its content is there. Classified on ancestry alone it reads as
  // contained and drops out of the count -- which is what happened to the two
  // big-button branches the moment they were reverted, so the count stopped
  // seeing exactly the work that had been deliberately held back.
  for (const row of debt.mergedThenReverted ?? []) {
    assert.ok(row.missingFromMain.length > 0, `${row.branch} claims reverted with nothing missing`);
    for (const file of row.missingFromMain) {
      let present = true;
      try { git('cat-file', '-e', `origin/main:${file}`); } catch { present = false; }
      assert.equal(present, false, `${file} is recorded as absent from main but resolves there`);
    }
    // An ancestor, which is why ancestry alone cannot catch this.
    assert.doesNotThrow(() => git('merge-base', '--is-ancestor', row.branch, 'origin/main'),
      `${row.branch} should still be an ancestor of main`);
  }
});

test('reverted branches are counted in the list the ledger reads', () => {
  const counted = new Set(debt.divergedBranches.map(row => row.branch));
  for (const row of debt.mergedThenReverted ?? []) {
    assert.ok(counted.has(row.branch),
      `${row.branch} was reverted and must stay in divergedBranches, or the completion ledger stops counting it`);
  }
});

test('the populations partition every remote branch exactly once', () => {
  const total = Object.values(debt.populations).reduce((sum, n) => sum + n, 0);
  assert.equal(total, debt.totalRemoteBranches,
    'a branch in two populations or none means the classifier has a hole');
});

test('pre-rewrite lineage is measured at file level, not by commit count', () => {
  // The raw unique-commit figure runs past 1700 for a single branch because
  // main was rebuilt on a new root. Reporting that as backlog would be false.
  assert.ok(debt.preRewriteLineage.rawUniqueCommitsWouldOverstate);
  assert.equal(typeof debt.preRewriteLineage.strandedFileCount, 'number');
  assert.equal(debt.preRewriteLineage.strandedSrcEverInMainHistory
    + debt.preRewriteLineage.neverInMainHistory, debt.preRewriteLineage.strandedSrcModules);
});

test('supersession evidence states its own coverage rather than generalising', () => {
  const evidence = debt.supersessionEvidence;
  assert.ok(evidence.verified.length >= 3);
  assert.ok(evidence.whatThisDoesNotSupport.length > 0,
    'a sample that does not say what it fails to establish is an inference dressed as a measurement');
  assert.ok(evidence.coverage.includes(String(debt.preRewriteLineage.strandedSrcModules)));
});

test('the artifact claims no authority and no external effect', () => {
  assert.equal(debt.businessEffectAuthority, 'NONE');
  for (const value of Object.values(debt.externalEffects)) assert.equal(value, 0);
});
