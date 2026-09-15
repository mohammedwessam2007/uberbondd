#!/usr/bin/env node
// Section 169. What is still open, and which of it is mine to close.
//
// "Done" is forbidden while any software-side item is open, so the count that
// governs that has to come from somewhere harder to flatter than a summary.
// Every item here names a check that decides its own status, and the script
// runs them. An item cannot be closed by editing this file.
//
// The distinction that matters is SOFTWARE versus EXTERNAL. Software is work
// that can be finished in this repository by writing code. External is work
// blocked on something no amount of code produces -- a credential, a payment,
// a customer, elapsed time, a network policy. Calling an external blocker
// software debt would invent an obligation; calling software debt external
// would excuse one.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.NULLSTAR_COMPLETION_OUT || 'artifacts/nullstar-terminal/completion-debt.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const readJson = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const has = path => existsSync(join(root, path));

const failureDebt = readJson('artifacts/nullstar-terminal/failure-debt.json');
const openFailures = failureDebt.failures.filter(row => row.entryStatus !== 'CLOSED_WITH_PROOF');

// Every generation that ran, read from its own artifact rather than counted by
// hand.
const generations = ['ga1', 'ga2', 'ga3', 'ga4', 'ga5', 'ga6']
  .filter(name => has(`artifacts/nullstar-terminal/${name}-result.json`))
  .map(name => ({ name, ...readJson(`artifacts/nullstar-terminal/${name}-result.json`) }));

const ITEMS = [
  {
    id: 'CD001-TOOL-USE-VOCABULARY-GAP',
    class: 'SOFTWARE',
    what: 'The TOOL_USE family sits at 0.67 at difficulties 2 and 3 because the solver has no intent mapping for the goal phrases naming median and range.',
    whyNotDone: 'Named in the GA3 declaration and deliberately not spent as a generation: closing it is a two-line dictionary edit that would have posted as a capability win. It is real work and it is small work, and it stayed open through four declarations that each said so.',
    check: () => {
      // Measured, not read. The first version of this check read the GA3
      // declaration and asked whether it named TOOL_USE as deliberately
      // not selected -- which it always will, because a declaration is a
      // record of what was true when it was written. A status that can
      // never change is not a check.
      const seeds = Array.from({ length: 30 }, (_, i) => 50000 + i);
      const scores = [2, 3].map(difficulty =>
        scoreTaskSet(generateTaskSet({ seeds, families: ['TOOL_USE'], difficulty }).items, UBERBOND_SOLVERS).mean);
      return {
        open: scores.some(score => score < 1),
        evidence: `TOOL_USE measured live at d2 ${scores[0]} and d3 ${scores[1]}`
      };
    }
  },
  {
    id: 'CD002-GA1-GA2-UNATTRIBUTABLE',
    class: 'SOFTWARE',
    what: 'The GA1 and GA2 promotions are improvements on the instrument that cannot be attributed to the mechanisms they were testing. Their families have no out-of-pattern probe set.',
    whyNotDone: 'The gate that would settle it exists and is applied to INVENTION only. Extending it to FORECASTING and RESEARCH is writable work. Building those probes now and using them to re-judge finished runs would be choosing a test after knowing the answer, so it has to drive new generations rather than re-score old ones.',
    check: () => {
      const entry = failureDebt.failures.find(row => row.id === 'F010-UNDISCRIMINATING-TOURNAMENT');
      return { open: entry?.entryStatus !== 'CLOSED_WITH_PROOF', evidence: 'F010 in the failure-debt ledger' };
    }
  },
  {
    id: 'CD003-GATE-PROBES-SHARE-AN-AUTHOR',
    class: 'SOFTWARE',
    what: 'The out-of-pattern probes were written by the same author as the solvers they judge, so they test the failure modes that author thought of.',
    whyNotDone: 'Stated in the GA4 declaration before any generation ran under the gate, and it has not stopped being true. An adversarially generated probe set, or probes derived from a source other than the author, would narrow it. Neither exists.',
    check: () => {
      const declaration = readJson('artifacts/nullstar-terminal/ga4-declaration.json');
      return {
        open: typeof declaration.whatThisCannotEstablish === 'string' && declaration.whatThisCannotEstablish.includes('blind spots'),
        evidence: 'artifacts/nullstar-terminal/ga4-declaration.json whatThisCannotEstablish'
      };
    }
  },
  {
    id: 'CD004-TIE-BREAK-IS-MEANINGLESS-FOR-REEXPORTS',
    class: 'SOFTWARE',
    what: 'The tournament tie-break measures bytes of the candidate function in its source file. A candidate module that re-exports rather than defines has nothing to measure, so GA6 reported 1052 bytes against 1052 and the tie-break decided nothing.',
    whyNotDone: 'Found while reading GA6 output. Small, and it changes which of several tied candidates wins, so it is worth fixing before a tie-break is ever load-bearing.',
    check: () => {
      // The GA6 artifact records what the broken heuristic returned and always
      // will, so this checks the runner instead: does it follow a re-export,
      // and does it decline to measure rather than returning a file length.
      const runner = readFileSync(join(root, 'scripts/nullstar-generation.mjs'), 'utf8');
      const followsReExports = runner.includes("for (const match of source.matchAll(/from '");
      const admitsFailure = runner.includes('return null;') && runner.includes('?? Infinity');
      return {
        open: !(followsReExports && admitsFailure),
        evidence: followsReExports && admitsFailure
          ? 'the runner follows re-exports and sorts an unmeasurable size last instead of treating it as zero'
          : 'the runner still returns a whole-file length when it cannot find the candidate'
      };
    }
  },
  {
    id: 'CD008-DIFFICULTY-THREE-NO-LONGER-DISCRIMINATES',
    class: 'SOFTWARE',
    what: 'Every family now scores 1.0 at difficulties 1 through 3, so the instrument has nothing left to measure at its top difficulty.',
    whyNotDone: 'Closing the TOOL_USE gap saturated the last family below 1.0. A suite where everything scores perfectly cannot rank a candidate, which is the state the retired corpus was in for a different reason, and a generation declared against it would be measuring nothing. Difficulty 4 has to carry real escalation before the next generation, and it has to be built before its bottleneck is read rather than after.',
    check: () => {
      const seeds = Array.from({ length: 20 }, (_, i) => 50000 + i);
      const families = ['PLANNING', 'SCIENCE', 'CAUSALITY', 'TOOL_USE', 'RESEARCH', 'INVENTION', 'FORECASTING'];
      const top = families.map(family =>
        scoreTaskSet(generateTaskSet({ seeds, families: [family], difficulty: 3 }).items, UBERBOND_SOLVERS).mean);
      const saturated = top.every(score => score === 1);
      return {
        open: saturated,
        evidence: saturated
          ? 'all seven families score exactly 1.0 at difficulty 3'
          : `headroom remains: lowest family at difficulty 3 is ${Math.min(...top)}`
      };
    }
  },
  {
    id: 'CD005-CROSS-ORGAN-TRANSFER-NOT-MEASURED',
    class: 'SOFTWARE',
    what: 'No promoted improvement has been measured against the software, economic or personal organs. The GA2 declaration argued research ranking should transfer to provider evidence; that argument is unmeasured.',
    whyNotDone: 'A transfer measurement needs a task in the receiving organ whose answer is not already computed by the code being tested, and none has been built. Claiming transfer from an architectural argument is what the truth boundaries in every artifact here forbid.',
    check: () => ({
      open: !has('artifacts/nullstar-terminal/cross-organ-transfer.json'),
      evidence: 'artifacts/nullstar-terminal/cross-organ-transfer.json does not exist'
    })
  },
  {
    id: 'CD006-PROVIDER-EVALUATION-BLOCKED',
    class: 'EXTERNAL',
    what: 'Per-dimension capability evidence against anything other than deterministic solvers requires a model. No provider credential is configured and every model-weight host is refused by the network policy, while a local inference runtime installs and imports cleanly.',
    whyNotDone: 'Two independent blockers, neither of which is code: weights are unreachable and Capability Genome admission has approved nothing. Writing more software does not resolve either.',
    check: () => ({
      open: true,
      evidence: 'artifacts/nullstar-omega/G2-discriminating-test.json carries the probes; config/reachability-classification.json names the gate'
    })
  },
  {
    id: 'CD007-NO-EXTERNAL-ECONOMIC-EVIDENCE',
    class: 'EXTERNAL',
    what: 'Revenue, customers and cleared payment remain zero. Nothing in this work changes that and nothing in it is evidence about it.',
    whyNotDone: 'Requires a buyer, not a commit.',
    check: () => ({ open: true, evidence: 'no payment provider receipt exists in the repository' })
  }
];

