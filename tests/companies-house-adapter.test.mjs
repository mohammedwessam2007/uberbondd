import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTRY_STATUS, normalizeCompanyName, createRegistryResultCache, createRateLimiter, createRegistryAdapterRegistry, resolveCompanyViaRegistry, sameDomainFamily
} from '../src/company-registry-adapter.mjs';
import { createCompaniesHouseAdapter, COMPANIES_HOUSE_BASE_URL, COMPANIES_HOUSE_FORM_CLASSES, COMPANIES_HOUSE_RATE_LIMIT } from '../src/companies-house-adapter.mjs';

const KEY = 'ch-test-key-0123456789abcdef';
const profileBody = (n = '12345678', over = {}) => ({ company_number: n, company_name: 'ACME WIDGETS LTD', company_status: 'active', type: 'ltd', jurisdiction: 'england-wales', date_of_creation: '2015-01-01', ...over });
const searchBody = items => ({ items: items.map(([n, t, s = 'active', ty = 'ltd']) => ({ company_number: n, title: t, company_status: s, company_type: ty })) });

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const r = await handler(String(url), init);
    const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {});
    return { status: r.status ?? 200, ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300, text: async () => body };
  };
  fn.calls = calls;
  return fn;
}
const adapter = (fetchImpl, extra = {}) => createCompaniesHouseAdapter({ apiKey: KEY, fetchImpl, now: () => new Date('2026-10-03T12:00:00Z'), ...extra });

test('without the free API key it reports CREDENTIAL_MISSING and makes no request at all', async () => {
  const f = fakeFetch(() => ({ body: profileBody() }));
  const a = createCompaniesHouseAdapter({ apiKey: '', fetchImpl: f });
  const r = await a.resolve({ name: 'Acme Widgets Ltd' });
  assert.equal(r.status, REGISTRY_STATUS.CREDENTIAL_MISSING);
  assert.deepEqual(r.reasons, ['companies-house-api-key-not-configured']);
  assert.equal(f.calls.length, 0, 'no key: no fetch, no scraping fallback');
  assert.equal(a.zeroCost, true);
  assert.equal(a.credentialConfigured, false);
});

test('a company-number lookup returns a validated FOUND record with retrieval time and raw-response digest', async () => {
  const f = fakeFetch(() => ({ body: profileBody() }));
  const r = await adapter(f).resolve({ companyNumber: '12345678' });
  assert.equal(r.status, REGISTRY_STATUS.FOUND);
  assert.equal(r.record.companyType, 'ltd');
  assert.equal(r.record.companyStatus, 'active');
  assert.match(r.evidence.responseDigest, /^[a-f0-9]{64}$/);
  assert.equal(r.evidence.retrievedAt, '2026-10-03T12:00:00.000Z');
  assert.equal(r.evidence.registryTermsRuleId, 'registry:GB:companies-house-terms');
  assert.equal(f.calls[0].url, `${COMPANIES_HOUSE_BASE_URL}/company/12345678`);
  assert.equal(f.calls[0].init.redirect, 'error');
  assert.equal(r.zeroCost, true);
  assert.equal(r.sendAuthority, false);
});

test('the credential is sent only as Basic auth and never appears in any result, URL, reason or cache key', async () => {
  const f = fakeFetch(() => ({ body: profileBody() }));
  const cache = createRegistryResultCache();
  const a = adapter(f, { cache });
  const results = [await a.resolve({ companyNumber: '12345678' }), await a.resolve({ name: 'Acme Widgets Ltd' }), await adapter(fakeFetch(() => ({ status: 401 }))).resolve({ companyNumber: '12345678' })];
  assert.equal(f.calls[0].init.headers.authorization, `Basic ${Buffer.from(`${KEY}:`).toString('base64')}`);
  for (const call of f.calls) assert.equal(call.url.includes(KEY), false);
  assert.equal(JSON.stringify(results).includes(KEY), false);
  assert.equal(JSON.stringify(results).includes(Buffer.from(`${KEY}:`).toString('base64')), false);
});

test('a name search accepts only an EXACT normalized-name match, then confirms it with the profile', async () => {
  const f = fakeFetch(url => url.includes('/search/') ? { body: searchBody([['12345678', 'ACME WIDGETS LTD'], ['99999999', 'ACME WIDGET HOLDINGS LIMITED']]) } : { body: profileBody() });
  const r = await adapter(f).resolve({ name: 'Acme Widgets Limited' });
  assert.equal(r.status, REGISTRY_STATUS.FOUND);
  assert.equal(r.record.companyNumber, '12345678');
  assert.equal(f.calls.length, 2);
  assert.match(r.evidence.searchResponseDigest, /^[a-f0-9]{64}$/);
});

