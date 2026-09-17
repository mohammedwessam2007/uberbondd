// The committed constitution must describe the tree that exists.
//
// artifacts/constitution/directives.json is what the Constitution Doctor prints
// its headline numbers from and what the review record is read against, and
// nothing verified it was current. It merged stale once already: the artifact
// committed alongside the precedence work was generated before that same change
// added its tests and guards, so it recorded 464 mutation anchors while the tree
// had 469 and reported a test file that no longer existed.
//
// A stale artifact is not merely old. It answers "which rules are enforced?"
// about a tree that has since changed, in the confident present tense.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROVENANCE_KEYS,
  stableForComparison,
  compareConstitutionArtifacts
} from '../src/constitution-artifact-freshness.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const COMMITTED = join(root, 'artifacts/constitution/directives.json');

test('the committed constitution artifact describes the current tree', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uberbond-constitution-'));
  const out = join(dir, 'directives.json');
  const previous = process.env.CONSTITUTION_DOCTOR_OUT;
  process.env.CONSTITUTION_DOCTOR_OUT = out;
  try {
    const { main } = await import('../scripts/constitution-doctor.mjs');
    main();
    const fresh = JSON.parse(readFileSync(out, 'utf8'));
    const committed = JSON.parse(readFileSync(COMMITTED, 'utf8'));

    const result = compareConstitutionArtifacts(committed, fresh);
    assert.equal(
      result.fresh,
      true,
      `${JSON.stringify(result.differences, null, 2)}\n${result.remedy}`
    );
  } finally {
    if (previous === undefined) delete process.env.CONSTITUTION_DOCTOR_OUT;
    else process.env.CONSTITUTION_DOCTOR_OUT = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('provenance alone does not make an artifact stale', () => {
  // Without this the test above could be satisfied by comparing nothing, or by
  // a stable() that strips so much the comparison is vacuous.
  const committed = JSON.parse(readFileSync(COMMITTED, 'utf8'));
  const restamped = { ...committed, sourceSha: '0'.repeat(40), generatedAt: '1999-01-01T00:00:00.000Z' };
  assert.equal(compareConstitutionArtifacts(committed, restamped).fresh, true, 'a re-stamped artifact is still current');

  // The set is exactly two keys. Widening it is how a freshness check stops
  // checking, so the width is asserted rather than assumed.
  assert.deepEqual([...PROVENANCE_KEYS], ['sourceSha', 'generatedAt']);

  const changed = structuredClone(committed);
  changed.counts.mutationAnchorsAvailable += 1;
  const drifted = compareConstitutionArtifacts(committed, changed);
  assert.equal(drifted.fresh, false, 'a substantive change must not be stripped by the comparison');
  assert.ok(drifted.differences.some(row => row.field === 'counts.mutationAnchorsAvailable'));
  assert.notEqual(stableForComparison(committed), stableForComparison(changed));
});
