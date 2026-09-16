#!/usr/bin/env node
// Sections 009, 010, 110, 151, 183. Branch debt, measured rather than asserted.
//
// EVENT HORIZON adds branch debt to softwareOpen: unique commits not on main,
// open integration PRs, diverged useful branches. A raw count is misleading
// here -- 855 remote branches and 767 "with unique commits" sounds like an
// enormous backlog, and almost all of it is one history rewrite.
//
// Three populations, separated by whether a branch shares an ancestor with main
// at all:
//
//   CONTAINED_IN_MAIN   already merged. Zero debt.
//   DIVERGED            a real merge-base with main and commits beyond it.
//                       This is the debt that can actually be reconciled.
//   PRE_REWRITE_LINEAGE no common ancestor. Main was rebuilt on a new root and
//                       these branches root at the old one.
//
// The third population is the interesting one, because "no common ancestor"
// does not mean "lost work". It is measured at file level rather than guessed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.NULLSTAR_BRANCH_DEBT_OUT || 'artifacts/nullstar-terminal/branch-debt.json';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const gitOk = (...args) => { try { execFileSync('git', args, { cwd: root, stdio: 'ignore' }); return true; } catch { return false; } };

const head = git('rev-parse', 'HEAD');
const mainSha = git('rev-parse', 'origin/main');

const branches = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin')
  .split('\n').filter(b => b && b !== 'origin/HEAD' && b !== 'origin/main');

const classified = branches.map(branch => {
  if (gitOk('merge-base', '--is-ancestor', branch, 'origin/main')) {
    return { branch, population: 'CONTAINED_IN_MAIN', uniqueCommits: 0 };
  }
  if (gitOk('merge-base', 'origin/main', branch)) {
    return { branch, population: 'DIVERGED', uniqueCommits: Number(git('rev-list', '--count', `origin/main..${branch}`)) };
  }
  return { branch, population: 'PRE_REWRITE_LINEAGE', uniqueCommits: Number(git('rev-list', '--count', branch)) };
});

const counts = classified.reduce((acc, row) => { acc[row.population] = (acc[row.population] ?? 0) + 1; return acc; }, {});

// File-level measurement of the pre-rewrite population. A commit that is not an
// ancestor of main can still carry content main has, so ancestry alone cannot
// say whether anything is stranded.
const mainFiles = new Set(git('ls-tree', '-r', '--name-only', 'origin/main').split('\n'));
const strandedByBranch = [];
const strandedFiles = new Set();

for (const row of classified.filter(r => r.population === 'PRE_REWRITE_LINEAGE')) {
  let files = [];
  try {
    files = git('ls-tree', '-r', '--name-only', row.branch, '--', 'src/', 'scripts/', 'tests/').split('\n').filter(Boolean);
  } catch { continue; }
  const missing = files.filter(file => !mainFiles.has(file));
  if (missing.length) {
    strandedByBranch.push({ branch: row.branch, missingCount: missing.length });
    for (const file of missing) strandedFiles.add(file);
  }
}

const stranded = [...strandedFiles].sort();
const byDirectory = stranded.reduce((acc, file) => { const top = file.split('/')[0]; acc[top] = (acc[top] ?? 0) + 1; return acc; }, {});

// Were these ever in main and removed, or never there? A path main deleted was
// a decision; a path main never had is orphaned lineage, and they are not the
// same kind of debt.
const strandedSrc = stranded.filter(file => file.startsWith('src/'));
let everInMainHistory = 0;
for (const file of strandedSrc) {
  const log = (() => { try { return git('log', '--oneline', '--max-count=1', 'origin/main', '--', file); } catch { return ''; } })();
  if (log) everInMainHistory += 1;
}

