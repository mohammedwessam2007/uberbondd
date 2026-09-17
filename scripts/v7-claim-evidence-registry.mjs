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
    // Three distinct freshness answers, because "no head recorded" is not the
    // same as "recorded a different head" and neither is the same as current.
    const freshness = sha == null ? 'NOT_HEAD_BOUND'
      : sha === head ? 'EXACT_HEAD'
        : 'STALE_AGAINST_CURRENT_HEAD';
    return {
      id: spec.id,
      claim: spec.claim,
      artifact: spec.artifact,
      value: spec.value(artifact) ?? null,
      evidenceClass: spec.evidenceClass,
      producedAtSha: sha,
      freshness,
      note: spec.note ?? null
    };
  });

  const counts = rows.reduce((acc, row) => ({ ...acc, [row.freshness]: (acc[row.freshness] || 0) + 1 }), {});
  const artifact = {
    schemaVersion: 'uberbond.v7-claim-evidence-registry.v1',
    generatedAt: new Date().toISOString(),
    sourceSha: head,
    generator: 'scripts/v7-claim-evidence-registry.mjs',
    freshnessPolicy: 'Each claim is compared against the current head at run time. STALE_AGAINST_CURRENT_HEAD means the artifact asserting it described a different tree.',
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
