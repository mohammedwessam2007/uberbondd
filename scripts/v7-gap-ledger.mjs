#!/usr/bin/env node
// Recomputes the V7 gap ledger from current source. PHASE 1.
//
// Every gap below owns a check that reads the repository at the exact head it
// runs against. None of them carries a writable status. Running this file is the
// only thing that decides what is open.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGap, validateGapRow, summarizeGaps, V7_GAP_LEDGER_VERSION } from '../src/v7-gap-ledger.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.V7_GAP_LEDGER_OUT || 'artifacts/v7/gap-ledger.json';

const read = path => readFileSync(resolve(root, path), 'utf8');
const readJson = path => JSON.parse(read(path));
const has = path => existsSync(resolve(root, path));

function sh(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim(); }
  catch (error) { return (error.stdout || '').trim(); }
}

const GAPS = [
  {
    id: 'V7G001-CANONICAL-V9-NOT-MATERIALIZED',
    title: 'Canonical V9 cannot be reconstructed from the carrier in this repository',
    family: 'EXTERNAL',
    statement: 'CLAUDE_START_V9.md requires LOSSLESS_VERIFIED at SHA 8ad73f53...e55d. Seed part 16 is short 4,823 binary bytes of LZMA-compressed V7 content that exists in no git object.',
    whyItMatters: 'Every directive in canonical V9 is unreadable until this closes. The program is currently executed from its V7 ancestor, which is explicitly not the same document.',
    implementationPath: 'None. The missing bytes are compressed content, not a derivable checksum.',
    externalEvidenceRequired: 'The exact V7 source (1,916,551 bytes, sha de93cca3) or the canonical V9 file itself.',
    authorityRequired: 'Founder or the host that authored the carrier.',
    unblockCondition: 'The founder supplies the V7 or V9 file; part 16 is re-encoded from it and the materializer prints LOSSLESS_VERIFIED against the unmodified manifest.',
    nextExperiment: 'None available in-repository. Six recovery mechanisms were tested with certain outcomes.',
    check: () => {
      const out = sh('python3', [resolve(root, 'scripts/materialize-inevitability-v9.py')]);
      let report = {};
      try { report = JSON.parse(out); } catch { /* non-JSON means the script itself failed */ }
      if (report.status === 'LOSSLESS_VERIFIED') {
        return { status: 'CLOSED', closureEvidence: `materializer reports LOSSLESS_VERIFIED at ${report.sha256}`, measured: report };
      }
      return {
        status: 'EXTERNAL_BLOCKED',
        sourceEvidence: [`materializer: ${report.status || 'no parseable report'}`, `missing ${report.missingEncodedBytes ?? '?'} encoded bytes in ${report.unrecoverable?.[0]?.file ?? 'unknown part'}`],
        measured: { partsVerified: report.partsVerified, partsUnrecoverable: report.partsUnrecoverable }
      };
    }
  },
  {
    id: 'V7G002-OPERATIVE-CANON-UNRANKED',
    title: 'The precedence law cannot settle any conflict between operative rules',
    family: 'FOUNDER',
    statement: 'docs/NORTH_STAR_PRECEDENCE.md ranks 10 files, of which exactly 1 is compiled as operative canon. The other 8 operative sources carry no relative rank.',
    whyItMatters: 'Nine conflict candidates are detected between operative rules and none has an authored answer, including a live one between the Wallbreaker prohibition on evading provider limits and the CLAUDE.md failover permission.',
    implementationPath: 'Already built: precedenceFor returns UNRANKED rather than 0, resolveByPrecedence refuses and names the source needing a rank.',
    externalEvidenceRequired: null,
    authorityRequired: 'Founder. Ranking one canon file above another is a constitutional amendment (F003).',
    unblockCondition: 'The founder ranks the operative canon in docs/NORTH_STAR_PRECEDENCE.md. The ranks are parsed from that file, so the conflict graph resolves with no code change.',
    nextExperiment: 'None. Inventing an order would be legislating.',
    check: () => {
      const directives = readJson('artifacts/constitution/directives.json');
      const unranked = directives.precedence?.operativeSourcesUnranked ?? [];
      const unresolved = (directives.conflictGraph ?? []).filter(row => !row.precedenceResolvable).length;
      if (!unranked.length) {
        return { status: 'CLOSED', closureEvidence: 'every operative source carries an authored precedence rank' };
      }
      return {
        status: 'FOUNDER_ONLY',
        sourceEvidence: [`${unranked.length} operative sources unranked`, `${unresolved} conflict candidates unresolvable`],
        measured: { unranked, unresolvedConflicts: unresolved }
      };
    }
  },
  {
    id: 'V7G003-DEPLOYMENT-HAS-NO-CONTRACT-BOUND-HEALTH-EVIDENCE',
    title: 'Deployment state rests on evidence that has expired',
    family: 'EXTERNAL',
    statement: 'A health contract is declared and one contract-bound probe is recorded, so Ubercel now reports UNKNOWN__EVIDENCE_STALE rather than UNKNOWN__ONLY_PROVIDER_BADGES. Establishing the present state needs a fresh probe.',
    whyItMatters: 'The difference between "we have no way to know" and "we knew, and the knowledge expired" is the whole point of this doctor. Only the second is a waiting problem.',
    implementationPath: 'Done. src/ubercel-health-evidence.mjs converts a probe into a contract-bound signal and scripts/ubercel-record-health.mjs writes it. Neither makes a network call, so running them cannot manufacture the evidence.',
    externalEvidenceRequired: 'A fresh probe of the declared health ref by something with network authority.',
    authorityRequired: 'Network/deployment authority to call the live service. This session has no authority to probe an external host.',
    unblockCondition: 'Any authorized caller records a contract-bound probe younger than the doctor freshness window, after which the state becomes SERVING or NOT_SERVING.',
    nextExperiment: 'A scheduled probe job, or one authorized manual probe piped into scripts/ubercel-record-health.mjs.',
    check: () => {
      const out = sh('node', [resolve(root, 'scripts/ubercel-doctor.mjs')]);
      const state = (out.match(/state:\s*(\S+)/) || [])[1] || 'UNREADABLE';
      if (state.startsWith('SERVING') || state.startsWith('NOT_SERVING')) {
        return { status: 'CLOSED', closureEvidence: `ubercel reports ${state} from contract-bound evidence` };
      }
      // Three unknowns that are not the same problem. Only the stale one is
      // waiting on time; the other two are waiting on software that now exists.
      if (state === 'UNKNOWN__EVIDENCE_STALE') {
        return {
          status: 'EXTERNAL_BLOCKED',
          sourceEvidence: ['a contract-bound probe exists and has aged out of the freshness window'],
          measured: { state }
        };
      }
      return {
        status: 'OPEN',
        sourceEvidence: [`ubercel state: ${state}`, 'no contract-bound probe has ever been recorded'],
        measured: { state }
      };
    }
  },
  {
    id: 'V7G004-UNGUARDED-EXTERNAL-EFFECT-DIRECTIVES',
    title: 'External-effect directives with no mutation-killed guard behind them',
    family: 'SOFTWARE',
    statement: 'The constitution doctor reports external-effect rules the guard matcher cannot link to any mutation guard.',
    whyItMatters: 'An unguarded external-effect rule can be broken in code with every check green. Four genuine holes were found this way; the rest were measurement artifacts.',
    implementationPath: 'Read each reported directive, classify it, and close genuine holes with a test that fails when the protection is removed plus a guard that runs it.',
    externalEvidenceRequired: null,
    authorityRequired: null,
    unblockCondition: null,
    nextExperiment: 'Continue reading newly-reported directives as the canon grows.',
    check: () => {
      const directives = readJson('artifacts/constitution/directives.json');
      const review = has('artifacts/constitution/reviewed-linkage-findings.json')
        ? readJson('artifacts/constitution/reviewed-linkage-findings.json') : { findings: [] };
      const unreviewed = (review.findings || []).filter(row => row.reviewClass === 'UNREVIEWED').length;
      const unguarded = directives.counts.externalEffect - directives.counts.externalEffectWithMutationGuard;
      if (unreviewed === 0) {
        return {
          status: 'CLOSED',
          closureEvidence: `${review.findings.length} entries read, 0 unread; ${unguarded} remain unguarded by the matcher and each is classified`,
          measured: { unguardedByMatcher: unguarded, reviewed: review.findings.length, unreviewed }
        };
      }
      return { status: 'OPEN', sourceEvidence: [`${unreviewed} reported directives not yet read`], measured: { unguardedByMatcher: unguarded, unreviewed } };
    }
  },
  {
    id: 'V7G005-VERIFIED-WORK-STRANDED-OFF-MAIN',
    title: 'Verified work sitting on a branch and not in main',
    family: 'SOFTWARE',
    statement: 'The completion law requires that no verified intended work is stranded off main.',
    whyItMatters: 'Work that exists only on a branch is work the next session will not find and may rebuild.',
    implementationPath: 'Merge or explicitly classify every branch carrying content not in main.',
    externalEvidenceRequired: null,
    authorityRequired: null,
    unblockCondition: null,
    nextExperiment: 'Re-measure after each merge.',
    check: () => {
      const head = sh('git', ['rev-parse', 'HEAD']);
      const mainSha = sh('git', ['rev-parse', 'origin/main']);
      const ahead = Number(sh('git', ['rev-list', '--count', `${mainSha}..${head}`]) ?? 0);
      const behind = Number(sh('git', ['rev-list', '--count', `${head}..${mainSha}`]) ?? 0);
      // Uncommitted work is stranded in the most literal sense: it exists on one
      // disk and nowhere else. Counting only commits ahead reported "nothing
      // stranded" while this very check sat unsaved in the working tree.
      const dirty = (sh('git', ['status', '--porcelain']) ?? '').split('\n').filter(Boolean);
      if (ahead === 0 && dirty.length === 0) {
        return { status: 'CLOSED', closureEvidence: 'the working branch carries nothing main does not have, and the tree is clean', measured: { ahead: 0, behind, uncommitted: 0 } };
      }
      return {
        status: 'OPEN',
        sourceEvidence: [
          ...(ahead ? [`${ahead} commits on this branch are not in main`] : []),
          ...(dirty.length ? [`${dirty.length} uncommitted path(s) exist only on this disk`] : [])
        ],
        measured: { ahead, behind, uncommitted: dirty.length, firstUncommitted: dirty[0]?.slice(3) ?? null }
      };
    }
  },
  {
    id: 'V7G006-NO-EXTERNAL-ECONOMIC-EVIDENCE',
    title: 'No cleared payment, accepted delivery, or customer response exists',
    family: 'EXTERNAL',
    statement: 'The repository holds no durable provider receipt for a cleared payment or an accepted delivery.',
    whyItMatters: 'Every commercial claim in the canon is architecture until one real receipt exists. This is the difference between a system that could earn and one that has.',
    implementationPath: 'None in software. The machinery exists; the event has not happened.',
    externalEvidenceRequired: 'A durable provider receipt for a real cleared payment, and a customer acceptance record.',
    authorityRequired: 'Founder spend/contact authority and a real buyer.',
    unblockCondition: 'One cleared payment witnessed by a provider reaches durable storage.',
    nextExperiment: 'Owner-authorized activation of the prepared canary.',
    check: () => {
      if (!has('artifacts/nullstar-terminal/completion-debt.json')) {
        return { status: 'EXTERNAL_BLOCKED', sourceEvidence: ['no completion-debt ledger to read'] };
      }
      const ledger = readJson('artifacts/nullstar-terminal/completion-debt.json');
      const item = (ledger.items || []).find(row => row.id === 'CD007-NO-EXTERNAL-ECONOMIC-EVIDENCE');
      if (item && item.open === false) {
        return { status: 'CLOSED', closureEvidence: item.evidence || 'completion-debt ledger reports it closed' };
      }
      return { status: 'EXTERNAL_BLOCKED', sourceEvidence: ['CD007 open in the completion-debt ledger'] };
    }
  },
  {
    id: 'V7G007-PROVIDER-EVALUATION-BLOCKED',
    title: 'No configured model provider to evaluate routing against',
    family: 'EXTERNAL',
    statement: 'Model routing, failover and the capability genome cannot be measured against real providers because none is configured on this host.',
    whyItMatters: 'Routing correctness is currently proven only against fixtures. Fixtures cannot show a provider behaving badly.',
    implementationPath: 'None in software without credentials.',
    externalEvidenceRequired: 'At least one legitimately configured provider with observable model identity.',
    authorityRequired: 'Founder provider credentials and spend authority.',
    unblockCondition: 'A configured provider appears in capabilities:doctor and one real routed call leaves a receipt naming the provider and model.',
    nextExperiment: 'Founder configures one provider; re-run capabilities:doctor.',
    check: () => {
      const ledger = has('artifacts/nullstar-terminal/completion-debt.json')
        ? readJson('artifacts/nullstar-terminal/completion-debt.json') : { items: [] };
      const item = (ledger.items || []).find(row => row.id === 'CD006-PROVIDER-EVALUATION-BLOCKED');
      if (item && item.open === false) return { status: 'CLOSED', closureEvidence: item.evidence || 'ledger reports it closed' };
      return { status: 'EXTERNAL_BLOCKED', sourceEvidence: ['CD006 open in the completion-debt ledger'] };
    }
  },
  {
    id: 'V7G008-EVERY-PRODUCTION-MODULE-GATED',
    title: 'Production-reachable modules that no gate executes',
    family: 'SOFTWARE',
    statement: 'The production-coverage ratchet requires that every module reachable from a production entry point is run by some suite.',
    whyItMatters: 'A defect in an ungated production module passes every check this repository has.',
    implementationPath: 'Add a suite, or classify the module as not production-reachable with a reason.',
    externalEvidenceRequired: null,
    authorityRequired: null,
    unblockCondition: null,
    nextExperiment: 'Re-run the ratchet after each merge from main.',
    check: () => {
      const out = sh('node', ['--test', resolve(root, 'tests/production-coverage-ratchet.test.mjs')]);
      const failed = /^# fail (\d+)/m.exec(out);
      const count = failed ? Number(failed[1]) : null;
      if (count === 0) return { status: 'CLOSED', closureEvidence: 'production-coverage ratchet passes at this head' };
      return { status: 'OPEN', sourceEvidence: [`production-coverage ratchet reports ${count ?? 'an unreadable number of'} failures`], measured: { failures: count } };
    }
  },
  {
    id: 'V7G010-CONTRACT-ARTIFACTS-AWAITING-REALITY',
    title: 'Artifacts that cannot be written until something outside the repository happens',
    family: 'EXTERNAL',
    statement: 'Eleven artifacts the contract names wait on external reality, repeated observation, elapsed unattended time, or a lattice runtime that does not exist.',
    whyItMatters: 'Writing them anyway would produce files describing nothing. A status report for a runtime that does not exist is the confusion the doctrine names, in file form.',
    implementationPath: 'None. Each names what it waits on in artifacts/v7/artifact-index.json.',
    externalEvidenceRequired: 'Measured comparators, real experiments, cleared payment, elapsed unattended operation, or a built lattice runtime.',
    authorityRequired: 'Varies per artifact: research authority, spend authority, or a founder decision to build the runtime.',
    unblockCondition: 'Each artifact unblocks when its own named condition is met. The index carries the reason per artifact and the gap closes when none is left waiting.',
    nextExperiment: 'None available in software. The nearest is a measured second improvement generation, which needs a first one to have been measured.',
    check: () => {
      if (!has('artifacts/v7/artifact-index.json')) return { status: 'OPEN', sourceEvidence: ['no artifact index to read'] };
      const index = readJson('artifacts/v7/artifact-index.json');
      const waiting = (index.rows || []).filter(row => row.state === 'ABSENT' && row.absenceReason !== 'COMPUTABLE_NOW' && row.absenceReason !== 'UNCLASSIFIED');
      if (!waiting.length) return { status: 'CLOSED', closureEvidence: 'no contract artifact is waiting on external reality' };
      return {
        status: 'EXTERNAL_BLOCKED',
        sourceEvidence: [`${waiting.length} contract artifacts wait on something no amount of writing produces`],
        measured: { byReason: waiting.reduce((acc, row) => ({ ...acc, [row.absenceReason]: (acc[row.absenceReason] || 0) + 1 }), {}) }
      };
    }
  },
  {
    id: 'V7G009-CONTRACT-ARTIFACTS-ABSENT',
    title: 'Artifacts the V7 contract names that could be written and have not been',
    family: 'SOFTWARE',
    statement: 'The contract names 29 machine-readable artifacts. The index resolves each to GENERATED, COVERED_BY_EXISTING_ARTIFACT, or ABSENT, and the absent ones are unwritten software.',
    whyItMatters: 'Without this gap the ledger reads sourceSideComplete while nineteen named artifacts do not exist, which is exactly the false completion the contract forbids. An absent artifact is not a rounding error just because the ledger did not have a row for it.',
    implementationPath: 'Build each absent artifact where it would carry real measurement, or record a cover if existing source already holds the content. Empty files do not count: the index reads statSync, not intent.',
    externalEvidenceRequired: null,
    authorityRequired: null,
    unblockCondition: null,
    nextExperiment: 'Take the highest-value absent artifact next. Proof obligations and the claim-evidence registry sit earliest in the execution order.',
    check: () => {
      if (!has('artifacts/v7/artifact-index.json')) {
        return { status: 'OPEN', sourceEvidence: ['no artifact index to read'] };
      }
      const index = readJson('artifacts/v7/artifact-index.json');
      const absent = (index.rows || []).filter(row => row.state === 'ABSENT');
      // An absence nobody classified is a defect in the index rather than a
      // property of the artifact, and it hides how much of the remainder is
      // actually waiting on software.
      const unclassified = absent.filter(row => row.absenceReason === 'UNCLASSIFIED');
      const computableNow = absent.filter(row => row.absenceReason === 'COMPUTABLE_NOW');
      const broken = (index.rows || []).filter(row => row.state === 'COVER_DECLARED_BUT_MISSING' || row.state === 'GENERATOR_DECLARED_NOT_YET_RUN');
      // Closes on computable work, not on total absence. An artifact waiting on
      // a runtime that does not exist is not unwritten software, and counting it
      // here would make this gap permanently open for a reason no code can fix.
      // The reasons were classified before any of these were built, and the
      // remainder is carried by V7G010 rather than dropped.
      if (!computableNow.length && !broken.length && !unclassified.length) {
        return {
          status: 'CLOSED',
          closureEvidence: `no absent contract artifact is computable now; ${absent.length} remain and each names what it waits on`,
          measured: { absentAwaitingReality: absent.length, byReason: absent.reduce((acc, row) => ({ ...acc, [row.absenceReason]: (acc[row.absenceReason] || 0) + 1 }), {}) }
        };
      }
      return {
        status: 'OPEN',
        sourceEvidence: [
          `${absent.length} of ${index.rows.length} contract artifacts absent`,
          `${computableNow.length} are computable now; the rest wait on repeated observation, elapsed time, an absent runtime, or external reality`,
          ...(unclassified.length ? [`${unclassified.length} absences carry no reason, which is a defect in the index`] : []),
          ...(broken.length ? [`${broken.length} declared but not produced`] : [])
        ],
        measured: {
          computableNow: computableNow.map(row => row.artifact),
          unclassified: unclassified.map(row => row.artifact),
          byReason: absent.reduce((acc, row) => ({ ...acc, [row.absenceReason]: (acc[row.absenceReason] || 0) + 1 }), {}),
          declaredButMissing: broken.map(row => row.artifact)
        }
      };
    }
  }
];

