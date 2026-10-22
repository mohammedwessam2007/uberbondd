import test from 'node:test';
import assert from 'node:assert/strict';
import { compactActor, failShare, dedupeActors, analyzeStore, titleTokens, completeness, enumerationCompleteness, DEFINITIONS } from '../src/apify-store-observatory.mjs';

const item = (username, name, title, categories, users30, runs) => ({
  username, name, title, categories,
  stats: { totalUsers30Days: users30, publicActorRunStats30Days: runs },
  currentPricingInfo: { pricingModel: 'PAY_PER_EVENT' },
});

test('fail share counts FAILED and TIMED-OUT but not user ABORTED runs', () => {
  const a = compactActor(item('u', 'n', 'T', ['X'], 300, { TOTAL: 1000, FAILED: 100, 'TIMED-OUT': 50, ABORTED: 400, SUCCEEDED: 450 }));
  assert.equal(failShare(a), 0.15);
  assert.equal(failShare(compactActor(item('u', 'z', 'T', [], 0, {}))), null);
});

test('title tokens drop generic marketplace words', () => {
  assert.deepEqual([...titleTokens('Google Maps Scraper (Fast, No Login)')], ['google', 'maps']);
});

test('dedupe keeps the first copy of an actor seen twice across shifting pages', () => {
  const a = compactActor(item('u', 'n', 'A', ['X'], 1, { TOTAL: 1 }));
  assert.equal(dedupeActors([a, { ...a, users30: 999 }, compactActor(item('u', 'm', 'B', ['X'], 1, {}))]).length, 2);
});

test('broken leaders, absorbing substitutes and the pre-registered decision', () => {
  const broken = (i, title, users) => compactActor(item('b', `b${i}`, title, ['SOCIAL_MEDIA'], users, { TOTAL: 2000, FAILED: 500, SUCCEEDED: 1500 }));
  const healthy = (i, title, users) => compactActor(item('h', `h${i}`, title, ['SOCIAL_MEDIA'], users, { TOTAL: 1000, FAILED: 10, SUCCEEDED: 990 }));
  const actors = [
    broken(1, 'Instagram Profile Scraper', 1000),
    healthy(1, 'Instagram Posts Scraper', 600),
    broken(2, 'Threads Scraper', 400),
    healthy(2, 'Threads Scraper', 100),
    healthy(3, 'Facebook Pages', 5000),
    compactActor(item('x', 'x1', 'Instagram Profile', ['ECOMMERCE'], 9000, { TOTAL: 9000, SUCCEEDED: 9000 })),
  ];
  const result = analyzeStore(actors);
  assert.equal(result.brokenLeaders, 2);
  const byId = Object.fromEntries(result.leaders.map(l => [l.id, l]));
  assert.equal(byId['b/b1'].absorbed, true, 'a same-category, shared-token substitute with >= half the users absorbs');
  assert.equal(byId['b/b1'].healthySubstitutes, 1, 'different category and no shared token do not count');
  assert.equal(byId['b/b2'].absorbed, false, '100 users is under half of 400');
  assert.equal(result.strandedUsers30, 400);
  assert.equal(result.decision, 'KILL_H2A_BREAKAGE_NOT_MATERIAL', 'two leaders is below the pre-registered 25');

  const many = Array.from({ length: 30 }, (_, i) => broken(100 + i, `Niche${i} Tool`, 300));
  assert.equal(analyzeStore(many).decision, 'CONTINUE_BUILD_CANDIDATES');
  const absorbedMany = many.flatMap((leader, i) => [leader, healthy(100 + i, `Niche${i} Tool`, 300)]);
  assert.equal(analyzeStore(absorbedMany).decision, 'KILL_H2B_SUBSTITUTES_ABSORB');
  assert.equal(DEFINITIONS.leader.minFailShare, 0.2);
});

test('amendment X2-A1: an incomplete crawl is never scored', () => {
  assert.deepEqual(completeness([{ name: 'global', reachedCap: true, lastPageMaxUsers30: 49 }, { name: 'AI', reachedCap: false, lastPageMaxUsers30: 900 }]), { complete: true, floor: 50, failingPartitions: [] });
  assert.deepEqual(completeness([{ name: 'global', reachedCap: true, lastPageMaxUsers30: 50 }]).failingPartitions, ['global']);
  assert.equal(completeness([]).complete, false, 'no partitions read is not completeness');
  assert.equal(completeness([{ name: 'global', reachedCap: true, lastPageMaxUsers30: undefined }]).complete, false, 'an unknown tail fails closed');
  assert.equal(analyzeStore([], DEFINITIONS, { complete: false }).decision, 'INCOMPLETE_NOT_SCORED');
});

test('amendment X2-A2: completeness by enumeration against a calibrated visible fraction', () => {
  const uncapped = [{ name: 'category:A', reachedCap: false, reportedTotal: 2000, distinct: 1800 }, { name: 'category:B', reachedCap: false, reportedTotal: 4000, distinct: 3700 }, { name: 'category:TINY', reachedCap: false, reportedTotal: 10, distinct: 1 }];
  const ok = enumerationCompleteness([...uncapped, { name: 'global', reachedCap: true, reportedTotal: 100000, distinct: 90000 }, { name: 'category:BIG', reachedCap: true, reportedTotal: 30000, distinct: 27500 }]);
  assert.equal(ok.visibleFraction, 0.9125, 'median of 0.90 and 0.925; tiny categories do not calibrate');
  assert.equal(ok.complete, true);
  const short = enumerationCompleteness([...uncapped, { name: 'global', reachedCap: true, reportedTotal: 100000, distinct: 90000 }, { name: 'category:BIG', reachedCap: true, reportedTotal: 30000, distinct: 15000 }]);
  assert.deepEqual(short.failingPartitions, ['category:BIG']);
  assert.equal(enumerationCompleteness([{ name: 'global', reachedCap: true, reportedTotal: 10, distinct: 10 }]).complete, false, 'no calibration means no claim of completeness');
});