const evaluated = ITEMS.map(item => {
  let outcome;
  try {
    outcome = item.check();
  } catch (error) {
    // A check that cannot run is not a closed item. Failing open is the only
    // safe direction when the question is whether work remains.
    outcome = { open: true, evidence: `CHECK_FAILED: ${String(error?.message ?? error).slice(0, 160)}` };
  }
  const { check, ...rest } = item;
  return { ...rest, open: outcome.open === true, evidence: outcome.evidence };
});

const softwareOpen = evaluated.filter(row => row.class === 'SOFTWARE' && row.open).length;
const externalOpen = evaluated.filter(row => row.class === 'EXTERNAL' && row.open).length;

const artifact = {
  schemaVersion: 'uberbond-nullstar-completion-debt-1.0.0',
  directiveSections: ['009', '169', '191', '244'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  countsAreComputed: 'Every item runs a check that decides its own status. Editing this file does not close anything; the checks read artifacts, the failure-debt ledger and the filesystem.',

  softwareOpen,
  externalOpen,
  totalOpen: softwareOpen + externalOpen,
  items: evaluated,

  openFailureDebt: openFailures.map(row => ({ id: row.id, failureClass: row.failureClass, severity: row.severity })),

  generationsRun: generations.map(row => ({
    generation: row.generation,
    family: row.family,
    outcome: row.outcome,
    winner: row.winner,
    discrimination: row.discrimination ?? null,
    gateApplied: row.outOfPatternGate?.applied ?? false
  })),

  doneVerdict: softwareOpen === 0 ? 'SOFTWARE_SIDE_COMPLETE' : 'NOT_DONE__SOFTWARE_WORK_REMAINS',
  whyNotDone: softwareOpen === 0
    ? null
    : `${softwareOpen} software-side items are open. Section 244 forbids reporting DONE while any of them is, and section 191 forbids answering them by finding easier work elsewhere.`,

  truthBoundary: 'THIS LEDGER COUNTS WORK, NOT CAPABILITY. A SHORT LIST HERE WOULD NOT MEAN THE SYSTEM IS INTELLIGENT, AND EXTERNAL ITEMS DO NOT BECOME CLOSED BY BEING INCONVENIENT.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

const outPath = resolve(root, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`completion debt @ ${head.slice(0, 8)}`);
console.log(`  software open ${softwareOpen} | external open ${externalOpen}`);
for (const row of evaluated) {
  console.log(`  ${row.open ? 'OPEN  ' : 'closed'}  ${row.class.padEnd(8)} ${row.id}`);
}
console.log(`\n  verdict: ${artifact.doneVerdict}`);
if (artifact.whyNotDone) console.log(`  ${artifact.whyNotDone}`);
