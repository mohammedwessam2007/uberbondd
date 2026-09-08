import test from 'node:test';
import assert from 'node:assert/strict';
import {
  possibility, generatePossibilityPortfolio, comparePossibilities,
  osteogenesisForPossibility, experiencePlan,
  POSSIBILITY_FAMILIES, COMMITMENT_REASONS
} from '../src/personal-civilization-possibility.mjs';

// Three canon failures this module exists to refuse:
//   1. A "portfolio" that is one idea in five outfits.
//   2. Optionality treated as the one thing to maximize, so a deliberate
//      commitment reads as a loss for the branches it chose to close.
//   3. A capability gap reported as a verdict on the person, or an experience
//      that quietly borrows authority it was never given.

const commit = (name, over = {}) => possibility({
  name, family: 'STAGED_COMMITMENT',
  whatMustBeTrue: ['a role exists'], opens: ['deep expertise'], closes: [],
  ...over
});

test('a deliberate commitment closing branches is not scored as strictly worse than an optionality-maximizing path', () => {
  const built = possibility({
    name: 'Move in with the family and go deep on one craft',
    family: 'STAGED_COMMITMENT',
    whatMustBeTrue: ['a mentor accepts', 'income covers rent'],
    opens: ['mastery', 'belonging'],
    closes: ['travel abroad this year', 'three other cities', 'two other careers'],
    deliberateCommitment: true,
    commitmentReason: 'MASTERY',
    scores: { meaning: 0.9 } // optionality intentionally never scored
  });
  assert.equal(built.ok, true);
  const optionMaximizing = possibility({
    name: 'Stay unattached and keep every door open',
    family: 'STATUS_QUO',
    whatMustBeTrue: ['nothing changes'],
    opens: [], closes: [],
    scores: { meaning: 0.3, optionality: 0.9 }
  });
  assert.equal(optionMaximizing.ok, true);

  const compared = comparePossibilities([built.possibility, optionMaximizing.possibility]);
  assert.equal(compared.ok, true);

  // The commitment closed three branches, but `optionality` was never scored
  // for it, so the comparison cannot see -- let alone penalize -- that fact.
  const commitmentRow = compared.options.find(row => row.name === built.possibility.name);
  assert.deepEqual(commitmentRow.scored, ['meaning']);
  assert.equal(commitmentRow.unscored.includes('optionality'), true);

  // On the one dimension both sides actually scored, the commitment wins --
  // it is not "strictly worse", and it is not even a tradeoff, because there
  // is nothing shared for it to lose on.
  const domination = compared.dominations.find(row => row.better === built.possibility.name);
  assert.ok(domination, 'the commitment should dominate on the shared dimension');
  assert.deepEqual(domination.on, ['meaning']);
  const lostDomination = compared.dominations.find(row => row.worse === built.possibility.name);
  assert.equal(lostDomination, undefined, 'the commitment must never appear as the worse side of a domination');
});

test('a deliberate commitment requires a legitimate reason, not just a flag', () => {
  const refused = possibility({
    name: 'Close every other door',
    family: 'STAGED_COMMITMENT',
    whatMustBeTrue: ['x'],
    deliberateCommitment: true
    // no commitmentReason
  });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['deliberate-commitment-requires-a-legitimate-reason']);
  for (const reason of ['DEPTH', 'MASTERY', 'LOVE', 'LOYALTY']) assert.ok(COMMITMENT_REASONS.includes(reason));
});

