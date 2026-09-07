import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileOptionUniverse, forecastOption, compileDecisionPacket, optionSignature,
  OPTION_FAMILIES, EVIDENCE_KINDS
} from '../src/sovereign-decision-packet.mjs';

// Two failures sit either side of this module and look identical from outside,
// because both end in a confident answer: a universe that was five wordings of
// one option, and a probability with nothing under it. The tests are aimed at
// those two, not at the happy path.

const option = (name, family, changes, extra = {}) => ({ name, family, changes, ...extra });

const universeOf = (...options) => {
  const built = compileOptionUniverse(options);
  assert.equal(built.ok, true, JSON.stringify(built.problems));
  return built;
};

// ---- Collapse: a universe that only looks like one --------------------------

test('options that change the same things are one option, however differently worded', () => {
  const built = compileOptionUniverse([
    option('Move to Berlin', 'STRONGEST_OBVIOUS', ['country', 'employer']),
    option('Relocate to Germany and switch jobs', 'STRONGEST_NON_OBVIOUS', ['employer', 'country']),
    option('Take the Berlin offer', 'FULL_COMMITMENT', ['country', 'employer'])
  ]);
  assert.equal(built.distinctCount, 1, 'three wordings of one causal change is one option');
  assert.equal(built.mergedVariants, 2);
  assert.deepEqual(built.options[0].aliases, ['Relocate to Germany and switch jobs', 'Take the Berlin offer'],
    'the founder must be able to find the wording he used');
});

test('changing the same variables in a different reversibility is a different option', () => {
  // A three-month trial in Berlin and moving to Berlin are not the same
  // decision, and merging them would erase the reversible one -- the option
  // most likely to be right under uncertainty.
  const built = universeOf(
    option('Move to Berlin', 'FULL_COMMITMENT', ['country'], { reversible: false }),
    option('Three months in Berlin', 'REVERSIBLE_TRIAL', ['country'], { reversible: true })
  );
  assert.equal(built.distinctCount, 2);
});

test('unstated reversibility is unknown, not irreversible', () => {
  // Three states, not two. Folding unstated in with "cannot be undone" would
  // report every unlabelled option -- including doing nothing -- as an
  // irreversible commitment, which is exactly the field a founder scans first.
  const built = universeOf(
    option('Unlabelled', 'STRONGEST_OBVIOUS', ['a']),
    option('Declared one-way', 'FULL_COMMITMENT', ['b'], { reversible: false }),
    option('Declared undoable', 'REVERSIBLE_TRIAL', ['c'], { reversible: true })
  );
  const by = name => built.options.find(row => row.name === name);
  assert.equal(by('Unlabelled').reversible, null);
  assert.equal(by('Declared one-way').reversible, false);
  assert.equal(by('Declared undoable').reversible, true);
});

test('unstated and not-reversible still group together for distinctness', () => {
  // The conservative direction: two options changing the same thing, one
  // labelled one-way and one unlabelled, must not be presented as a real
  // choice between two mechanisms when nobody has established they differ.
  const built = universeOf(
    option('A', 'STRONGEST_OBVIOUS', ['country']),
    option('B', 'FULL_COMMITMENT', ['country'], { reversible: false })
  );
  assert.equal(built.distinctCount, 1);
});

test('an option that changes nothing is refused unless it is the status quo', () => {
  const built = compileOptionUniverse([
    option('Think about it more', 'DELAY_FOR_INFORMATION', []),
    option('Do nothing', 'STATUS_QUO', [])
  ]);
  assert.equal(built.distinctCount, 1);
  assert.deepEqual(built.problems[0].reasonCodes, ['option-must-name-what-it-changes']);
});

test('the signature is causal, so prose cannot make two options look distinct', () => {
  assert.equal(
    optionSignature({ changes: ['b', 'a'], reversible: true }),
    optionSignature({ changes: ['a', 'b', 'a'], reversible: true })
  );
  assert.notEqual(
    optionSignature({ changes: ['a'], reversible: true }),
    optionSignature({ changes: ['a'], reversible: false })
  );
});

test('an unrecognised family is refused, so the family list stays a real spread', () => {
  const built = compileOptionUniverse([option('X', 'SOUNDS_GOOD', ['a'])]);
  assert.equal(built.ok, false);
  assert.deepEqual(built.problems[0].reasonCodes, ['valid-option-family-required']);
  assert.ok(OPTION_FAMILIES.includes('GENESIS_INVENTED'), 'invented options must have somewhere to live');
});

// ---- Theatre: a number with nothing under it -------------------------------

test('a probability requires quantitative evidence, not a persuasive story', () => {
  // A causal model can be the strongest thing in the room and still not
  // license a frequency: it says how, not how often.
  const storyOnly = forecastOption({
    option: { name: 'Move' },
    evidence: [{ kind: 'CAUSAL_MODEL', detail: 'more senior market, so faster progression' }],
    distribution: { probabilities: { good: 0.8, bad: 0.2 } }
  });
  assert.equal(storyOnly.state, 'UNKNOWN__MORE_EVIDENCE_REQUIRED');
  assert.equal(storyOnly.probabilities, null, 'the requested number must not survive');

  const withBase = forecastOption({
    option: { name: 'Move' },
    evidence: [
      { kind: 'REFERENCE_CLASS', detail: '140 comparable relocations', ref: 'ds:relocations' },
      { kind: 'CAUSAL_MODEL', detail: 'more senior market' }
    ],
    distribution: { probabilities: { good: 0.6, bad: 0.4 } }
  });
  assert.equal(withBase.state, 'QUANTIFIED');
  assert.deepEqual(withBase.probabilities, { good: 0.6, bad: 0.4 });
});

