#!/usr/bin/env node
// Maps every artifact the V7 contract names to what actually exists.
//
// The contract lists 31 machine-readable artifacts and says: "Create or upgrade,
// reusing existing current source when equivalent capability already exists."
// Those two halves pull opposite ways. Generating 31 files to match the list
// would produce mostly stubs and bury the few that carry real measurement.
// Generating only some would silently drop the rest.
//
// So this resolves each name to one of three honest states -- generated here,
// already covered by an existing artifact, or genuinely absent -- and the absent
// ones stay listed and counted. An artifact nobody has is a gap, and a gap is
// worth more visible than papered over with an empty file.
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'artifacts/v7/artifact-index.json';
const has = p => existsSync(resolve(root, p));

// name -> where the capability actually lives. `covers` names an existing
// artifact that already carries this content under a different path; a name with
// neither a generator nor a cover is absent and says so.
const CONTRACT = {
  'artifacts/v7/live-truth.json': { generator: 'scripts/v7-live-truth.mjs' },
  'artifacts/v7/gap-ledger.json': { generator: 'scripts/v7-gap-ledger.mjs' },
  'artifacts/v7/directive-dag.json': { covers: 'artifacts/constitution/directives.json', note: 'Directive objects with dependencies/conflicts/supersedes fields. The DAG edges themselves are still uncomputed.' },
  'artifacts/v7/conflict-graph.json': { covers: 'artifacts/constitution/directives.json', note: 'conflictGraph, with precedence resolvability per candidate.' },
  'artifacts/v7/supersession-graph.json': { covers: 'artifacts/constitution/directives.json', note: 'precedence ranks and the declared terminal-source exclusion. Supersession edges between individual directives are uncomputed.' },
  'artifacts/v7/coverage-graph.json': { covers: 'artifacts/constitution/directives.json', note: 'coverageBySource: directives, guarded, external-effect and guarded-external-effect per canon file.' },
  'artifacts/v7/proof-obligations.json': { generator: 'scripts/v7-proof-obligations.mjs' },
  'artifacts/v7/claim-evidence-registry.json': { generator: 'scripts/v7-claim-evidence-registry.mjs' },
  'artifacts/v7/proof-debt.json': { covers: 'artifacts/constitution/reviewed-linkage-findings.json', note: 'Directives reported unguarded, each read and classified, with residuals named per entry.' },
  'artifacts/v7/mission-dag.json': { generator: 'scripts/v7-frontier-artifacts.mjs' },
  'artifacts/v7/resource-allocation.json': { generator: 'scripts/v7-frontier-artifacts.mjs' },
  'artifacts/v7/evaluation-epoch.json': { generator: 'scripts/v7-frontier-artifacts.mjs' },
  'artifacts/v7/baselines.json': { generator: 'scripts/v7-frontier-artifacts.mjs' },
  'artifacts/v7/world-frontier.json': { absent: true, absenceReason: 'NEEDS_EXTERNAL_REALITY', note: 'Live world-frontier sensing requires authorized external research this session has no authority to perform.' },
  'artifacts/v7/global-dominance-graph.json': { absent: true, absenceReason: 'NEEDS_EXTERNAL_REALITY', note: 'A comparison against external systems requires measuring them. Unavailable comparators stay unmeasured rather than becoming imagined scores.' },
  'artifacts/v7/singularity-barrier-graph.json': { absent: true, absenceReason: 'NEEDS_EXTERNAL_REALITY', note: 'Barriers are defined against measured capability, which needs the comparators above.' },
  'artifacts/v7/quadrillion-runtime-status.json': { absent: true, absenceReason: 'NEEDS_A_RUNTIME_THAT_DOES_NOT_EXIST', note: 'There is no lattice search runtime to report the status of. The doctrine warns against confusing a quadrillion-cell spec with an implemented search engine, and an artifact reporting the status of nothing would be that confusion in file form.' },
  'artifacts/v7/improvement-generations.jsonl': { absent: true, absenceReason: 'NEEDS_REPEATED_OBSERVATION', note: 'A generation ledger needs more than one measured generation. One entry is not a series, and fitting a trend to it would be the error the doctrine names.' },
  'artifacts/v7/meta-improvement-generations.jsonl': { absent: true, absenceReason: 'NEEDS_REPEATED_OBSERVATION', note: 'Same, one level up: improving the improver needs improvements to compare.' },
  'artifacts/v7/transfer-ledger.jsonl': { absent: true, absenceReason: 'NEEDS_REPEATED_OBSERVATION', note: 'Cross-organ transfer needs a measured transfer to record.' },
  'artifacts/v7/deployment-evidence.json': { covers: 'artifacts/ubercel/deployment-signals.json', note: 'Deployment signals with evidence class per signal; provider badges recorded as establishing nothing.' },
  'artifacts/v7/runtime-endurance.json': { absent: true, absenceReason: 'NEEDS_ELAPSED_TIME', note: 'Endurance is elapsed unattended operation. It cannot be computed, only waited for and observed.' },
  'artifacts/v7/science-ledger.jsonl': { absent: true, absenceReason: 'NEEDS_REPEATED_OBSERVATION', note: 'Requires experiments that have actually run.' },
  'artifacts/v7/life-delta-ledger.jsonl': { absent: true, absenceReason: 'NEEDS_EXTERNAL_REALITY', note: 'Life outcomes are observed in the founder\u2019s life, not computed from a repository.' },
  'artifacts/v7/economic-delta-ledger.jsonl': { absent: true, absenceReason: 'NEEDS_EXTERNAL_REALITY', note: 'Requires the cleared payment that V7G006 is blocked on.' },
  'artifacts/v7/reality-debt.json': { covers: 'artifacts/nullstar-terminal/completion-debt.json', note: 'CD001-CD013 with computed open/closed status; CD006 and CD007 remain the external economic gates.' },
  'artifacts/v7/founder-authority-ledger.json': { covers: 'artifacts/constitution/open-founder-decisions.json', note: 'FD002: the operative canon carries no authored precedence.' },
  'artifacts/v7/frontier-checkpoint.json': { generator: 'scripts/v7-frontier-artifacts.mjs' },
  'artifacts/v7/final-frontier-state.json': { generator: 'scripts/v7-frontier-artifacts.mjs' }
};