test('same-name collision is AMBIGUOUS, never "the first one"', async () => {
  const f = fakeFetch(() => ({ body: searchBody([['11111111', 'ACME WIDGETS LTD'], ['22222222', 'Acme Widgets Limited', 'dissolved']]) }));
  const r = await adapter(f).resolve({ name: 'Acme Widgets Ltd' });
  assert.equal(r.status, REGISTRY_STATUS.AMBIGUOUS);
  assert.equal(r.candidates.length, 2);
  assert.equal(r.record, null);
});

test('a near match is NOT_FOUND: similar is not equal', async () => {
  const f = fakeFetch(() => ({ body: searchBody([['11111111', 'ACME WIDGET HOLDINGS LTD'], ['22222222', 'ACME WIDGETS GROUP LTD']]) }));
  const r = await adapter(f).resolve({ name: 'Acme Widgets Ltd' });
  assert.equal(r.status, REGISTRY_STATUS.NOT_FOUND);
  assert.equal(r.record, null);
  assert.deepEqual(r.reasons, ['no-exact-normalized-name-match']);
});

test('every failure class is typed and fails closed: 404, 401/403, 429, 5xx, timeout, bad JSON, wrong number, missing fields', async () => {
  const status = async (handler, q = { companyNumber: '12345678' }) => (await adapter(fakeFetch(handler)).resolve(q)).status;
  assert.equal(await status(() => ({ status: 404 })), REGISTRY_STATUS.NOT_FOUND);
  assert.equal(await status(() => ({ status: 401 })), REGISTRY_STATUS.UNAVAILABLE);
  assert.equal(await status(() => ({ status: 403 })), REGISTRY_STATUS.UNAVAILABLE);
  assert.equal(await status(() => ({ status: 429 })), REGISTRY_STATUS.RATE_LIMITED);
  assert.equal(await status(() => ({ status: 503 })), REGISTRY_STATUS.UNAVAILABLE);
  assert.equal(await status(() => { throw new Error('boom'); }), REGISTRY_STATUS.UNAVAILABLE);
  assert.equal(await status(() => ({ body: '<html>not json' })), REGISTRY_STATUS.INVALID_RESPONSE);
  assert.equal(await status(() => ({ body: profileBody('87654321') })), REGISTRY_STATUS.INVALID_RESPONSE, 'a response for a different company number is rejected');
  assert.equal(await status(() => ({ body: { company_number: '12345678' } })), REGISTRY_STATUS.INVALID_RESPONSE);
  assert.equal(await status(() => ({ body: [] })), REGISTRY_STATUS.INVALID_RESPONSE);
  assert.equal(await status(() => ({ body: { items: 'nope' } }), { name: 'Acme Ltd' }), REGISTRY_STATUS.INVALID_RESPONSE);
  assert.equal(await status(() => ({}), { companyNumber: 'bad number!' }), REGISTRY_STATUS.INVALID_REQUEST);
  assert.equal(await status(() => ({}), { name: '' }), REGISTRY_STATUS.INVALID_REQUEST);
});

test('a hung registry times out instead of blocking', async () => {
  const f = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const r = await createCompaniesHouseAdapter({ apiKey: KEY, fetchImpl: f, timeoutMs: 20 }).resolve({ companyNumber: '12345678' });
  assert.equal(r.status, REGISTRY_STATUS.UNAVAILABLE);
});

test('the request budget stays below the published Companies House limit and a 429 is never blindly retried', async () => {
  assert.ok(COMPANIES_HOUSE_RATE_LIMIT.budget < COMPANIES_HOUSE_RATE_LIMIT.published);
  const f = fakeFetch(() => ({ body: profileBody() }));
  const a = adapter(f, { rateLimiter: createRateLimiter({ max: 2, windowMs: 60_000 }), cache: createRegistryResultCache({ ttlMs: 0 }) });
  assert.equal((await a.resolve({ companyNumber: '12345678' })).status, REGISTRY_STATUS.FOUND);
  assert.equal((await a.resolve({ companyNumber: '12345679' })).status, REGISTRY_STATUS.INVALID_RESPONSE);
  const third = await a.resolve({ companyNumber: '12345670' });
  assert.equal(third.status, REGISTRY_STATUS.RATE_LIMITED);
  assert.equal(f.calls.length, 2, 'the third call never reached the network');
  const g = fakeFetch(() => ({ status: 429 }));
  await adapter(g).resolve({ companyNumber: '12345678' });
  assert.equal(g.calls.length, 1, 'no automatic retry after 429');
});

test('definitive answers are cached; outages and rate limits are not', async () => {
  const f = fakeFetch(() => ({ body: profileBody() }));
  const a = adapter(f);
  await a.resolve({ companyNumber: '12345678' });
  const again = await a.resolve({ companyNumber: '12345678' });
  assert.equal(f.calls.length, 1);
  assert.equal(again.evidence.cache, 'HIT');
  let up = false;
  const g = fakeFetch(() => (up ? { body: profileBody() } : { status: 503 }));
  const b = adapter(g);
  assert.equal((await b.resolve({ companyNumber: '12345678' })).status, REGISTRY_STATUS.UNAVAILABLE);
  up = true;
  assert.equal((await b.resolve({ companyNumber: '12345678' })).status, REGISTRY_STATUS.FOUND, 'the outage was not cached');
});

