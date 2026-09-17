// The precedence layer of the constitution compiler.
//
// Every directive used to carry priority: 0, which reads as "lowest precedence"
// when the truth for eight of the nine operative sources is "no precedence was
// ever assigned". Those are different facts and only one of them is true, so
// most of what these tests defend is that distinction surviving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CANON_SOURCES,
  TERMINAL_SOURCES,
  precedenceOrder,
  precedenceFor,
  resolveByPrecedence
} from '../src/constitution-compiler.mjs';

const REAL = readFileSync(new URL('../docs/NORTH_STAR_PRECEDENCE.md', import.meta.url), 'utf8');

test('the authored precedence order is read out of the file that authors it', () => {
  const ranks = precedenceOrder(REAL);
  assert.equal(ranks.size, 10, 'the precedence file ranks ten files');
  assert.equal(ranks.get('NORTH_STAR.md'), 1, 'NORTH_STAR.md is rank 1');
  assert.equal(
    ranks.get('artifacts/sovereign-cognitive-continuum-bootstrap-overlay.json'),
    10,
    'the overlay is rank 10'
  );
});

test('a file listed twice keeps its first rank rather than silently taking the later one', () => {
  // A duplicate is a defect in the precedence file. Taking the later rank would
  // hide it behind a plausible-looking number.
  const ranks = precedenceOrder('1. `A.md`\n2. `B.md`\n3. `A.md`\n');
  assert.equal(ranks.get('A.md'), 1);
  assert.equal(ranks.size, 2);
});

test('an unranked source is unranked, not rank zero', () => {
  const ranks = precedenceOrder(REAL);
  const unranked = precedenceFor('AGENTS.md', ranks);
  assert.equal(unranked.precedenceRank, null, 'null, because no rank was authored');
  assert.equal(unranked.precedenceState, 'UNRANKED__NO_AUTHORED_PRECEDENCE');
  assert.notEqual(unranked.precedenceRank, 0, 'zero would read as highest precedence, which is the opposite claim');

  const ranked = precedenceFor('NORTH_STAR.md', ranks);
  assert.equal(ranked.precedenceRank, 1);
  assert.equal(ranked.precedenceState, 'RANKED_BY_PRECEDENCE_FILE');
});

test('exactly one operative source carries an authored rank', () => {
  // If this changes, the founder ranked the operative canon and the conflict
  // graph can settle more than it could. That is worth failing a test over so
  // nobody has to notice it by reading a number.
  const ranks = precedenceOrder(REAL);
  const ranked = CANON_SOURCES.filter(source => ranks.has(source));
  assert.deepEqual(ranked, ['NORTH_STAR.md']);
});

test('a conflict with an unranked side has no answer, and names which side', () => {
  const ranks = precedenceOrder(REAL);
  const byId = new Map([
    ['p', { id: 'p', provenance: 'NORTH_STAR.md' }],
    ['o', { id: 'o', provenance: 'AGENTS.md' }]
  ]);
  const result = resolveByPrecedence({ prohibition: 'p', obligation: 'o' }, byId, ranks);
  assert.equal(result.precedenceResolvable, false);
  assert.equal(result.reason, 'AT_LEAST_ONE_SIDE_UNRANKED');
  assert.deepEqual(result.unranked, ['AGENTS.md'], 'the report must name the source that needs a rank');
  assert.equal(result.winner, undefined, 'no winner may be invented for an unresolvable conflict');
});

test('a conflict between two ranked sources is settled by the lower rank', () => {
  const ranks = new Map([['A.md', 1], ['B.md', 6]]);
  const byId = new Map([
    ['p', { id: 'p', provenance: 'B.md' }],
    ['o', { id: 'o', provenance: 'A.md' }]
  ]);
  const result = resolveByPrecedence({ prohibition: 'p', obligation: 'o' }, byId, ranks);
  assert.equal(result.precedenceResolvable, true);
  assert.equal(result.reason, 'LOWER_RANK_WINS');
  assert.equal(result.winner, 'o', 'rank 1 beats rank 6');
});

test('two rules from the same source are not settled by precedence', () => {
  // Equal ranks give no ordering. Reporting one as the winner would be a coin
  // toss wearing a rule's clothes.
  const ranks = new Map([['A.md', 1]]);
  const byId = new Map([
    ['p', { id: 'p', provenance: 'A.md' }],
    ['o', { id: 'o', provenance: 'A.md' }]
  ]);
  const result = resolveByPrecedence({ prohibition: 'p', obligation: 'o' }, byId, ranks);
  assert.equal(result.precedenceResolvable, false);
  assert.equal(result.reason, 'SAME_SOURCE_SAME_RANK');
  assert.equal(result.winner, undefined);
});

test('the terminal North Star layer is excluded from compilation, and stays excluded', () => {
  // The exclusion is deliberate: NORTH_STAR.md says these are "direction and
  // search-space canon, not implementation proof", and a Directive Object
  // asserts REPOSITORY_TEST_OR_EXECUTABLE_CHECK. Compiling them would make the
  // opposite claim about 886 sentences.
  assert.equal(TERMINAL_SOURCES.length, 9);
  for (const file of TERMINAL_SOURCES) {
    assert.ok(!CANON_SOURCES.includes(file), `${file} must not be compiled as an operative rule`);
  }
  // NORTH_STAR.md is the one file in both the precedence order and the operative
  // set, so it must not have been swept into the exclusion list with its family.
  assert.ok(CANON_SOURCES.includes('NORTH_STAR.md'));
  assert.ok(!TERMINAL_SOURCES.includes('NORTH_STAR.md'));
});

test('every file the precedence order ranks is either compiled or explicitly excluded', () => {
  // The gap this closes: a ranked file that is neither compiled nor named as
  // excluded has been dropped silently, which is what the no-amputation law
  // exists to prevent.
  const ranks = precedenceOrder(REAL);
  for (const file of ranks.keys()) {
    assert.ok(
      CANON_SOURCES.includes(file) || TERMINAL_SOURCES.includes(file),
      `${file} is ranked by the precedence file but neither compiled nor declared excluded`
    );
  }
});