test('an assertion buys nothing, at any confidence', () => {
  const asserted = forecastOption({
    option: { name: 'Move' },
    evidence: [{ kind: 'ASSERTION', detail: 'I am confident this is right' }],
    distribution: { probabilities: { good: 0.95, bad: 0.05 } }
  });
  assert.equal(asserted.state, 'UNKNOWN__MORE_EVIDENCE_REQUIRED');
  assert.equal(EVIDENCE_KINDS.ASSERTION.quantitative, false);
});

test('no evidence at all is UNKNOWN, which is a result rather than a failure', () => {
  const nothing = forecastOption({ option: { name: 'Move' }, evidence: [] });
  assert.equal(nothing.ok, true);
  assert.equal(nothing.state, 'UNKNOWN__MORE_EVIDENCE_REQUIRED');
});

test('correlated sources are counted once, because agreement is not independence', () => {
  // Five models trained on one corpus agreeing is one source agreeing with
  // itself, and counting it as five is how a weak forecast reads as strong.
  const forecast = forecastOption({
    option: { name: 'Move' },
    evidence: [
      { kind: 'REFERENCE_CLASS', detail: 'a', ref: 'ds:same' },
      { kind: 'REFERENCE_CLASS', detail: 'b', ref: 'ds:same' },
      { kind: 'HINDCAST', detail: 'c', ref: 'ds:same' },
      { kind: 'CALIBRATION_HISTORY', detail: 'd', ref: 'ds:other' }
    ]
  });
  assert.equal(forecast.strength.evidenceRows, 4);
  assert.equal(forecast.strength.independentSources, 2);
});

// ---- The packet -------------------------------------------------------------

test('a packet whose options were not all forecast is refused, not published', () => {
  // Otherwise a partial search presents as a complete one and the option that
  // happened to get a forecast wins by default.
  const universe = universeOf(
    option('Move', 'FULL_COMMITMENT', ['country']),
    option('Stay', 'STATUS_QUO', [])
  );
  const packet = compileDecisionPacket({
    decision: 'Where to live next year',
    universe,
    forecasts: [forecastOption({ option: { name: 'Move' }, evidence: [] })]
  });
  assert.equal(packet.ok, false);
  assert.deepEqual(packet.unforecast, ['Stay']);
});

test('when the difference is a value choice, the packet declines to pick a winner', () => {
  const universe = universeOf(
    option('Higher pay', 'FULL_COMMITMENT', ['employer']),
    option('More freedom', 'OPTIONALITY_PRESERVING', ['schedule'])
  );
  const quantified = name => forecastOption({
    option: { name },
    evidence: [{ kind: 'REFERENCE_CLASS', detail: 'base rates', ref: `ds:${name}` }],
    distribution: { probabilities: { good: 0.5, bad: 0.5 } }
  });
  const packet = compileDecisionPacket({
    decision: 'Which offer',
    universe,
    forecasts: [quantified('Higher pay'), quantified('More freedom')],
    valueBoundary: true
  });
  assert.equal(packet.recommendation.state, 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED');
  assert.equal(packet.recommendation.option, null,
    'manufacturing a winner here substitutes the system values for the founder values');
});

test('with no quantified forecast the packet asks for evidence rather than ranking', () => {
  const universe = universeOf(
    option('Move', 'FULL_COMMITMENT', ['country']),
    option('Stay', 'STATUS_QUO', [])
  );
  const packet = compileDecisionPacket({
    decision: 'Where to live',
    universe,
    forecasts: [
      forecastOption({ option: { name: 'Move' }, evidence: [{ kind: 'CAUSAL_MODEL', detail: 'x' }] }),
      forecastOption({ option: { name: 'Stay' }, evidence: [] })
    ]
  });
  assert.equal(packet.recommendation.state, 'NO_RECOMMENDATION__NO_QUANTIFIED_FORECAST');
  assert.equal(packet.unknowns.length, 2);
});

test('the packet stops at RECOMMENDATION and says so on the object', () => {
  const universe = universeOf(option('Move', 'FULL_COMMITMENT', ['country']));
  const packet = compileDecisionPacket({
    decision: 'Where to live',
    universe,
    forecasts: [forecastOption({
      option: { name: 'Move' },
      evidence: [{ kind: 'REFERENCE_CLASS', detail: 'base rates', ref: 'ds:a' }],
      distribution: { probabilities: { good: 0.7, bad: 0.3 } }
    })]
  });
  assert.equal(packet.highestRung, 'RECOMMENDATION');
  assert.match(packet.founderAuthority, /CANNOT REACH THE CHOICE RUNG/);
  assert.equal(packet.businessEffectAuthority, 'NONE');
});

test('irreversible options are surfaced by name, not folded into a score', () => {
  const universe = universeOf(option('Sell the flat', 'FULL_COMMITMENT', ['housing'], { reversible: false }));
  const packet = compileDecisionPacket({
    decision: 'Housing',
    universe,
    forecasts: [forecastOption({
      option: { name: 'Sell the flat' },
      evidence: [{ kind: 'REFERENCE_CLASS', detail: 'x', ref: 'ds:a' }],
      distribution: { probabilities: { good: 0.9, bad: 0.1 } },
      irreversible: true
    })]
  });
  assert.deepEqual(packet.irreversibleOptions, ['Sell the flat'],
    'a 90% good outcome does not make an irreversible option a safe one');
});
