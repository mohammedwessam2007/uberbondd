import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRouteFitness, rankRoutes, scoreProspectRouteValue, ROUTE_CLASS_PRIORS, FITNESS_PRIOR_LABEL } from '../src/global-route-tournament.mjs';

const route = (over = {}) => ({ routeId: 'r', channel: 'CORPORATE_ROLE_EMAIL', routeClass: 'CORPORATE_GREEN', permitted: true, executable: true, costCents: 0, founderMinutes: 1, contactPrivacyClass: 'COMPANY_LEVEL', uncertainty: 0, ...over });

test('only permitted routes are ranked; a non-permitted route is listed with its blockers and can never be selected', () => {
  const r = rankRoutes([route({ routeId: 'a', channel: 'INVITED_EMAIL', routeClass: 'INVITED_GREEN', permitted: false, blockers: ['x'] }), route({ routeId: 'b' })]);
  assert.deepEqual(r.ranked.map(x => x.routeId), ['b']);
  assert.deepEqual(r.unranked.map(x => x.routeId), ['a']);
  assert.equal(r.selected.routeId, 'b');
  assert.equal(r.unranked[0].fitnessScore.reason, 'route-not-permitted');
  assert.equal(rankRoutes([route({ permitted: false })]).selected, null);
  assert.equal(rankRoutes([]).selected, null);
});

test('route classes order by evidence: permissioned > invited > corporate = US > conspicuous publication', () => {
  const fit = cls => scoreRouteFitness(route({ routeClass: cls })).fitness;
  assert.ok(fit('PERMISSIONED_GREEN') > fit('INVITED_GREEN'));
  assert.ok(fit('INVITED_GREEN') > fit('CORPORATE_GREEN'));
  assert.ok(fit('CORPORATE_GREEN') >= fit('US_CANSPAM_GREEN'));
  assert.ok(fit('US_CANSPAM_GREEN') > fit('CONSPICUOUS_PUBLICATION_GREEN'));
  assert.ok(Object.keys(ROUTE_CLASS_PRIORS).every(k => ROUTE_CLASS_PRIORS[k].replyMultiplier > 0));
});

test('raw send volume has no term and cannot dominate route fitness', () => {
  const a = scoreRouteFitness(route());
  const b = scoreRouteFitness(route({ sendVolume: 1_000_000, dailySends: 5000, volume: 9e9 }));
  assert.equal(a.fitness, b.fitness);
  assert.equal(a.sendVolumeTermPresent, false);
  assert.equal(scoreProspectRouteValue({ commercialFit: 1, sendVolume: 1e9 }, { green: true }).sendVolumeTermPresent, false);
});

test('unknown cost is UNKNOWN, not zero: a known $0 route beats an identical route whose cost is unknown, and a known cost lowers fitness', () => {
  const zero = scoreRouteFitness(route({ costCents: 0 }));
  const unknown = scoreRouteFitness(route({ costCents: null }));
  const absent = scoreRouteFitness(route({ costCents: undefined }));
  const blank = scoreRouteFitness(route({ costCents: '' }));
  assert.equal(zero.costKnown, true);
  for (const s of [unknown, absent, blank]) { assert.equal(s.costKnown, false); assert.ok(s.breakdown.unknownCostPenalty > 0); assert.ok(zero.fitness > s.fitness); }
  assert.ok(scoreRouteFitness(route({ costCents: 0 })).fitness > scoreRouteFitness(route({ costCents: 50 })).fitness);
  const ranked = rankRoutes([route({ routeId: 'unknown', costCents: null }), route({ routeId: 'zero', costCents: 0 })]);
  assert.equal(ranked.selected.routeId, 'zero');
});

test('a named individual route scores below a corporate role inbox for the same objective, without being removed', () => {
  const role = scoreRouteFitness(route({ contactPrivacyClass: 'COMPANY_LEVEL' }));
  const person = scoreRouteFitness(route({ contactPrivacyClass: 'PERSONAL_DATA' }));
  assert.ok(role.fitness > person.fitness);
  assert.equal(person.ranked, true, 'the named-person route is still a permitted, ranked route');
  assert.ok(person.breakdown.complianceRisk > role.breakdown.complianceRisk);
});

test('founder minutes and uncertainty subtract; fitness is in contribution cents once a deal value is supplied', () => {
  assert.ok(scoreRouteFitness(route({ founderMinutes: 0 })).fitness > scoreRouteFitness(route({ founderMinutes: 20 })).fitness);
  assert.ok(scoreRouteFitness(route({ uncertainty: 0 })).fitness > scoreRouteFitness(route({ uncertainty: 0.8 })).fitness);
  assert.equal(scoreRouteFitness(route()).unit, 'RELATIVE_UNITS');
  const cents = scoreRouteFitness(route(), { dealContributionCents: 250000 });
  assert.equal(cents.unit, 'CONTRIBUTION_CENTS');
  assert.ok(cents.fitness > 0);
  assert.equal(cents.priorLabel, FITNESS_PRIOR_LABEL);
});

test('an executable route outranks a non-executable one only on an exact fitness tie', () => {
  const tie = rankRoutes([route({ routeId: 'idle', channel: 'AAA', executable: false }), route({ routeId: 'ready', channel: 'ZZZ', executable: true })]);
  assert.equal(tie.ranked[0].routeId, 'ready');
  const better = rankRoutes([route({ routeId: 'idle-invited', routeClass: 'INVITED_GREEN', executable: false }), route({ routeId: 'ready', executable: true })]);
  assert.equal(better.selected.routeId, 'idle-invited', 'fitness decides; the best permitted route is selected and flagged not-yet-executable');
  assert.equal(better.selectedExecutable.routeId, 'ready');
});

test('prospect value: a slightly lower-value prospect with a clean route outranks a nominally superior one with an unresolved route', () => {
  const superior = scoreProspectRouteValue({ commercialFit: 1, problemEvidence: 1, buyerValue: 1, contactConfidence: 1, expectedReply: 1, expectedClearedProfit: 1 }, { green: false, routeClass: 'UNKNOWN_FAIL_CLOSED' });
  const lower = scoreProspectRouteValue({ commercialFit: 0.7, problemEvidence: 0.7, buyerValue: 0.6, contactConfidence: 1, expectedReply: 0.5, expectedClearedProfit: 0.3 }, { green: true, routeClass: 'CORPORATE_GREEN' });
  assert.equal(superior.value, 0);
  assert.ok(lower.value > superior.value);
  const conditional = scoreProspectRouteValue({ commercialFit: 1, problemEvidence: 1 }, { green: false, routeClass: 'CONDITIONAL' });
  assert.ok(conditional.routeFactor > 0 && conditional.routeFactor < 1);
  assert.ok(scoreProspectRouteValue({ commercialFit: 1, routeFriction: 0 }, { green: true }).value > scoreProspectRouteValue({ commercialFit: 1, routeFriction: 1 }, { green: true }).value);
  assert.ok(scoreProspectRouteValue({ commercialFit: 1, founderMinutes: 0 }, { green: true }).value > scoreProspectRouteValue({ commercialFit: 1, founderMinutes: 300 }, { green: true }).value);
  assert.equal(scoreProspectRouteValue({}, null).value, 0);
});

test('tournament results carry no send authority', () => {
  const r = rankRoutes([route()]);
  assert.equal(r.sendAuthority, false);
  assert.equal(r.externalEffectAuthority, 'NONE');
});
