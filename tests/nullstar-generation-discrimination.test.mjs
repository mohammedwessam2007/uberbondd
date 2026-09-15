// A tournament whose candidates tie has not measured what it claims to.
//
// GA1 and GA2 both promoted a winner out of a three-way tie at 1.0, and both
// results read as reasoning improvements. An ablation carrying only the fix
// every candidate shared scored the same in each case. These tests hold the
// three things that keep that from happening silently again: the recorded
// results admit the tie, the ablations that exposed it are real and reproduce,
// and the runner that writes future results computes the verdict rather than
// leaving it to whoever reads the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

for (const generation of ['ga1', 'ga2']) {
  test(`${generation} records whether its tournament separated the candidates`, () => {
    const result = read(`artifacts/nullstar-terminal/${generation}-result.json`);
    assert.ok(result.discrimination, 'result must state a discrimination verdict');

    const eligible = result.candidates.filter(row => row.eligible);
    const top = Math.max(...eligible.map(row => row.heldOutScore));
    const tied = eligible.filter(row => row.heldOutScore === top).map(row => row.candidate);

    // The verdict has to follow from the scores in the same file, not from a
    // hand-written label that could drift away from them.
    assert.equal(result.discrimination, tied.length > 1 ? 'UNDISCRIMINATING__CANDIDATES_TIED' : 'SEPARATED');
    assert.deepEqual([...result.tiedAtTop].sort(), [...tied].sort());

    if (tied.length > 1) {
      assert.ok(result.attributionWarning, 'a tie must carry the warning, not just the field');
      assert.ok(result.ablationRef, 'a tie must point at the ablation that isolates the shared fix');
    }
  });

  test(`${generation} ablation reproduces and does not rescore the tournament`, () => {
    const ablation = read(`artifacts/nullstar-terminal/${generation}-ablation.json`);
    assert.equal(ablation.generation, generation.toUpperCase());
    assert.equal(ablation[`rescores${generation.charAt(0).toUpperCase()}${generation.slice(1)}`], false);
    assert.ok(ablation.rows.length >= 3);

    // Every recorded row is recomputed here. A finding nobody can reproduce is
    // an assertion, and this one is load-bearing: it is the reason both
    // promotions are described as closing a narrower gap than they appeared to.
    const family = ablation.family;
    for (const row of ablation.rows) {
      const set = generateTaskSet({
        seeds: Array.from({ length: row.items }, (_, i) => 70000 + i),
        families: [family],
        difficulty: row.difficulty
      });
      assert.equal(scoreTaskSet(set.items, UBERBOND_SOLVERS).mean, row.promotedMean,
        `d${row.difficulty}: the promoted solver no longer scores what the ablation recorded`);
      assert.equal(row.separated, row.promotedMean !== row.ablatedMean);
    }

    assert.equal(ablation.separated, ablation.rows.some(row => row.separated));
    assert.equal(ablation.externalEffects.providerCalls, 0);
    assert.equal(ablation.businessEffectAuthority, 'NONE');
  });
}

test('the ga1 ablation probe distinguishes the two implementations somewhere', () => {
  // GA1 is the milder case and the record says so: the promoted solver answers
  // a cubic the ablation cannot. If that ever stops being true the artifact is
  // overstating the difference and this test should fail rather than let it.
  const ablation = read('artifacts/nullstar-terminal/ga1-ablation.json');
  const probe = ablation.outOfRangeProbe;
  assert.equal(Number(probe.promotedAnswer), probe.trueNext);
  assert.equal(probe.ablatedAnswer, null);
});

test('the generation runner computes discrimination rather than leaving it to the reader', () => {
  // The annotation on the existing results was applied by hand. That is fine
  // once; it is not a guard. GA3 and everything after must get the verdict from
  // the runner, so the runner has to contain the rule.
  const source = readFileSync(new URL('../scripts/nullstar-generation.mjs', import.meta.url), 'utf8');
  assert.match(source, /UNDISCRIMINATING__CANDIDATES_TIED/);
  assert.match(source, /tiedAtTop/);
  assert.match(source, /attributionWarning/);
});

test('the failure this produced is carried as open debt, not just as a comment', () => {
  const ledger = read('artifacts/nullstar-terminal/failure-debt.json');
  const entry = ledger.failures.find(row => row.id === 'F010-UNDISCRIMINATING-TOURNAMENT');
  assert.ok(entry, 'F010 must be in the ledger');
  assert.equal(entry.failureClass, 'EPISTEMIC_INFLATION');
  // It stays open until an item exists that actually separates the mechanisms.
  assert.notEqual(entry.entryStatus, 'CLOSED_WITH_PROOF');
  for (const ref of ['ga1-ablation.json', 'ga2-ablation.json']) {
    assert.ok(entry.evidenceRefs.some(path => path.endsWith(ref)), `F010 must cite ${ref}`);
  }
});

test('the promoted research solver still beats what it replaced', () => {
  // The correction is about attribution, not about the promotion. If someone
  // reads F010 and reverts the solver, difficulty 3 goes back to zero.
  const incumbent = surface => {
    const rank = { PRIMARY_MEASUREMENT: 3, SECONDHAND_SUMMARY: 1, UNSOURCED_ASSERTION: 0 };
    let best = null;
    let bestScore = -1;
    for (const source of surface.sources ?? []) {
      const score = rank[source.quality] ?? 0;
      if (score > bestScore) { bestScore = score; best = source; }
    }
    return best ? String(best.claim) : null;
  };
  const set = generateTaskSet({ seeds: [61, 62, 63, 64, 65, 66, 67, 68], families: ['RESEARCH'], difficulty: 3 });
  assert.equal(scoreTaskSet(set.items, UBERBOND_SOLVERS).mean, 1);
  assert.equal(scoreTaskSet(set.items, { ...UBERBOND_SOLVERS, RESEARCH: incumbent }).mean, 0);
});

test('both ablation scripts run clean and touch nothing external', () => {
  for (const script of ['scripts/nullstar-ga1-ablation.mjs', 'scripts/nullstar-ga2-ablation.mjs']) {
    const out = execFileSync(process.execPath, [script], {
      cwd: new URL('..', import.meta.url).pathname,
      encoding: 'utf8'
    });
    assert.match(out, /finding:/);
  }
});
