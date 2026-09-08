import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A synthetic fixture would prove the module works. This proves the repository
// obeys it, which is the interesting question: 438 opportunity IDs and 2,000
// scored combinations are sitting in the memory index right now, and every one
// reads like traction when quoted without its class.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args = []) => {
  try {
    return JSON.parse(execFileSync('node', ['scripts/memory-truth-doctor.mjs', ...args], {
      cwd: repoRoot, encoding: 'utf8', timeout: 60000
    }));
  } catch (err) {
    // A non-zero exit is a finding, not a crash; the report is still on stdout.
    return JSON.parse(String(err.stdout || '{}'));
  }
};

test('no historical count in this repository answers a commercial question', () => {
  const report = run();
  assert.equal(report.counts.leaked.length, 0,
    `these counts answered a commercial question: ${JSON.stringify(report.counts.leaked)}`);
  assert.equal(report.status, 'MEMORY_TRUTH_BOUNDARY_HOLDS');
  assert.equal(report.ok, true);
});

test('the check actually ran against real counts rather than an empty index', () => {
  // A doctor that reads nothing reports no leaks. The count is the proof that
  // the refusals were about something.
  const report = run();
  assert.ok(report.counts.checked >= 40, `expected real counts, checked ${report.counts.checked}`);
  assert.equal(report.counts.refused, report.counts.checked);
});

test('the portfolio has more than one family and an active-only answer reduces it', () => {
  const report = run();
  assert.ok(report.portfolio.size > 1);
  assert.equal(report.portfolio.fullAnswerReduces, false);
  assert.equal(report.portfolio.activeOnlyAnswerReduces, true);
});

test('an owner-recalled unresolved name stays unresolved', () => {
  const report = run();
  assert.ok(report.unresolvedNames.length >= 1);
  for (const row of report.unresolvedNames) {
    assert.equal(row.resolved, false, `${row.name} must stay unresolved without a source ref`);
    assert.equal(row.state, 'UNRESOLVED_OWNER_RECALLED');
  }
});

test('a name preserved only as an unresolved record is not reported as found', () => {
  // The amputation error running backwards: over-claiming resolution. Everest is
  // in namedInitiatives and in unresolvedNames, and both are correct.
  const report = run(['--exists', 'Everest']);
  assert.equal(report.existenceProbe.state, 'NOT_FOUND_IN_SEARCHED_SOURCES');
  assert.equal(report.existenceProbe.preservedAsUnresolvedRecord, true);
});

test('an incomplete search says so and names what it did not read', () => {
  const report = run(['--exists', 'Everest']);
  assert.equal(report.existenceProbe.searchComplete, false);
  assert.ok(report.existenceProbe.requiredSourcesNotSearched.length > 0);
});

test('a name absent everywhere is absent, not non-existent', () => {
  const report = run(['--exists', 'a name that is definitely not in this repository']);
  assert.equal(report.existenceProbe.state, 'NOT_FOUND_IN_SEARCHED_SOURCES');
  assert.equal(report.existenceProbe.preservedAsUnresolvedRecord, false);
});

test('current truth answers the present tense and the superseded donation survives', () => {
  const report = run();
  assert.match(report.precedence.presentTenseAnswer, /Sovereign Cognitive Continuum/);
  assert.ok(report.precedence.preservedDonations.includes('payment truth'));
  assert.match(report.precedence.resurrectionBoundary, /REUSE_THE_SEMANTICS_NOT_THE_OLD_ARCHITECTURE/);
});

test('the doctor produces no external effect and claims nothing commercial', () => {
  const report = run();
  assert.deepEqual(report.externalEffects, { messages: 0, providerCalls: 0, spendCents: 0, deployments: 0, writes: 0 });
  assert.match(report.truthBoundary, /NOT_EVIDENCE_ABOUT_CUSTOMERS_OR_REVENUE/);
  assert.equal(report.businessEffectAuthority, 'NONE');
});

test('the doctor imports the boundary module it claims to enforce with', () => {
  const source = readFileSync(join(repoRoot, 'scripts/memory-truth-doctor.mjs'), 'utf8');
  assert.ok(source.includes('memory-truth-boundary.mjs'));
});
