// The report is the easiest place in a project to lie, because nothing checks
// it. These check it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const report = read('artifacts/nullstar-terminal/final-report.json');

test('the report regenerates to the same figures', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'nullstar-report-'));
  try {
    const target = join(tmp, 'final.json');
    execFileSync(process.execPath, ['scripts/nullstar-final-report.mjs'], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8',
      env: { ...process.env, NULLSTAR_FINAL_OUT: target }
    });
    const fresh = JSON.parse(readFileSync(target, 'utf8'));
    assert.deepEqual(fresh.capabilityNow.families, report.capabilityNow.families);
    assert.deepEqual(fresh.generations.table, report.generations.table);
    assert.equal(fresh.verdict.softwareOpen, report.verdict.softwareOpen);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('the verdict matches the completion ledger rather than the prose', () => {
  const ledger = read('artifacts/nullstar-terminal/completion-debt.json');
  assert.equal(report.verdict.softwareOpen, ledger.softwareOpen);
  assert.equal(report.verdict.externalOpen, ledger.externalOpen);
  assert.equal(report.verdict.done, ledger.doneVerdict);
  // DONE is only available at zero software items, and the report must say what
  // it does not mean.
  if (report.verdict.done === 'SOFTWARE_SIDE_COMPLETE') {
    assert.equal(report.verdict.softwareOpen, 0);
    assert.ok(report.verdict.whatDoneMeans.includes('does not mean the system is capable'));
    assert.ok(report.verdict.externalBlockers.length > 0,
      'software complete with no external blockers listed would read as finished');
  }
});

test('every generation in the table was declared before its candidates', () => {
  assert.equal(report.generations.everyOneDeclaredBeforeItsCandidates, true);
  for (const row of report.generations.table) {
    assert.ok(row.declaredBefore, `${row.generation} must name its declaration`);
    assert.equal(row.thresholdMatchesDeclaration, true,
      `${row.generation}: the recorded threshold must be the declared one`);
  }
});

test('the null results are in the table, not summarised away', () => {
  const outcomes = report.generations.table.map(row => row.outcome);
  assert.ok(outcomes.filter(outcome => outcome !== 'PROMOTED').length >= 2,
    'two generations promoted nothing and both belong in the record');
  assert.equal(report.generations.run, report.generations.promoted + report.generations.nullResults);
});

test('the capability figures are measured, not quoted', () => {
  // If the report ever disagrees with the live suite, the report is wrong.
  const invention = report.capabilityNow.families.find(row => row.family === 'INVENTION');
  assert.ok(invention);
  for (const level of ['d1', 'd2', 'd3', 'd4', 'd5']) {
    assert.equal(typeof invention.byDifficulty[level], 'number');
  }
  // Headroom is reported rather than rounded off: a suite at 1.0 everywhere
  // would be saturated, which is a finding and not a triumph.
  assert.ok(Array.isArray(report.capabilityNow.headroomRemaining));
});

test('the report refuses the claims this work does not support', () => {
  const blob = JSON.stringify(report.whatThisIsNot).toLowerCase();
  for (const phrase of ['general intelligence', 'superintelligence', 'intelligence explosion', 'singularity', 'recursive self-improvement']) {
    assert.ok(blob.includes(phrase), `the report must explicitly disclaim ${phrase}`);
  }
  assert.equal(report.businessEffectAuthority, 'NONE');
  for (const value of Object.values(report.externalEffects)) assert.equal(value, 0);
});

test('the corrections that went against the author are in the report', () => {
  // The two easiest things to leave out: an unanswerable task that flattered
  // the arm under test, and a baseline change that reversed a conclusion.
  const corrections = report.correctionsMadeAgainstOwnResults.join(' ').toLowerCase();
  assert.ok(corrections.includes('unanswerable'));
  assert.ok(corrections.includes('chance'));
  assert.ok(report.permanentLimitations.length >= 3);
});

test('every closed failure carries a regression test and a repair commit', () => {
  assert.equal(report.failureDebt.everyClosureCarriesARegressionTest, true);
  const ledger = read('artifacts/nullstar-terminal/failure-debt.json');
  for (const row of ledger.failures.filter(entry => entry.entryStatus === 'CLOSED_WITH_PROOF')) {
    assert.ok(row.regressionTest, `${row.id} closed without a test`);
    assert.ok(row.repairCommit, `${row.id} closed without a commit`);
  }
});

test('the human summary points at the machine-readable report', () => {
  const summary = readFileSync(new URL('../docs/NULLSTAR_TERMINAL_SUMMARY.md', import.meta.url), 'utf8');
  assert.match(summary, /artifacts\/nullstar-terminal\/final-report\.json/);
  assert.match(summary, /SOFTWARE_SIDE_COMPLETE/);
  // The disclaimers belong where a person reads them, not only in JSON.
  for (const phrase of ['superintelligence', 'singularity', 'recursive self-improvement']) {
    assert.match(summary.toLowerCase(), new RegExp(phrase));
  }
});