const artifact = {
  schemaVersion: 'uberbond-nullstar-branch-debt-1.0.0',
  directiveSections: ['009', '010', '110', '151', '183'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  mainSha,

  populations: counts,
  totalRemoteBranches: branches.length,

  divergedBranches: classified.filter(r => r.population === 'DIVERGED')
    .sort((a, b) => b.uniqueCommits - a.uniqueCommits),

  preRewriteLineage: {
    branches: counts.PRE_REWRITE_LINEAGE ?? 0,
    whyNoCommonAncestor: 'Main roots at a different initial commit than these branches. It also carries more than one root, so it has absorbed unrelated histories before. These branches root in the August 2026 lineage that predates the rewrite.',
    rawUniqueCommitsWouldOverstate: 'Counting commits not reachable from main gives figures above 1700 for a single branch. That is the entire branch, not 1700 pieces of work, and reporting it as backlog would be false.',
    branchesCarryingFilesMainLacks: strandedByBranch.length,
    strandedFileCount: stranded.length,
    strandedByDirectory: byDirectory,
    strandedSrcModules: strandedSrc.length,
    strandedSrcEverInMainHistory: everInMainHistory,
    neverInMainHistory: strandedSrc.length - everInMainHistory
  },

  strandedFiles: stranded,

  supersessionEvidence: {
    method: 'For stranded modules that map to a named constitution organ, check whether main covers the same concern under a different module name.',
    verified: [
      { stranded: 'src/causal-intervention-ladder.mjs', exports: 'CAUSAL_RUNGS, assessCausalEvidence', successorInMain: 'src/epistemic-immune-system.mjs', evidence: 'carries causalClaim over Pearl rungs, is production-reachable and tested' },
      { stranded: 'src/decision-information-theory.mjs', exports: 'valueOfInformation, predictionHalfLife', successorInMain: 'src/forecast-stack.mjs', evidence: 'exports valueOfInformation and predictionHalfLife by the same names' },
      { stranded: 'src/attribution-chain.mjs', successorInMain: 'src/causal-attribution-spine.mjs', evidence: 'attribution concern present; correspondence inferred from name and domain rather than from matching exports' }
    ],
    coverage: `3 of ${strandedSrc.length} stranded src modules checked`,
    whatThisSupports: 'That the rewrite re-implemented concepts under new names rather than dropping them. The three checked are superseded, and two of those are exact export-level matches.',
    whatThisDoesNotSupport: 'That all of them are. Ninety-eight stranded src modules have not been checked individually, and a pattern in three is not proof for a hundred. This is the residual and it is carried as open debt rather than rounded down.'
  },

  disposition: {
    CONTAINED_IN_MAIN: 'Zero debt.',
    DIVERGED: 'Real, reconcilable debt. Each needs MERGED, SUPERSEDED, ARCHIVED_DONOR, REJECTED_WITH_EVIDENCE or EXTERNAL_BLOCKED.',
    PRE_REWRITE_LINEAGE: 'ARCHIVED_DONOR pending per-module archaeology. Their commits will never be ancestors of main and rebasing a rewritten history is not the remedy; the question is only whether any concept they carry is absent from main.'
  },

  truthBoundary: 'THIS COUNTS BRANCHES AND FILES. IT DOES NOT ESTABLISH THAT ANY STRANDED FILE IS VALUABLE, NOR THAT ANY CONCEPT IS LOST.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

const outPath = resolve(root, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`branch debt @ ${head.slice(0, 8)} against main ${mainSha.slice(0, 8)}`);
console.log(`  ${branches.length} remote branches: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
console.log(`  diverged, reconcilable: ${artifact.divergedBranches.length}`);
console.log(`  pre-rewrite branches carrying files main lacks: ${strandedByBranch.length}`);
console.log(`  distinct stranded files: ${stranded.length} (${Object.entries(byDirectory).map(([k, v]) => `${v} ${k}`).join(', ')})`);
console.log(`  stranded src modules never in main's history: ${artifact.preRewriteLineage.neverInMainHistory} of ${strandedSrc.length}`);
