import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOption, compareLifeOptions, goodhartRisk, LIFE_DIMENSIONS, COST_DIMENSIONS } from '../src/life-decision-dimensions.mjs';

// "No single metric defines a good life" is easy to agree with and almost
// impossible to keep, because every comparison wants a number and the moment
// dimensions become commensurable something has set the exchange rate between
// meaning and money. These tests are about the total that must never appear.

const option = (name, scores) => ({ name, scores });

test('no weighted total is produced, anywhere on the result', () => {
  const compared = compareLifeOptions([
    option('A', { meaning: 0.9, financial_cost: 0.8 }),
    option('B', { meaning: 0.3, financial_cost: 0.1 })
  ]);
  const serialized = JSON.stringify(compared);
  assert.equal(Object.hasOwn(compared, 'total'), false);
  assert.equal(Object.hasOwn(compared, 'score'), false);
  assert.equal(Object.hasOwn(compared, 'winner'), false);
  assert.doesNotMatch(serialized, /"(total|score|winner|ranking)"/);
  assert.match(compared.noTotal, /THE WEIGHTS WOULD BE THE VALUE JUDGMENT/);
});

test('dominance is reported where it exists, because it needs no exchange rate', () => {
  const compared = compareLifeOptions([
    option('Strictly better', { meaning: 0.9, joy: 0.8, financial_cost: 0.2 }),
    option('Strictly worse', { meaning: 0.4, joy: 0.3, financial_cost: 0.6 })
  ]);
  assert.equal(compared.dominations.length, 1);
  assert.equal(compared.dominations[0].better, 'Strictly better');
  assert.deepEqual(compared.tradeoffs, []);
  assert.equal(compared.founderDecides, false);
});

test('cost dimensions invert, so cheaper is better rather than smaller', () => {
  // Without this a lower financial_cost reads as a worse score and the whole
  // comparison points backwards on exactly the dimensions people care about.
  const compared = compareLifeOptions([
    option('Cheap', { financial_cost: 0.1, meaning: 0.5 }),
    option('Expensive', { financial_cost: 0.9, meaning: 0.5 })
  ]);
  assert.equal(compared.dominations[0].better, 'Cheap');
  for (const dimension of ['time_cost', 'financial_cost', 'risk', 'downside_severity']) {
    assert.ok(COST_DIMENSIONS.includes(dimension));
  }
});

test('a genuine tradeoff is returned as a tradeoff, not resolved', () => {
  const compared = compareLifeOptions([
    option('Money', { financial_cost: 0.1, meaning: 0.2 }),
    option('Meaning', { financial_cost: 0.8, meaning: 0.9 })
  ]);
  assert.deepEqual(compared.dominations, []);
  assert.equal(compared.tradeoffs.length, 1);
  assert.equal(compared.founderDecides, true);
});

test('a tradeoff is recorded once, not once per direction', () => {
  const compared = compareLifeOptions([
    option('A', { meaning: 0.9, joy: 0.1 }),
    option('B', { meaning: 0.1, joy: 0.9 })
  ]);
  assert.equal(compared.tradeoffs.length, 1, 'the mirror pair carries no new fact');
});

test('options sharing no scored dimension are not compared at all', () => {
  // Otherwise dominance would mean "better on the things nobody measured",
  // which is the most confident-sounding kind of nothing.
  const compared = compareLifeOptions([
    option('A', { meaning: 0.9 }),
    option('B', { geographic_freedom: 0.9 })
  ]);
  assert.deepEqual(compared.dominations, []);
  assert.deepEqual(compared.tradeoffs, []);
});

test('an unscored dimension is not a zero', () => {
  // A zero is an assessment; unscored is nobody having looked. Collapsing them
  // lets silence read as a finding.
  const { option: row } = scoreOption(option('A', { meaning: 0.5 }));
  assert.deepEqual(row.scored, ['meaning']);
  assert.ok(row.unscored.includes('joy'));
  assert.equal(Object.hasOwn(row.scores, 'joy'), false);
});

test('a score outside 0..1 is dropped, never coerced to zero', () => {
  // Coercing an out-of-range value to 0 would record an assessment nobody
  // made -- and record it on the pessimistic end, where it does the most
  // damage on a dimension like capability_gain.
  const { option: row } = scoreOption(option('A', { meaning: 4, joy: -1, agency: 0.5 }));
  assert.deepEqual(row.scored, ['agency']);
  assert.ok(row.unscored.includes('meaning'));
  assert.equal(Object.hasOwn(row.scores, 'meaning'), false);
  assert.equal(Object.hasOwn(row.scores, 'joy'), false);
});

test('the dimension vocabulary is canon and unweighted', () => {
  assert.ok(LIFE_DIMENSIONS.includes('meaning'));
  assert.ok(LIFE_DIMENSIONS.includes('joy'));
  assert.ok(LIFE_DIMENSIONS.includes('uncertainty_and_evidence_quality'));
  const compared = compareLifeOptions([option('A', { meaning: 1 }), option('B', { meaning: 0 })]);
  assert.equal(Object.hasOwn(compared, 'weights'), false, 'a default weight vector is an imposed worldview');
});

test('a Goodhart route names how maximizing the proxy loses the thing', () => {
  const risky = goodhartRisk({
    metric: 'hours of deliberate practice',
    standsFor: 'actually getting better',
    optimizedBy: ['logging hours on easy material that feels like practice']
  });
  assert.equal(risky.status, 'PROXY_DIVERGENCE_POSSIBLE');
  assert.equal(risky.divergenceRoutes.length, 1);
});

test('finding no divergence route is not the same as none existing', () => {
  const clean = goodhartRisk({ metric: 'x', standsFor: 'y' });
  assert.equal(clean.status, 'NO_DIVERGENCE_ROUTE_IDENTIFIED');
  assert.match(clean.truthBoundary, /NOT THE SAME AS NONE EXISTING/);
});
