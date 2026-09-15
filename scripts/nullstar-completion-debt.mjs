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
    whyNotDone: 'The gate existed for INVENTION only. Extending it to FORECASTING and RESEARCH was writable work, and the point was never to re-judge the finished runs -- a probe written after the winner is known cannot become the test that tournament used -- but to find out whether the promoted code is better than the minimal fix it tied.',
    check: () => {
      // Answered by measurement rather than by F010's status. Both are real:
      // the tournaments stay undiscriminating in the historical record, and the
      // question of whether the promoted solvers were worth anything is
      // separately decidable.
      if (!has('artifacts/nullstar-terminal/attribution-audit.json')) {
        return { open: true, evidence: 'no attribution audit exists' };
      }
      const audit = readJson('artifacts/nullstar-terminal/attribution-audit.json');
      const settled = audit.rows.every(row => row.verdict === 'PROMOTED_SOLVER_IS_BETTER_OUT_OF_PATTERN');
      return {
        open: !settled,
        evidence: settled
          ? `both promoted solvers separate from their minimal fixes: ${audit.rows.map(row => `${row.generation} ${row.promoted.correct} vs ${row.minimalFix.correct} of ${row.probeCount}`).join('; ')}`
          : audit.overall
      };
    }
  },
  {
    id: 'CD003-GATE-PROBES-ARE-SIX-HAND-PICKED-CASES',
    class: 'SOFTWARE',
    what: 'The out-of-pattern gate rested on six hand-written prompts, so passing it could mean the six happened to be six the solver could do.',
    whyNotDone: 'Enumerating the space the grammar can build replaces hand-picking with coverage. That is writable work and it is the actionable half of what this item originally said.',
    // This item was first written as "the probes share an author with the
    // solvers, so they test the failure modes that author thought of". That is
    // true, and it is not a task: no amount of work closes it, because whoever
    // writes the next probe set is an author too. An item that can never close
    // is a limitation filed in the wrong place, and leaving it in a ledger whose
    // count governs whether work is finished would have made that count
    // meaningless in one direction and hostage to a truism in the other.
    //
    // So the limitation moved to permanentLimitations, where it stays visible
    // and is not pretended to be resolvable, and what remains here is the part
    // that was actually actionable.
    reclassifiedFrom: 'CD003-GATE-PROBES-SHARE-AN-AUTHOR',
    check: () => {
      if (!has('artifacts/nullstar-terminal/probe-saturation.json')) {
        return { open: true, evidence: 'no saturation run exists; the gate still rests on hand-picked cases' };
      }
      const saturation = readJson('artifacts/nullstar-terminal/probe-saturation.json');
      const clean = saturation.results.confabulated === 0 && saturation.results.correct === saturation.results.of;
      return {
        open: !clean,
        evidence: clean
          ? `the promoted solver answers all ${saturation.results.of} prompts the grammar can build, against ${saturation.grammar.handWrittenProbesInThisSpace} hand-written probes`
          : `${saturation.results.confabulated} confabulations and ${saturation.results.of - saturation.results.correct} misses across ${saturation.results.of} generated prompts`
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
    id: 'CD008-INSTRUMENT-SATURATED-AT-ITS-TOP-DIFFICULTY',
    class: 'SOFTWARE',
    what: 'A suite where every family scores 1.0 at its hardest level cannot rank a candidate, so a generation declared against it measures nothing.',
    whyNotDone: 'Closing the TOOL_USE gap saturated the last family below 1.0 at difficulty 3. Difficulty 4 has to carry escalation the incumbent genuinely cannot reach rather than merely finds harder, and it has to exist before its bottleneck is read.',
    // Measured at the top difficulty rather than a fixed one. Pinning this to
    // difficulty 3 would have made it reopen permanently the moment difficulty
    // 3 was solved, which is the opposite of what it is asking.
    check: () => {
      const seeds = Array.from({ length: 20 }, (_, i) => 50000 + i);
      const families = ['PLANNING', 'SCIENCE', 'CAUSALITY', 'TOOL_USE', 'RESEARCH', 'INVENTION', 'FORECASTING'];
      const top = families.map(family => ({
        family,
        score: scoreTaskSet(generateTaskSet({ seeds, families: [family], difficulty: 4 }).items, UBERBOND_SOLVERS).mean
      }));
      const withHeadroom = top.filter(row => row.score < 1);
      return {
        open: withHeadroom.length === 0,
        evidence: withHeadroom.length
          ? `headroom at difficulty 4 in ${withHeadroom.map(row => `${row.family} ${row.score}`).join(', ')}`
          : 'all seven families score exactly 1.0 at difficulty 4'
      };
    }
  },
  {
    id: 'CD009-RIGHT-GROUPED-COMPOSITIONS-UNREADABLE',
    class: 'SOFTWARE',
    what: 'The promoted invention solver folds left to right, so a prompt grouped the other way -- "the mean, plus the midrange divided by how many numbers there are" -- is read as ((mean + midrange) / count) rather than mean + (midrange / count). It answers wrongly rather than refusing.',
    whyNotDone: 'Found by hand after GA7, by constructing prompts where the two tied candidates disagree. Neither M3 nor M4 reads it correctly; M4 is worse, silently dropping trailing operations. The generator emits no right-grouped prompt at any difficulty, so nothing measures this and no tournament can select against it until a difficulty level asks.',
    check: () => {
      const surface = { primitives: ['sum', 'count', 'max', 'min'], data: [6, 13, 3, 18, 8, 12] };
      const prompt = 'Report the mean, plus the midrange divided by how many numbers there are.';
      const mean = 10;
      const correct = (mean + (10.5 / 6)).toFixed(4);
      const given = UBERBOND_SOLVERS.INVENTION(surface, prompt)?.answer ?? null;
      return {
        open: given !== correct,
        evidence: given === null
          ? 'the solver refuses the right-grouped prompt, which would be acceptable'
          : `the solver answers ${given} where the right-grouped reading is ${correct}`
      };
    }
  },
  {
    id: 'CD010-TIE-BREAK-DECIDED-GA7-ARBITRARILY',
    class: 'SOFTWARE',
    what: 'GA7 promoted M3 over M4 on registration order. Both scored 1.0, both passed the gate, and the size heuristic could not measure either because the candidate module re-exports from three others.',
    whyNotDone: 'The repaired tie-break says out loud that it decided nothing, which is why this is visible at all. Checking afterwards showed M3 is genuinely better -- M4 drops trailing operations -- but that was found by hand, not by the tournament. A tie-break that falls back to arbitrary order will eventually pick the worse candidate, and it already did once: GA6 chose L2 over L3 on size and L2 turned out to confabulate on every difficulty-4 item.',
    check: () => {
      const ga7 = readJson('artifacts/nullstar-terminal/ga7-result.json');
      const unmeasurable = ga7.candidates.some(row => row.eligible && row.complexityBytes === null);
      return {
        open: unmeasurable,
        evidence: unmeasurable
          ? 'at least one eligible GA7 candidate has no measurable size, so the tie-break fell back to registration order'
          : 'every eligible candidate had a measurable size'
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

  // Things that are true, that matter, and that no amount of work resolves.
  // They are not debt and they do not enter the count, because a count that
  // includes them can never reach zero and stops carrying information. They are
  // here so that reaching zero is never read as their absence.
  permanentLimitations: [
    {
      id: 'PL001-PROBES-SHARE-AN-AUTHOR',
      what: 'Every probe, grammar and generator in this work was written by the same author as the solvers they judge, so they test the failure modes that author can imagine.',
      whyNotResolvable: 'Whoever writes the next probe set is an author too. Independence would need an adversary with different blind spots -- another model, another person, or items drawn from a source outside this repository -- and none of those is available here.',
      narrowedBy: 'artifacts/nullstar-terminal/probe-saturation.json enumerates 54 prompts from the grammar rather than relying on 6 hand-picked ones, which removes the narrower worry without touching this one.',
      statedBefore: 'artifacts/nullstar-terminal/ga4-declaration.json, written before any generation ran under the gate'
    },
    {
      id: 'PL002-ONE-INSTRUMENT',
      what: 'Every capability number in this work comes from one procedurally generated suite of seven families.',
      whyNotResolvable: 'A second independent instrument would have to be built by someone who did not build the first, for the same reason as PL001.',
      narrowedBy: 'Out-of-pattern probes sit outside the generator, and held-back reporting probes gate nothing, so not every number comes from inside the training distribution.'
    },
    {
      id: 'PL003-DETERMINISTIC-SOLVERS-ARE-NOT-MODELS',
      what: 'The solvers are hand-written deterministic functions. Nothing here measures a model, and the capability being improved is the author\'s understanding of the task expressed as code.',
      whyNotResolvable: 'Measuring a model needs a model, which is CD006 and is externally blocked.',
      narrowedBy: 'Nothing. It is stated in every generation artifact rather than narrowed.'
    }
  ],

  doneVerdict: softwareOpen === 0 ? 'SOFTWARE_SIDE_COMPLETE' : 'NOT_DONE__SOFTWARE_WORK_REMAINS',
  whyNotDone: softwareOpen === 0
    ? null
    : `${softwareOpen} software-side items are open. Section 244 forbids reporting DONE while any of them is, and section 191 forbids answering them by finding easier work elsewhere.`,

  doneVerdictDoesNotMean: 'Reaching zero software items would mean no writable work remains that this ledger has identified. It would not mean the system is capable, that the permanent limitations above have gone away, or that the external items have.',
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