function main() {
  const sourceSha = sh('git', ['rev-parse', 'HEAD']);
  const generatedAt = new Date().toISOString();
  const context = { root, sourceSha, generatedAt };

  const rows = GAPS.map(gap => evaluateGap(gap, context));
  const invalid = rows.map(row => ({ id: row.id, ...validateGapRow(row) })).filter(row => !row.ok);
  const summary = summarizeGaps(rows);

  const artifact = {
    schemaVersion: V7_GAP_LEDGER_VERSION,
    generatedAt,
    sourceSha,
    generator: 'scripts/v7-gap-ledger.mjs',
    freshnessPolicy: 'Recomputed from source on every run. A status in this file was produced by a check, never written.',
    statusesAreComputed: 'Editing this artifact closes nothing. Each gap runs a check that reads the filesystem, a doctor, or git.',
    summary,
    invalidRows: invalid,
    gaps: rows,
    uncertainty: 'A check measures what it reads. A CLOSED software gap means the check passed at this exact head, not that the underlying capability is externally proven.',
    externalEffects: [],
    businessEffectAuthority: 'NONE'
  };

  mkdirSync(resolve(root, dirname(OUT)), { recursive: true });
  writeFileSync(resolve(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`v7 gap ledger @ ${sourceSha.slice(0, 8)}`);
  for (const row of rows) {
    const mark = row.checkState === 'MEASURED' ? '' : `  [${row.checkState}]`;
    console.log(`  ${row.status.padEnd(18)} ${row.family.padEnd(8)} ${row.id}${mark}`);
  }
  console.log(`  softwareOpen ${summary.softwareOpen}, externalOpen ${summary.externalOpen}, unmeasured ${summary.unmeasured}`);
  console.log(`  sourceSideComplete: ${summary.sourceSideComplete}`);
  if (invalid.length) {
    console.log(`  INVALID ROWS: ${invalid.length}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main, GAPS };
