#!/usr/bin/env node
// PHASE 3: the claims this repository makes about itself, and what backs them.
//
// Artifacts assert things -- softwareOpen is 1, 490 mutations were killed, the
// deployment state is unknown, canonical V9 is not materialized. Each of those
// is a claim, and each was true of some tree at some moment. Nothing checked
// whether that moment is this one.
//
// That has already gone wrong twice here. A constitution artifact merged saying
// 464 mutation anchors against a tree holding 469, and a readiness artifact
// described a commit whose source had since changed. Both were caught by a gate
// written after the fact. This asks the question for every claim at once: what
// asserts it, what evidence supports it, and was that evidence produced at the
// head we are standing on?
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'artifacts/v7/claim-evidence-registry.json';

const readJson = path => {
  try { return JSON.parse(readFileSync(resolve(root, path), 'utf8')); } catch { return null; }
};

// Only source changes can falsify a computed claim. Regenerated artifacts and
// documentation cannot, and they are what every commit of this kind touches.
const SOURCE_PREFIX = /^(src|scripts|config|migrations|tests)\//;

/**
 * Whether an artifact produced at `sha` still describes this tree.
 *
 * Comparing against HEAD alone is unsatisfiable: committing the artifact changes
 * HEAD, so a registry generated immediately before a commit is stale the moment
 * it lands. The question that actually matters is the one canon-freshness asks
 * -- has any source the claim depends on changed since it was measured? An
 * artifact naming the parent commit with no source changed after it is still
 * describing this tree, and saying otherwise would train a reader to ignore the
 * word stale.
 */
function sourceChangedSince(sha, head) {
  if (!sha || sha === head) return [];
  const out = (() => {
    try { return execFileSync('git', ['diff', '--name-only', `${sha}..${head}`], { cwd: root, encoding: 'utf8' }); }
    catch { return null; }
  })();
  // An unreadable range means the recorded commit is unreachable -- rewritten,
  // or from another branch. That is not "no changes"; it is a claim whose basis
  // cannot be found, which is worse than stale.
  if (out === null) return ['<unreachable-commit>'];
  return out.split('\n').map(line => line.trim()).filter(Boolean).filter(name => SOURCE_PREFIX.test(name));
}

// Each claim names the artifact asserting it, how to pull the value, and which
// field carries the head that artifact was generated against. A claim whose
// artifact records no head cannot be checked for freshness and says so.
const CLAIMS = [
  {
    id: 'CLM-SOFTWARE-OPEN',
    claim: 'Open software gaps remaining in the V7 ledger',
    artifact: 'artifacts/v7/gap-ledger.json',
    value: a => a?.summary?.softwareOpen,
    shaField: a => a?.sourceSha,
    evidenceClass: 'COMPUTED_BY_CHECKS',
    note: 'Every gap ran a check. The number is a measurement, not a label.'
  },
  {
    id: 'CLM-SOURCE-SIDE-COMPLETE',
    claim: 'Whether the V7 completion law is satisfied on the source side',
    artifact: 'artifacts/v7/gap-ledger.json',
    value: a => a?.summary?.sourceSideComplete,
    shaField: a => a?.sourceSha,
    evidenceClass: 'COMPUTED_BY_CHECKS'
  },
  {
    id: 'CLM-MUTATION-ANCHORS',
    claim: 'Mutation guards registered in the harness',
    artifact: 'artifacts/constitution/directives.json',
    value: a => a?.counts?.mutationAnchorsAvailable,
    shaField: a => a?.sourceSha,
    evidenceClass: 'COMPUTED_FROM_SOURCE',
    note: 'Registered, not killed. A registered guard that was never run proves nothing.'
  },
  {
    id: 'CLM-GUARD-BACKED-DIRECTIVES',
    claim: 'Constitutional directives backed by a mutation-killed guard',
    artifact: 'artifacts/constitution/directives.json',
    value: a => a?.counts?.withMutationGuard,
    shaField: a => a?.sourceSha,
    evidenceClass: 'VOCABULARY_LINKAGE_TO_A_KILLED_GUARD',
    note: 'The linkage is term overlap between a directive and a guard description. It shows a guard exists on the same subject, not that it enforces this sentence.'
  },
  {
    id: 'CLM-PROOF-DEBT',
    claim: 'Rules that could be settled by code and are not',
    artifact: 'artifacts/v7/proof-obligations.json',
    value: a => a?.counts?.outstandingAndDischargeableByCode,
    shaField: a => a?.sourceSha,
    evidenceClass: 'COMPUTED_FROM_SOURCE'
  },
  {
    id: 'CLM-DEPLOYMENT-STATE',
    claim: 'UberBond deployment state',
    artifact: 'artifacts/ubercel/deployment-signals.json',
    value: a => (a?.signals ?? []).some(s => s.contractBound) ? 'CONTRACT_BOUND_EVIDENCE_EXISTS' : 'PROVIDER_BADGES_ONLY',
    shaField: () => null,
    evidenceClass: 'OBSERVED_BY_A_THIRD_PARTY',
    note: 'The recorded probe was observed by the deployment session, not by any session that wrote this registry. Its freshness is time-based, not head-based.'
  },
  {
    id: 'CLM-CANONICAL-V9',
    claim: 'Whether canonical V9 can be reconstructed from the carrier',
    // Pointed at the gap ledger rather than the blocker document. The ledger
    // re-runs the materializer on every head; the blocker document is a written
    // record of one investigation and goes stale by design. A claim should cite
    // the thing that re-measures it, not the thing that described it once.
    artifact: 'artifacts/v7/gap-ledger.json',
    value: a => (a?.gaps ?? []).find(g => g.id === 'V7G001-CANONICAL-V9-NOT-MATERIALIZED')?.status ?? 'UNKNOWN',
    shaField: a => a?.sourceSha,
    evidenceClass: 'REPRODUCIBLE_BY_RUNNING_THE_MATERIALIZER',
    note: 'The ledger check runs scripts/materialize-inevitability-v9.py at the head it reports. The narrative record lives at artifacts/v9/canonical-v9-materialization-blocker.json.'
  },
  {
    id: 'CLM-EXTERNAL-ECONOMIC-EVIDENCE',
    claim: 'Cleared payments and accepted deliveries',
    artifact: 'artifacts/nullstar-terminal/completion-debt.json',
    value: a => {
      const row = (a?.items ?? []).find(i => i.id === 'CD007-NO-EXTERNAL-ECONOMIC-EVIDENCE');
      return row ? (row.open ? 'NONE' : 'PRESENT') : 'UNKNOWN';
    },
    shaField: a => a?.sourceCommit,
    evidenceClass: 'ABSENCE_OF_EXTERNAL_RECEIPTS',
    note: 'An absence claim. It can be falsified by one real receipt and cannot be strengthened by any amount of internal work.'
  }
];