function main() {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const rows = Object.entries(CONTRACT).map(([name, spec]) => {
    if (spec.generator) {
      const present = has(name);
      return {
        artifact: name, state: present ? 'GENERATED' : 'GENERATOR_DECLARED_NOT_YET_RUN',
        generator: spec.generator,
        bytes: present ? statSync(resolve(root, name)).size : 0,
        note: spec.note ?? null
      };
    }
    if (spec.covers) {
      const present = has(spec.covers);
      return {
        artifact: name,
        state: present ? 'COVERED_BY_EXISTING_ARTIFACT' : 'COVER_DECLARED_BUT_MISSING',
        coveredBy: spec.covers,
        bytes: present ? statSync(resolve(root, spec.covers)).size : 0,
        note: spec.note ?? null
      };
    }
    return {
      artifact: name, state: 'ABSENT', coveredBy: null,
      // A count of absent artifacts is not actionable; the reason one is absent
      // is. COMPUTABLE_NOW is work waiting to be done. The rest are waiting on
      // something no amount of writing produces.
      absenceReason: spec.absenceReason ?? 'UNCLASSIFIED',
      note: spec.note ?? null
    };
  });

  const counts = rows.reduce((acc, row) => ({ ...acc, [row.state]: (acc[row.state] || 0) + 1 }), {});
  const absenceReasons = rows.filter(row => row.state === 'ABSENT')
    .reduce((acc, row) => ({ ...acc, [row.absenceReason]: (acc[row.absenceReason] || 0) + 1 }), {});
  const artifact = {
    schemaVersion: 'uberbond.v7-artifact-index.v1',
    generatedAt: new Date().toISOString(),
    sourceSha,
    generator: 'scripts/v7-artifact-index.mjs',
    freshnessPolicy: 'Recomputed from the filesystem on every run. A state here is a statSync result, not a claim.',
    contractSource: 'MANDATORY MACHINE-READABLE V7 ARTIFACTS, from the recoverable V7 ancestor',
    counts,
    absenceReasons,
    honesty: 'ABSENT is a real answer and is counted. Generating an empty file to move a name out of that column would satisfy the list and lose the information.',
    unclassifiedAbsences: rows.filter(row => row.state === 'ABSENT' && row.absenceReason === 'UNCLASSIFIED').map(row => row.artifact),
    rows,
    uncertainty: 'COVERED_BY_EXISTING_ARTIFACT means an existing artifact carries this content, not that it carries it in the shape the contract names. Each cover states what it actually holds.',
    externalEffects: [],
    businessEffectAuthority: 'NONE'
  };

  mkdirSync(resolve(root, dirname(OUT)), { recursive: true });
  writeFileSync(resolve(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`v7 artifact index @ ${sourceSha.slice(0, 8)}  (${rows.length} named by the contract)`);
  for (const [state, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)} ${state}`);
  }
  for (const [reason, count] of Object.entries(absenceReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(count).padStart(3)} absent: ${reason}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main, CONTRACT };
