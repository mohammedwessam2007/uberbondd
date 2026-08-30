import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// tests/canon-freshness.test.mjs asks whether the canon describes a tree anyone
// can check out. It used to ask that as bare git ancestry, which is a stricter
// question than the one it means -- and stricter in a way that cost a commit
// after every merge.
//
// A squash merge replaces the branch commit the canon was regenerated at with a
// new one carrying an identical tree. The canon's SHA stops being an ancestor
// the moment the pull request lands, through no change to the source it
// describes. That happened four times in one shift, each time demanding a
// follow-up commit whose only content was a new SHA, and a check that demands a
// ritual after every merge is one people learn to route around.
//
// The refinement is not a loosening: an unreachable SHA still fails when the
// canon-relevant source at that commit differs from what is here. What changed
// is that "unreachable" alone stopped being the accusation.
//
// This suite holds the discrimination up, because the failure mode of getting it
// wrong is a canon-staleness check that never fires.

const source = readFileSync(join(repoRoot, 'tests/canon-freshness.test.mjs'), 'utf8');

test('the unreachable-SHA check still makes an assertion that can fail', () => {
  // The cheapest way to "fix" a check that fires after every merge is to stop it
  // asserting anything. Named explicitly so that removal is a visible act.
  assert.match(source, /assert\.ok\(canonRelevantSourceMatches\(sha, head\)/,
    'the ancestry check must still assert something about the source, not merely pass');
  assert.equal(/assert\.ok\(true/.test(source), false,
    'an assertion of `true` is a check that has been switched off in place');
});

test('the exemption is decided by the source, not by the shape of the SHA', () => {
  // If the exemption were keyed on anything other than a real comparison of the
  // canon-relevant tree -- a SHA prefix, a date, an environment variable -- it
  // would exempt genuinely stale canon too.
  const helper = source.match(/const canonRelevantSourceMatches = [\s\S]*?\n};/);
  assert.ok(helper, 'the exemption must be a named, readable comparison');
  assert.match(helper[0], /git\(\['diff', '--name-only', sha, head\]/,
    'it must compare the two trees');
  assert.match(helper[0], /CANON_RELEVANT\.test/,
    'and judge only the paths that make canon a claim about source');
  assert.equal(/process\.env|Date\.|startsWith/.test(helper[0]), false,
    'nothing about the environment or the time may decide whether canon is fresh');
});

test('a failure to run git is not read as a passing comparison', () => {
  // `git` returns null on a non-zero exit. If that were treated as "no relevant
  // files changed", a broken git invocation would silently exempt everything.
  const helper = source.match(/const canonRelevantSourceMatches = [\s\S]*?\n};/)[0];
  assert.match(helper, /if \(changed === null\) return false;/,
    'an unanswerable comparison must fail closed, not exempt the canon');
});