function main() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const rows = CLAIMS.map(spec => {
    const artifact = readJson(spec.artifact);
    if (!artifact) {
      return {
        id: spec.id, claim: spec.claim, artifact: spec.artifact,
        value: null, evidenceClass: spec.evidenceClass,
        freshness: 'ARTIFACT_MISSING', note: spec.note ?? null
      };
    }
    const sha = spec.shaField(artifact);
    const changed = sourceChangedSince(sha, head);
    // Three distinct freshness answers, because "no head recorded" is not the
    // same as "recorded a head whose source has since changed", and neither is
    // the same as current.
    const freshness = sha == null ? 'NOT_HEAD_BOUND'
      : changed.length === 0 ? 'EXACT_HEAD'
        : 'STALE_AGAINST_CURRENT_HEAD';
    return {
      id: spec.id,
      claim: spec.claim,
      artifact: spec.artifact,
      value: spec.value(artifact) ?? null,
      evidenceClass: spec.evidenceClass,
      producedAtSha: sha,
      freshness,
      sourceChangedSince: changed.length ? changed.slice(0, 5) : [],
      note: spec.note ?? null
    };
  });

  const counts = rows.reduce((acc, row) => ({ ...acc, [row.freshness]: (acc[row.freshness] || 0) + 1 }), {});
  const artifact = {
    schemaVersion: 'uberbond.v7-claim-evidence-registry.v1',
    generatedAt: new Date().toISOString(),
    sourceSha: head,
    generator: 'scripts/v7-claim-evidence-registry.mjs',
    freshnessPolicy: 'A claim is stale when source it depends on changed after it was measured, not merely when the head moved. Committing a regenerated artifact changes the head and falsifies nothing.',
    counts,
    boundary: 'This records what backs a claim and how fresh it is. It does not re-derive the claim, so a wrong measurement recorded at the exact head still reads EXACT_HEAD.',
    uncertainty: 'NOT_HEAD_BOUND is common and correct for time-based evidence such as a health probe. It is not a failure.',
    rows,
    externalEffects: [],
    businessEffectAuthority: 'NONE'
  };

  mkdirSync(resolve(root, dirname(OUT)), { recursive: true });
  writeFileSync(resolve(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`v7 claim-evidence registry @ ${head.slice(0, 8)}  (${rows.length} claims)`);
  for (const row of rows) {
    console.log(`  ${String(row.freshness).padEnd(28)} ${row.id.padEnd(32)} ${JSON.stringify(row.value)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main, CLAIMS };