test('cache poisoning: a tampered entry is evicted on read and treated as a miss', async () => {
  const cache = createRegistryResultCache();
  const f = fakeFetch(() => ({ body: profileBody() }));
  const a = adapter(f, { cache });
  await a.resolve({ companyNumber: '12345678' });
  cache._tamper('GB|number:12345678', json => json.replace('"ltd"', '"plc"'));
  const r = await a.resolve({ companyNumber: '12345678' });
  assert.equal(f.calls.length, 2, 'the poisoned entry forced a fresh fetch');
  assert.equal(r.record.companyType, 'ltd');
  const ttl = createRegistryResultCache({ ttlMs: 10, now: (() => { let t = 0; return () => (t += 100); })() });
  ttl.set('k', { status: 'FOUND' });
  assert.equal(ttl.get('k'), null, 'expired entries are dropped');
  assert.equal(ttl.set('k2', { status: 'UNAVAILABLE' }), false, 'non-definitive results are not cacheable');
});

test('legal-form mapping is conservative: partnerships and unusual bodies need a human, unmapped types are not corporate', () => {
  for (const t of ['ltd', 'plc', 'llp']) assert.equal(COMPANIES_HOUSE_FORM_CLASSES[t], 'CORPORATE');
  for (const t of ['limited-partnership', 'scottish-partnership']) assert.equal(COMPANIES_HOUSE_FORM_CLASSES[t], 'PARTNERSHIP_REVIEW');
  for (const t of ['charitable-incorporated-organisation', 'royal-charter', 'oversea-company', 'registered-society-non-jurisdictional']) assert.equal(COMPANIES_HOUSE_FORM_CLASSES[t], 'REVIEW');
  assert.equal(COMPANIES_HOUSE_FORM_CLASSES['something-new'], undefined);
});

test('the adapter registry refuses a paid registry and incomplete adapters, and a missing adapter is NO_ADAPTER', async () => {
  const good = createCompaniesHouseAdapter({ apiKey: KEY, fetchImpl: fakeFetch(() => ({ body: profileBody() })) });
  const reg = createRegistryAdapterRegistry([good, { registryId: 'PAID', jurisdictions: ['US'], zeroCost: false, resolve: async () => ({}) }, { registryId: 'BROKEN', jurisdictions: ['CA'] }]);
  assert.deepEqual(reg.jurisdictions(), ['GB']);
  assert.deepEqual(reg.refused.map(r => r.reason).sort(), ['adapter-contract-incomplete', 'paid-registry-dependency-refused']);
  assert.equal((await resolveCompanyViaRegistry({ registry: reg, jurisdiction: 'US', name: 'X Inc' })).status, REGISTRY_STATUS.NO_ADAPTER);
  assert.equal((await resolveCompanyViaRegistry({ registry: reg, jurisdiction: 'uk', companyNumber: '12345678' })).status, REGISTRY_STATUS.FOUND, 'UK normalizes to GB');
  const throwing = createRegistryAdapterRegistry([{ registryId: 'T', jurisdictions: ['AU'], zeroCost: true, resolve: async () => { throw new Error('x'); } }]);
  assert.equal((await resolveCompanyViaRegistry({ registry: throwing, jurisdiction: 'AU', name: 'x' })).status, REGISTRY_STATUS.UNAVAILABLE);
  const untyped = createRegistryAdapterRegistry([{ registryId: 'U', jurisdictions: ['AU'], zeroCost: true, resolve: async () => ({ status: 'YES' }) }]);
  assert.equal((await resolveCompanyViaRegistry({ registry: untyped, jurisdiction: 'AU', name: 'x' })).status, REGISTRY_STATUS.INVALID_RESPONSE);
});

test('name normalization removes legal-form noise but requires equality, and the base URL must be https', () => {
  assert.equal(normalizeCompanyName('The Acme & Sons Widgets Ltd.'), normalizeCompanyName('ACME AND SONS WIDGETS LIMITED'));
  assert.notEqual(normalizeCompanyName('Acme Widgets Ltd'), normalizeCompanyName('Acme Widget Holdings Ltd'));
  assert.equal(sameDomainFamily('www.acme.co.uk', 'shop.acme.co.uk'), true);
  assert.equal(sameDomainFamily('acme.co.uk', 'evilacme.co.uk'), false);
  assert.equal(sameDomainFamily('', ''), false);
  assert.throws(() => createCompaniesHouseAdapter({ apiKey: KEY, baseUrl: 'http://api.example' }), /https/);
});
