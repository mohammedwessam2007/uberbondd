// Apify Store observatory: the analysis is pure; the harvest is read-only and stops on rate limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStore, harvest, normalizeItem } from '../scripts/apify-store-observatory.mjs';

const a = (title, users30, usersTotal, extra = {}) => ({ title, name: `u/${title.toLowerCase().replace(/\W+/g, '-')}`, users30, usersTotal, runs30: 0, ok30: 0, rating: null, reviews: 0, ...extra });
test('entrant traction counts only young Actors and reports the store-wide base rate against the whole store', () => {
  const r = analyzeStore([a('Email Verifier Pro', 120, 300), a('Email Validator', 10, 100), a('Bulk Email Verifier', 2877, 7592), a('SEO Audit Tool', 88, 900), a('Site Audit Lite', 3, 20, { rating: 2.0, reviews: 9 })], { storeTotal: 1000 });
  const email = r.niches.find(n => n.niche === 'email verification'); const seo = r.niches.find(n => n.niche === 'seo or site audit');
  assert.deepEqual([email.actors, email.users30Sum, email.youngActors, email.youngWithTraction, email.entrantTractionRate], [3, 3007, 2, 1, 0.5]);
  assert.deepEqual([seo.actors, seo.youngActors, seo.youngWithTraction, seo.entrantTractionRate], [2, 1, 0, 0]);
  assert.deepEqual(r.storeWideEntrantTraction, { youngActorsInSample: 3, withTraction: 1, shareOfStore: 0.001 });
  assert.equal(r.usersIn30Days.atLeast100.actors, 2);
  assert.deepEqual(r.unhappyDemand.map(u => u.name), ['u/site-audit-lite']);
  assert.equal(r.niches[0].niche, 'email verification', 'sorted by entrant traction');
});
test('harvest pages until complete and stops without retrying when rate limited', async () => {
  const item = n => ({ title: `T${n}`, username: 'u', name: `a${n}`, stats: { totalUsers30Days: n, totalUsers: n } });
  const pages = [[item(1), item(2)], [item(3)]]; let calls = 0;
  const ok = await harvest({ pageSize: 2, pauseMs: 0, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { total: 3, items: pages[calls++] ?? [] } }) }) });
  assert.deepEqual([ok.actors.length, ok.stopped, ok.calls], [3, 'COMPLETE', 2]);
  let n = 0; const limited = await harvest({ pauseMs: 0, fetchImpl: async () => { n += 1; return { ok: false, status: 429 }; } });
  assert.deepEqual([limited.stopped, n], ['RATE_LIMITED_NO_BLIND_RETRY', 1]);
  assert.deepEqual(normalizeItem({ title: 'X', username: 'u', name: 'x' }), { title: 'X', name: 'u/x', users30: 0, usersTotal: 0, runs30: 0, ok30: 0, rating: null, reviews: 0 });
});
test('full-search niche rates: computed over the whole search population and labelled exact or upper bound', async () => {
  const { analyzeNichePopulations, harvestSearch } = await import('../scripts/apify-store-observatory.mjs');
  const pop = { term: 'email verifier', total: 5, stopped: 'EMPTY_PAGE', actors: [a('Email Verifier A', 120, 300), a('Email Verifier B', 0, 3), a('Email Validator C', 1, 10), a('Bulk Email Verifier', 2877, 7592)] };
  const [row] = analyzeNichePopulations({ 'email verification': pop });
  assert.deepEqual([row.youngActors, row.youngWithTraction, row.entrantTractionRate, row.rateKind, row.coverage], [3, 1, 0.3333, 'UPPER_BOUND', 0.8]);
  const [limited] = analyzeNichePopulations({ 'email verification': { ...pop, stopped: 'RATE_LIMITED_NO_BLIND_RETRY' } });
  assert.deepEqual([limited.entrantTractionRate, limited.rateKind], [null, 'NOT_MEASURED'], 'a partial harvest is never reported as a rate');
  const [exact] = analyzeNichePopulations({ 'email verification': { ...pop, total: 4, stopped: 'COMPLETE' } });
  assert.equal(exact.rateKind, 'EXACT');
  const urls = []; const page = [{ title: 'X', username: 'u', name: 'x', stats: {} }];
  const h = await harvestSearch('email verifier', { pauseMs: 0, fetchImpl: async u => { urls.push(u); return { ok: true, status: 200, json: async () => ({ data: { total: 2, items: urls.length === 1 ? page : [] } }) }; } });
  assert.deepEqual([h.actors.length, h.stopped, h.calls], [1, 'EMPTY_PAGE', 2]);
  assert.match(urls[0], /search=email%20verifier/);
});
