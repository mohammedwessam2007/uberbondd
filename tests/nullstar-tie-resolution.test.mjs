// A tie is an unresolved question, not a thing to break on bytes.
//
// Twice a tie-break decided which implementation ships on something carrying no
// information about behaviour, and twice the tied candidates were separable by
// evidence nobody ran. These tests hold the rule that stops a third time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { separability } from '../src/nullstar-tie-resolution.mjs';
import { runProbes } from '../src/nullstar-out-of-pattern-probes.mjs';
import { scoreItem } from '../src/nullstar-cognitive-solvers.mjs';
import { generateInventionTask } from '../src/nullstar-cognitive-tasks.mjs';
import { GA7_CANDIDATES } from '../src/nullstar-ga7-candidates.mjs';

const surface = { primitives: ['sum', 'count', 'max', 'min'], data: [6, 13, 3, 18, 8, 12] };

const probeOf = (id, prompt) => ({ id, prompt, groundTruth: null, surface });

test('candidates that disagree anywhere are reported as not interchangeable', () => {
  // The exact pair GA7 tied and could not separate. M3 folds left to right, M4
  // groups on the comma and drops trailing operations.
  const result = separability({
    candidates: [
      { name: 'M3_LEFT_TO_RIGHT_NARY', solver: GA7_CANDIDATES.M3_LEFT_TO_RIGHT_NARY },
      { name: 'M4_CLAUSE_GROUPED_NARY', solver: GA7_CANDIDATES.M4_CLAUSE_GROUPED_NARY }
    ],
    family: 'INVENTION',
    probes: [probeOf('right-grouped', 'Report the mean, plus the midrange divided by how many numbers there are.')],
    items: [],
    runProbes,
    scoreItem
  });

  assert.equal(result.separable, true);
  assert.equal(result.verdict, 'TIED_CANDIDATES_BEHAVE_DIFFERENTLY__NO_TIE_BREAK_CAN_CHOOSE_ON_EVIDENCE_THE_TOURNAMENT_HAS');
  assert.equal(result.disagreements.length, 1);
  assert.notEqual(
    result.disagreements[0].answers.M3_LEFT_TO_RIGHT_NARY,
    result.disagreements[0].answers.M4_CLAUSE_GROUPED_NARY
  );
});

test('candidates that agree everywhere measured are interchangeable', () => {
  const same = surfaceArg => ({ answer: String((surfaceArg.data ?? []).length), used: ['count'] });
  const alsoSame = surfaceArg => ({ answer: `${(surfaceArg.data ?? []).length}`, used: ['count'] });
  const result = separability({
    candidates: [{ name: 'A', solver: same }, { name: 'B', solver: alsoSame }],
    family: 'INVENTION',
    probes: [probeOf('anything', 'Report the mean.')],
    items: [generateInventionTask(1, 3)],
    runProbes,
    scoreItem
  });
  assert.equal(result.separable, false);
  assert.equal(result.verdict, 'TIED_CANDIDATES_AGREE_EVERYWHERE_MEASURED__INTERCHANGEABLE_HERE');
});

test('a solver that throws is a different behaviour, not agreement', () => {
  // Two candidates returning nothing look identical if a crash is swallowed as
  // null, and one of them crashing is exactly the kind of difference a tie-break
  // must not paper over.
  const quiet = () => null;
  const explodes = () => { throw new Error('boom'); };
  const result = separability({
    candidates: [{ name: 'QUIET', solver: quiet }, { name: 'EXPLODES', solver: explodes }],
    family: 'INVENTION',
    probes: [probeOf('anything', 'Report the mean.')],
    items: [],
    runProbes,
    scoreItem
  });
  assert.equal(result.separable, true);
  assert.equal(result.disagreements[0].answers.EXPLODES, '__THREW__');
});

test('a single candidate has nothing to compare', () => {
  const result = separability({
    candidates: [{ name: 'ONLY', solver: () => null }],
    family: 'INVENTION',
    probes: [probeOf('anything', 'Report the mean.')],
    runProbes,
    scoreItem
  });
  assert.equal(result.separable, false);
  assert.equal(result.verdict, 'NOTHING_TO_COMPARE');
});

test('the runner refuses to promote out of a tie it cannot resolve', () => {
  const source = readFileSync(new URL('../scripts/nullstar-generation.mjs', import.meta.url), 'utf8');
  assert.match(source, /const tieIsUnresolved = differential\.separable;/);
  assert.match(source, /const winner = tieIsUnresolved \? null : \(eligible\[0\] \?\? null\)/);
  assert.match(source, /NO_PROMOTION__TIE_UNRESOLVED/);
});

test('GA6 and GA7 both promoted out of ties, which is what this rule now prevents', () => {
  // The record of why the rule exists. If these ever stop reading as ties, the
  // history has been rewritten rather than the rule vindicated.
  const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
  for (const name of ['ga6', 'ga7']) {
    const result = read(`artifacts/nullstar-terminal/${name}-result.json`);
    assert.equal(result.outcome, 'PROMOTED');
    assert.equal(result.discrimination, 'UNDISCRIMINATING__CANDIDATES_TIED');
    assert.ok(result.tiedAtTop.length > 1);
  }
});
