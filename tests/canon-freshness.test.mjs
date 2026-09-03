import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MUTATIONS } from '../scripts/mutation-war.mjs';
import { execFileSync } from 'node:child_process';

// A receipt and a statement of current state are different objects.
//
// A historical receipt is immutable evidence: it says what was observed, by
// what test, at what SHA, under what policy, at what time. It does not become
// wrong when the tree moves on, and asking it to pretend it was written later
// would destroy the only thing it is for.
//
// A statement of *current* state is a different claim. `docs/CURRENT_SYSTEM_STATE.md`
// and `artifacts/system-readiness-current.json` say what can presently be
// asserted about this source tree. The larger `artifacts/system-readiness.json`
// is preserved as a historical measurement receipt until a real exact-head run
// regenerates it; keeping old capability rows is not permission to call old
// verification current.

// `merge-base --is-ancestor` answers only through its exit code and prints
// nothing either way, so the usual "swallow the error, return empty string"
// shape cannot express its answer: success and failure are both ''. With
// allowFailure the caller gets null for a non-zero exit and the string for a
// zero one, which keeps every existing call site unchanged.
const git = (args, { allowFailure = false } = {}) => {
  try { return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' }).trim(); }
  catch { return allowFailure ? null : ''; }
};

const headSha = () => git(['rev-parse', 'HEAD']);

// Present-tense canon: must describe the current source tree.
const CURRENT_STATE_ARTIFACTS = [
  {
    path: 'docs/CURRENT_SYSTEM_STATE.md',
    extract: text => (text.match(/Reconciled from (?:main|current head):\s*`([0-9a-f]{7,40})`/) || [])[1]
  },
  {
    path: 'artifacts/system-readiness-current.json',
    extract: text => JSON.parse(text)?.repository?.sourceCommit
  }
];

// Historical receipts: immutable, exempt by design. Listed so the exemption is
// a decision on the record rather than an omission.
const HISTORICAL_RECEIPTS = [
  'artifacts/system-readiness.json',
  'docs/UBERBOND_SUMMIT_100_FINAL_RECEIPT.md',
  'docs/UBERBOND_EVEREST_ZERO_COMPLETION_RECEIPT.md',
  'docs/UBERBOND_BLACK_SKY_FINAL_RECEIPT.md'
];

test('the present-tense canon names the commit it was reconciled from', () => {
  for (const { path, extract } of CURRENT_STATE_ARTIFACTS) {
    if (!existsSync(path)) continue;
    const sha = extract(readFileSync(path, 'utf8'));
    assert.ok(sha && /^[0-9a-f]{7,40}$/.test(String(sha)),
      `${path} must name the commit it describes; a present-tense claim with no SHA cannot be checked`);
  }
});

// Naming a SHA is not the same as naming a commit that exists.
//
// An amend after a regeneration rewrites the very commit the canon was just
// reconciled from, and the canon then points at an orphan: a well-formed
// 40-character hex string that no longer appears in this branch's history.
//
// Which paths make canon a claim about source rather than about prose.
const CANON_RELEVANT = /^(src|scripts|config|migrations)\//;

// Reachability, not existence: `git cat-file -e` succeeds on an orphan until it
// is garbage collected. A squash merge is allowed when canon-relevant source is
// byte-identical, because the new merge commit then describes the same source
// tree even though the pre-merge SHA is no longer an ancestor.
const canonRelevantSourceMatches = (sha, head) => {
  const changed = git(['diff', '--name-only', sha, head], { allowFailure: true });
  if (changed === null) return false;
  return !changed.split('\n').map(line => line.trim()).filter(Boolean).some(name => CANON_RELEVANT.test(name));
};

test('the commit the canon names is actually in this branch history', () => {
  const head = headSha();
  if (!head) return;
  for (const { path, extract } of CURRENT_STATE_ARTIFACTS) {
    if (!existsSync(path)) continue;
    const sha = String(extract(readFileSync(path, 'utf8')) || '');
    if (!/^[0-9a-f]{7,40}$/.test(sha)) continue;
    if (git(['merge-base', '--is-ancestor', sha, head], { allowFailure: true }) !== null) continue;
    assert.ok(canonRelevantSourceMatches(sha, head),
      `${path} names ${sha.slice(0, 12)}, which is not an ancestor of HEAD and describes ` +
      'different source than this tree has -- so nobody can check out the tree it claims to ' +
      'describe. Regenerate with the canonical generator (npm run readiness).');
  }
});

// Deliberately not "canon must name the current head". That rule is stricter
// than the truth and would be red on every documentation-only commit.
// What matters is whether src/scripts/config/migrations changed underneath the
// source commit the current-state envelope names.
test('the present-tense canon describes the source the tree actually has', () => {
  const head = headSha();
  if (!head) assert.fail('git head unavailable; this check cannot pass without it');

  const stale = [];
  for (const { path, extract } of CURRENT_STATE_ARTIFACTS) {
    if (!existsSync(path)) continue;
    const claimed = String(extract(readFileSync(path, 'utf8')) || '');
    if (!claimed) continue;
    if (head.startsWith(claimed) || claimed.startsWith(head)) continue;

    const known = git(['cat-file', '-e', `${claimed}^{commit}`]) !== null
      && git(['rev-parse', '--verify', `${claimed}^{commit}`]);
    if (!known) {
      stale.push(`${path} names ${claimed.slice(0, 12)}, which is not a commit in this repository`);
      continue;
    }
    const changed = git(['diff', '--name-only', claimed, head])
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .filter(name => CANON_RELEVANT.test(name));
    if (changed.length) {
      stale.push(`${path} describes ${claimed.slice(0, 12)}; ${changed.length} source file(s) have changed since, first: ${changed[0]}`);
    }
  }

  assert.deepEqual(stale, [],
    'a present-tense claim about a tree that has since changed is false, not merely old -- regenerate with the canonical generator (npm run readiness), never by hand');
});

// Current prose may contain a measured syntax or mutation count only after an
// execution actually established it. Pending prose intentionally avoids those
// claim phrases, so an inferred target count cannot masquerade as a passing run.
test('any measured figures in present-tense canon are actually true', () => {
  const path = 'docs/CURRENT_SYSTEM_STATE.md';
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');

  const claimedFiles = Number((text.match(/([0-9]+) files parse/) || [])[1]);
  if (Number.isFinite(claimedFiles)) {
    const actual = Number(
      execFileSync('node', ['scripts/check-syntax.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
        .match(/([0-9]+) files parse/)[1]
    );
    assert.equal(claimedFiles, actual,
      `canon claims ${claimedFiles} files parse; ${actual} actually do`);
  }

  const claimedMutations = Number((text.match(/([0-9]+) mutations/) || [])[1]);
  if (Number.isFinite(claimedMutations)) {
    assert.equal(claimedMutations, MUTATIONS.length,
      `canon claims ${claimedMutations} mutations; the war has ${MUTATIONS.length}`);
  }
});

test('historical receipts are exempt, and the exemption is explicit', () => {
  for (const path of HISTORICAL_RECEIPTS) {
    assert.equal(CURRENT_STATE_ARTIFACTS.some(a => a.path === path), false,
      `${path} is a historical receipt and must never be required to match the current head`);
  }
});

test('current readiness overlay cannot silently claim green while exact-head execution is pending', () => {
  const path = 'artifacts/system-readiness-current.json';
  if (!existsSync(path)) return;
  const current = JSON.parse(readFileSync(path, 'utf8'));
  if (current?.verification?.status === 'EXACT_HEAD_EXECUTION_PENDING_INFRASTRUCTURE') {
    assert.equal(current.verification.greenClaimAllowed, false);
    assert.equal(current.verification.currentHeadEvidence?.exactHeadFullSuiteExecuted, false);
  }
});

test('a receipt does not license skipping current verification', () => {
  const files = ['scripts/mutation-war.mjs', 'scripts/run-real-postgres-tests.mjs', 'scripts/check-syntax.mjs'];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    assert.doesNotMatch(source, /RECEIPT|_CLOSED\b|INTERNALLY_EXHAUSTED/,
      `${file} must not consult a receipt or a closure verdict when deciding whether to run`);
  }
});