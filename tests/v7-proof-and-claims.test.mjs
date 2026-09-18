// Proof obligations and the claim-evidence registry. PHASE 3.
//
// Both exist to stop a number meaning less than it looks like. "19 directives
// unguarded" mixed rules that a guard could settle with permissions that no
// guard can ever settle, and a count that mixes those is not a debt figure.
// "490 mutations killed" was true of a tree that had since changed twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classify, OBLIGATION_KINDS } from '../scripts/v7-proof-obligations.mjs';
import { CLAIMS } from '../scripts/v7-claim-evidence-registry.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const readJson = p => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

test('an external-effect prohibition demands a mutation guard, not a mention', () => {
  const kind = classify({ class: 'PROHIBITION', authorityClass: 'EXTERNAL_EFFECT' });
  assert.equal(kind.kind, 'MUTATION_GUARD');
});

test('a permission is not dischargeable by code, and that is not debt', () => {
  // The distinction the whole artifact exists for. A permission grants latitude,
  // so there is no failure state for a guard to catch, and counting it as an
  // unguarded rule inflates the debt figure with rules nobody could ever close.
  const kind = classify({ class: 'PERMISSION', authorityClass: 'EXTERNAL_EFFECT' });
  assert.equal(kind.kind, 'NOT_DISCHARGEABLE_BY_CODE');
});

test('the most demanding obligation wins when several could match', () => {
  // Ordering matters: an external-effect prohibition also matches INTERNAL_TEST,
  // and filing it there would let a weaker discharge close it.
  const mutationIndex = OBLIGATION_KINDS.findIndex(k => k.kind === 'MUTATION_GUARD');
  const internalIndex = OBLIGATION_KINDS.findIndex(k => k.kind === 'INTERNAL_TEST');
  assert.ok(mutationIndex < internalIndex, 'MUTATION_GUARD must be tested before INTERNAL_TEST');
});

test('a mutation-guard obligation is not discharged by a test merely mentioning the subject', () => {
  const artifact = readJson('artifacts/v7/proof-obligations.json');
  const mentionedButUnguarded = artifact.rows.filter(row =>
    row.obligationKind === 'MUTATION_GUARD' && row.mutationGuards.length === 0 && row.testsMentioning > 0);
  for (const row of mentionedButUnguarded) {
    assert.equal(row.discharged, false, `${row.id} is mentioned by ${row.testsMentioning} tests and has no guard; it is not discharged`);
  }
});

test('the reported debt counts only rules code could actually settle', () => {
  const artifact = readJson('artifacts/v7/proof-obligations.json');
  const counted = artifact.rows.filter(row =>
    row.discharged === false && ['MUTATION_GUARD', 'EXECUTABLE_CHECK'].includes(row.obligationKind));
  assert.equal(artifact.counts.outstandingAndDischargeableByCode, counted.length);
  assert.ok(artifact.counts.byKind.NOT_DISCHARGEABLE_BY_CODE.outstanding === 0,
    'a permission must never appear as outstanding debt');
});

test('every claim names the artifact backing it and the head that produced it', () => {
  const registry = readJson('artifacts/v7/claim-evidence-registry.json');
  assert.equal(registry.rows.length, CLAIMS.length);
  for (const row of registry.rows) {
    assert.ok(row.artifact, `${row.id} must cite an artifact`);
    assert.ok(row.evidenceClass, `${row.id} must state what kind of evidence backs it`);
    assert.ok(['EXACT_HEAD', 'STALE_AGAINST_CURRENT_HEAD', 'NOT_HEAD_BOUND', 'ARTIFACT_MISSING'].includes(row.freshness));
  }
});

test('a claim produced at a different head reads stale, not current', () => {
  // The failure this catches has already happened twice in this repository.
  // Staleness is about source, not about the head moving. Comparing against HEAD
  // alone is unsatisfiable: committing the artifact changes HEAD, so a registry
  // generated immediately before a commit would be stale the moment it lands.
  const registry = readJson('artifacts/v7/claim-evidence-registry.json');
  for (const row of registry.rows) {
    if (row.freshness === 'EXACT_HEAD') {
      assert.deepEqual(row.sourceChangedSince, [],
        `${row.id} claims exact-head while naming changed source: ${JSON.stringify(row.sourceChangedSince)}`);
    }
    if (row.freshness === 'STALE_AGAINST_CURRENT_HEAD') {
      assert.ok(row.sourceChangedSince.length > 0, `${row.id} claims stale and must name what changed`);
    }
  }
  assert.ok(head.length === 40);
});

test('evidence with no head is NOT_HEAD_BOUND rather than fresh', () => {
  // A health probe is timed, not committed. Reading it as exact-head would make
  // an observation from hours ago look like it was taken at this commit.
  const registry = readJson('artifacts/v7/claim-evidence-registry.json');
  const deployment = registry.rows.find(row => row.id === 'CLM-DEPLOYMENT-STATE');
  assert.equal(deployment.freshness, 'NOT_HEAD_BOUND');
  assert.equal(deployment.producedAtSha, null);
});

test('the V9 claim cites the thing that re-measures it, not the thing that described it once', () => {
  const registry = readJson('artifacts/v7/claim-evidence-registry.json');
  const v9 = registry.rows.find(row => row.id === 'CLM-CANONICAL-V9');
  assert.equal(v9.artifact, 'artifacts/v7/gap-ledger.json',
    'the ledger re-runs the materializer; the blocker document is a written record that goes stale by design');
});

test('every absent contract artifact carries a reason', () => {
  // An unclassified absence hides how much of the remainder is actually waiting
  // on software rather than on reality.
  const index = readJson('artifacts/v7/artifact-index.json');
  assert.deepEqual(index.unclassifiedAbsences, [], 'an absence with no reason is a defect in the index');
  for (const row of index.rows.filter(r => r.state === 'ABSENT')) {
    assert.notEqual(row.absenceReason, 'UNCLASSIFIED', `${row.artifact} has no absence reason`);
    assert.ok(row.note, `${row.artifact} must say why it is absent`);
  }
});

test('the absence reasons separate software work from waiting', () => {
  const index = readJson('artifacts/v7/artifact-index.json');
  const reasons = index.absenceReasons;
  const total = Object.values(reasons).reduce((a, b) => a + b, 0);
  assert.equal(total, index.counts.ABSENT);
  // Written when six absences were ordinary work waiting to be done. They have
  // since been built, so zero COMPUTABLE_NOW is the success state rather than a
  // failure -- but it only counts as success if the remainder is still
  // classified, which is what the assertions below actually defend.
  const computable = reasons.COMPUTABLE_NOW || 0;
  const waiting = total - computable;
  assert.ok(waiting > 0, 'the remaining absences wait on something no writing produces');
  assert.equal(reasons.UNCLASSIFIED ?? 0, 0, 'an absence with no reason hides whether it is work or waiting');
  // Every remaining reason must be one that genuinely cannot be closed by
  // writing code, or this test would pass while real work hid behind a label.
  const nonSoftware = ['NEEDS_EXTERNAL_REALITY', 'NEEDS_REPEATED_OBSERVATION', 'NEEDS_ELAPSED_TIME', 'NEEDS_A_RUNTIME_THAT_DOES_NOT_EXIST'];
  for (const [reason, count] of Object.entries(reasons)) {
    if (reason === 'COMPUTABLE_NOW') continue;
    assert.ok(nonSoftware.includes(reason), `${reason} (${count}) is not a recognised waiting reason`);
  }
});
