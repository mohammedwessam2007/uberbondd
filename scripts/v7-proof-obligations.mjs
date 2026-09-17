#!/usr/bin/env node
// PHASE 3: what each rule would require as proof, and what it actually has.
//
// The constitution doctor already answers "is this directive backed by a
// mutation-killed guard?" This asks the question one step earlier: what kind of
// evidence would settle this rule at all? A prohibition on an external effect
// can be settled by a guard that removes the protection and watches a test go
// red. A rule about what to optimize for cannot be settled that way by anyone,
// because there is no code path to remove.
//
// Collapsing those two into one "unguarded" count is what produced a review
// queue that read as a defect list. An obligation nobody can discharge is not
// debt; it is a rule of a different kind, and the difference is worth computing
// rather than re-deriving by reading every time.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'artifacts/v7/proof-obligations.json';

// What would actually settle a rule of this shape. The order matters: the first
// match wins, and the most demanding obligation is tested first so a rule that
// could be settled by a guard is never filed under something weaker.
const OBLIGATION_KINDS = Object.freeze([
  {
    kind: 'MUTATION_GUARD',
    dischargeableBy: 'A test that fails when the protection is removed, plus a guard that performs the removal.',
    applies: row => row.authorityClass === 'EXTERNAL_EFFECT' && row.class === 'PROHIBITION'
  },
  {
    kind: 'EXECUTABLE_CHECK',
    dischargeableBy: 'A test or doctor that reads the repository and reports whether the obligation holds.',
    applies: row => row.class === 'OBLIGATION' && row.authorityClass === 'EXTERNAL_EFFECT'
  },
  {
    kind: 'INTERNAL_TEST',
    dischargeableBy: 'An ordinary test over the module the rule governs.',
    applies: row => row.class === 'PROHIBITION' || row.class === 'OBLIGATION'
  },
  {
    kind: 'NOT_DISCHARGEABLE_BY_CODE',
    dischargeableBy: 'Nothing in software. A permission grants latitude, so there is no failure state to catch.',
    applies: row => row.class === 'PERMISSION'
  }
]);

function classify(row) {
  return OBLIGATION_KINDS.find(entry => entry.applies(row)) ?? {
    kind: 'UNCLASSIFIED',
    dischargeableBy: 'Unknown. A directive reaching here was not matched by any obligation kind, which is a defect in this classifier rather than a property of the rule.'
  };
}

function main() {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const constitution = JSON.parse(readFileSync(resolve(root, 'artifacts/constitution/directives.json'), 'utf8'));

  const rows = constitution.directives.map(row => {
    const obligation = classify(row);
    const guarded = Boolean(row.mutationGuards?.length);
    const mentioned = Boolean(row.tests?.length);
    // Discharged only where the obligation's own bar is met. A guard discharges
    // a MUTATION_GUARD obligation; a test merely mentioning the subject does not.
    const discharged = obligation.kind === 'MUTATION_GUARD' ? guarded
      : obligation.kind === 'EXECUTABLE_CHECK' ? guarded
        : obligation.kind === 'INTERNAL_TEST' ? guarded || mentioned
          : obligation.kind === 'NOT_DISCHARGEABLE_BY_CODE' ? null
            : false;
    return {
      id: row.id,
      provenance: row.provenance,
      class: row.class,
      authorityClass: row.authorityClass,
      obligationKind: obligation.kind,
      dischargeableBy: obligation.dischargeableBy,
      discharged,
      mutationGuards: row.mutationGuards ?? [],
      testsMentioning: (row.tests ?? []).length
    };
  });

  const byKind = {};
  for (const row of rows) {
    const bucket = byKind[row.obligationKind] ?? { total: 0, discharged: 0, outstanding: 0, notApplicable: 0 };
    bucket.total += 1;
    if (row.discharged === true) bucket.discharged += 1;
    else if (row.discharged === false) bucket.outstanding += 1;
    else bucket.notApplicable += 1;
    byKind[row.obligationKind] = bucket;
  }

  // The number worth reporting: rules that could be settled by code and are not.
  const realDebt = rows.filter(row => row.discharged === false
    && ['MUTATION_GUARD', 'EXECUTABLE_CHECK'].includes(row.obligationKind));

  const artifact = {
    schemaVersion: 'uberbond.v7-proof-obligations.v1',
    generatedAt: new Date().toISOString(),
    sourceSha,
    generator: 'scripts/v7-proof-obligations.mjs',
    constitutionVersion: constitution.version ?? constitution.schemaVersion ?? null,
    inputHashes: { constitution: constitution.sourceSha ?? null },
    freshnessPolicy: 'Recomputed from artifacts/constitution/directives.json, which has its own freshness gate. A stale constitution makes this stale too.',
    counts: { directives: rows.length, byKind, outstandingAndDischargeableByCode: realDebt.length },
    outstandingAndDischargeableByCode: realDebt.map(row => ({ id: row.id, provenance: row.provenance, obligationKind: row.obligationKind })),
    boundary: 'An obligation kind says what would settle a rule, not that the rule is currently obeyed. NOT_DISCHARGEABLE_BY_CODE is a property of the rule, not a hole.',
    uncertainty: 'The classifier reads a directive’s class and authority tag. A rule miscategorised upstream is miscategorised here.',
    rows,
    externalEffects: [],
    businessEffectAuthority: 'NONE'
  };

  mkdirSync(resolve(root, dirname(OUT)), { recursive: true });
  writeFileSync(resolve(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`v7 proof obligations @ ${sourceSha.slice(0, 8)}  (${rows.length} directives)`);
  for (const [kind, bucket] of Object.entries(byKind)) {
    console.log(`  ${kind.padEnd(28)} ${bucket.total.toString().padStart(3)} total, ${bucket.discharged} discharged, ${bucket.outstanding} outstanding, ${bucket.notApplicable} n/a`);
  }
  console.log(`  dischargeable by code and not discharged: ${realDebt.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main, OBLIGATION_KINDS, classify };