test('an experience requiring spend is flagged and not runnable by default', () => {
  const plan = experiencePlan({
    forPossibility: 'Learn to sail',
    uncertainty: 'whether being on open water is exhilarating or just seasick',
    smallestReversibleExperience: 'one paid half-day intro lesson',
    wouldReveal: 'a real embodied reaction, not a guess',
    wouldFalsify: 'feeling anxious and wanting to leave the whole time',
    reversible: true,
    involvesSpend: true
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, 'EXPERIENCE_REQUIRES_FOUNDER_AUTHORITY');
  assert.deepEqual(plan.experience.triggeringFactors, ['SPEND']);
  assert.equal(plan.experience.requiresFounderAuthority, true);
  assert.equal(plan.experience.runnable, false, 'capability to design the experiment is not authority to run it');
});

test('an experience requiring third-party involvement or travel commitment is also gated', () => {
  const thirdParty = experiencePlan({
    forPossibility: 'Test co-founding something',
    uncertainty: 'whether we actually work well together',
    smallestReversibleExperience: 'a two-week paid trial project with them',
    wouldReveal: 'real collaboration friction',
    wouldFalsify: 'persistent unresolved conflict on a small stake',
    reversible: true,
    involvesThirdParty: true
  });
  assert.equal(thirdParty.experience.runnable, false);
  assert.deepEqual(thirdParty.experience.triggeringFactors, ['THIRD_PARTY_INVOLVEMENT']);

  const travel = experiencePlan({
    forPossibility: 'Live abroad',
    uncertainty: 'whether the city fits',
    smallestReversibleExperience: 'a booked one-month sublet',
    wouldReveal: 'daily-life fit, not vacation fit',
    wouldFalsify: 'wanting to leave within the first week',
    reversible: true,
    involvesTravelCommitment: true
  });
  assert.equal(travel.experience.runnable, false);
  assert.deepEqual(travel.experience.triggeringFactors, ['TRAVEL_COMMITMENT']);
});

test('explicit matching founder authority makes a gated experience runnable', () => {
  const plan = experiencePlan({
    forPossibility: 'Learn to sail',
    uncertainty: 'whether it is exhilarating or just seasick',
    smallestReversibleExperience: 'one paid half-day intro lesson',
    wouldReveal: 'a real embodied reaction',
    wouldFalsify: 'wanting to leave the whole time',
    reversible: true,
    involvesSpend: true,
    authorization: { subject: 'FOUNDER', grant: 'LIFE_EXPERIENCE_COMMITMENT', issuedAt: '2026-09-08T00:00:00Z' }
  });
  assert.equal(plan.status, 'EXPERIENCE_AUTHORIZED_BY_FOUNDER');
  assert.equal(plan.experience.runnable, true);
});

test('a mismatched or absent authorization does not accidentally authorize', () => {
  const wrongGrant = experiencePlan({
    forPossibility: 'x', uncertainty: 'y', smallestReversibleExperience: 'z',
    wouldReveal: 'w', wouldFalsify: 'v', reversible: true, involvesSpend: true,
    authorization: { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-08T00:00:00Z' }
  });
  assert.equal(wrongGrant.experience.runnable, false);
});

test('an experience must be explicitly reversible; this generator does not cover the irreversible case', () => {
  const refused = experiencePlan({
    forPossibility: 'x', uncertainty: 'y', smallestReversibleExperience: 'z',
    wouldReveal: 'w', wouldFalsify: 'v', reversible: false
  });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['experience-must-be-explicitly-reversible']);
});

test('a rest or joy experience is accepted with no productivity justification required', () => {
  const plan = experiencePlan({
    forPossibility: 'An unstructured weekend alone',
    uncertainty: 'whether unstructured time actually recharges me or just feels empty',
    smallestReversibleExperience: 'one unscheduled Saturday with the phone off',
    wouldReveal: 'how I actually feel by Sunday evening',
    wouldFalsify: 'restlessness or low mood by the afternoon',
    reversible: true
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, 'EXPERIENCE_RUNNABLE');
  assert.match(plan.boundary, /NEVER REQUIRES A PRODUCTIVITY JUSTIFICATION/);
  // No field anywhere smuggles in a return-on-investment requirement.
  const serialized = JSON.stringify(plan);
  assert.doesNotMatch(serialized, /"(roi|justification|productivityScore|expectedReturn)"/i);
});

test('cosmetically identical possibilities collapse into one', () => {
  const first = { name: 'Go deep on medicine', family: 'STAGED_COMMITMENT', whatMustBeTrue: ['residency accepted'], opens: ['expertise'], closes: ['other careers'] };
  const reworded = { name: 'Commit fully to a medical career', family: 'STAGED_COMMITMENT', whatMustBeTrue: ['residency accepted'], opens: ['expertise'], closes: ['other careers'] };
  const portfolio = generatePossibilityPortfolio({ decision: 'What next career?', candidates: [first, reworded] });
  assert.equal(portfolio.ok, true);
  assert.equal(portfolio.count, 1);
  assert.equal(portfolio.duplicatesCollapsed.length, 1);
  assert.equal(portfolio.duplicatesCollapsed[0].collapsedInto, 'Go deep on medicine');
});

test('materially different causal paths do not collapse, even inside the same family', () => {
  const a = { name: 'A', family: 'STAGED_COMMITMENT', whatMustBeTrue: ['x'], opens: ['y'], closes: ['z'] };
  const b = { name: 'B', family: 'STAGED_COMMITMENT', whatMustBeTrue: ['different precondition'], opens: ['y'], closes: ['z'] };
  const portfolio = generatePossibilityPortfolio({ decision: 'd', candidates: [a, b] });
  assert.equal(portfolio.count, 2);
  assert.deepEqual(portfolio.duplicatesCollapsed, []);
});

test('the portfolio reports family coverage rather than requiring every family', () => {
  const portfolio = generatePossibilityPortfolio({
    decision: 'd',
    candidates: [{ name: 'A', family: 'EXIT', whatMustBeTrue: ['x'] }]
  });
  assert.deepEqual(portfolio.familiesPresent, ['EXIT']);
  assert.equal(portfolio.familiesAbsent.includes('STATUS_QUO'), true);
  assert.equal(POSSIBILITY_FAMILIES.length, 7);
});

test('no single scalar score is ever emitted for a portfolio or a possibility', () => {
  const portfolio = generatePossibilityPortfolio({
    decision: 'd',
    candidates: [
      { name: 'A', family: 'STATUS_QUO', whatMustBeTrue: ['x'], scores: { meaning: 0.5 } },
      { name: 'B', family: 'EXIT', whatMustBeTrue: ['y'], scores: { agency: 0.7 } }
    ]
  });
  assert.equal(Object.hasOwn(portfolio, 'totalScore'), false);
  assert.equal(Object.hasOwn(portfolio, 'portfolioScore'), false);
  assert.equal(Object.hasOwn(portfolio, 'ranking'), false);
  for (const row of portfolio.portfolio) {
    assert.equal(Object.hasOwn(row, 'score'), false, 'no combined numeric field, only per-dimension scores');
    assert.equal(typeof row.scores, 'object');
  }
  assert.match(portfolio.noSingleScalar, /NO PORTFOLIO-LEVEL SCORE IS PRODUCED/);
});

test('the binding constraint is identified rather than every dimension polished', () => {
  const result = osteogenesisForPossibility({
    possibility: 'Give a keynote talk',
    requiredCapabilities: ['public speaking', 'domain expertise', 'slide design'],
    capabilities: [
      { name: 'domain expertise', level: 0.8, unlocks: ['credibility', 'teaching'] },
      { name: 'slide design', level: 0.7, unlocks: [] }
      // 'public speaking' is entirely absent -> binds harder than a weak-but-present skill
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CAPABILITY_SKELETON_PROPOSED');
  // Exactly one binding constraint, not a list of every gap treated equally.
  assert.equal(typeof result.bindingConstraint, 'object');
  assert.equal(Array.isArray(result.bindingConstraint), false);
  assert.equal(result.bindingConstraint.capability, 'public speaking');
  assert.equal(result.bindingConstraint.reason, 'ABSENT');
});

test('high-transfer gaps are preferred over brittle single-purpose polish', () => {
  const result = osteogenesisForPossibility({
    possibility: 'Ship a research paper',
    requiredCapabilities: ['writing clearly', 'niche software tool'],
    capabilities: [
      { name: 'writing clearly', level: 0.2, unlocks: ['teaching', 'grant applications', 'blogging'] },
      { name: 'niche software tool', level: 0.2, unlocks: ['this one paper'] }
    ]
  });
  assert.equal(result.gaps[0].capability, 'writing clearly');
  assert.equal(result.gaps[0].transferCount, 3);
  assert.equal(result.gaps[1].transferCount, 1);
});

test('a capability gap is never reported as a character defect', () => {
  const result = osteogenesisForPossibility({
    possibility: 'Lead a team',
    requiredCapabilities: ['public speaking'],
    capabilities: []
  });
  assert.match(result.boundary, /NOT A DEFECT IN THE PERSON/);
  // Scope the forbidden-word check to the structural fields describing the
  // gap itself. The boundary sentence legitimately contains "defect" -- in a
  // negation -- so scanning the whole payload would flag its own guard.
  const structural = JSON.stringify({ gaps: result.gaps, bindingConstraint: result.bindingConstraint }).toLowerCase();
  for (const forbidden of ['flaw', 'defect', 'broken', 'incapable', 'bad at']) {
    assert.doesNotMatch(structural, new RegExp(forbidden));
  }
});

test('malformed inputs are refused with specific reasonCodes across every function', () => {
  assert.deepEqual(possibility({}).reasonCodes, ['possibility-name-required']);
  assert.deepEqual(possibility({ name: 'x' }).reasonCodes, ['valid-possibility-family-required']);
  assert.deepEqual(possibility({ name: 'x', family: 'STATUS_QUO' }).reasonCodes, ['reachability-preconditions-required']);

  assert.deepEqual(generatePossibilityPortfolio({}).reasonCodes, ['decision-required']);
  assert.deepEqual(generatePossibilityPortfolio({ decision: 'd', candidates: [] }).reasonCodes, ['candidates-required']);

  assert.deepEqual(osteogenesisForPossibility({}).reasonCodes, ['possibility-required']);
  assert.deepEqual(osteogenesisForPossibility({ possibility: 'p' }).reasonCodes, ['required-capabilities-required']);

  assert.deepEqual(experiencePlan({}).reasonCodes, ['for-possibility-required']);
  assert.deepEqual(
    experiencePlan({ forPossibility: 'p' }).reasonCodes,
    ['uncertainty-required']
  );
});

test('a fully invalid candidate is refused into the portfolio result rather than silently dropped', () => {
  const portfolio = generatePossibilityPortfolio({
    decision: 'd',
    candidates: [{ family: 'STATUS_QUO' }, { name: 'ok one', family: 'EXIT', whatMustBeTrue: ['x'] }]
  });
  assert.equal(portfolio.count, 1);
  assert.equal(portfolio.refused.length, 1);
  assert.deepEqual(portfolio.refused[0].reasonCodes, ['possibility-name-required']);
});

// Sanity check the two composed modules were actually imported rather than
// re-implemented: a possibility built here still speaks the same dimension
// vocabulary as life-decision-dimensions.mjs.
test('possibility scores use the canonical, unweighted life-dimension vocabulary', () => {
  const built = commit('sanity', { scores: { meaning: 4, joy: -1, agency: 0.5 } });
  assert.equal(built.ok, true);
  // Out-of-range scores are dropped, never coerced, exactly as scoreOption does.
  assert.deepEqual(built.possibility.scored, ['agency']);
});
