// UK COMPANIES HOUSE adapter for the provider-neutral registry contract.
//
// Companies House publishes its register through a FREE public REST API; the
// only requirement is a free API key (HTTP Basic auth, key as username). This
// adapter therefore costs $0. Without a key it returns CREDENTIAL_MISSING and
// the router fails closed: it never scrapes the website, never buys a data
// product and never guesses. Creating the free key is an owner-only account
// step (see docs/receipts/GLOBAL_GREEN_LANE_ROUTER_20261003.md).
//
// Behaviour guarantees (all tested):
//   * fixed https host, no redirects, bounded timeout;
//   * request budget below Companies House's published 600 requests / 5
//     minutes, and an HTTP 429 is RATE_LIMITED with no blind retry;
//   * the response must name the company number that was requested and carry
//     string name/status/type fields, else INVALID_RESPONSE;
//   * several entities sharing a normalized name are AMBIGUOUS, never "the
//     first one";
//   * definitive answers are cached with digest verification; outages are not;
//   * the credential never appears in any result, error code, cache key or URL.

import { createRateLimiter, createRegistryResultCache, normalizeCompanyName, registryResult, REGISTRY_STATUS } from './company-registry-adapter.mjs';
import crypto from 'node:crypto';

export const COMPANIES_HOUSE_REGISTRY_ID = 'UK_COMPANIES_HOUSE';
export const COMPANIES_HOUSE_BASE_URL = 'https://api.company-information.service.gov.uk';
export const COMPANIES_HOUSE_RATE_LIMIT = Object.freeze({ published: 600, windowMs: 300_000, budget: 550 });

const NUMBER_RE = /^[A-Z0-9]{8}$/;
const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

// Companies House `type` values mapped to PECR subscriber classes by
// UberBond's conservative policy. Anything not listed is AMBIGUOUS: the router
// must never assume every legal form belongs in the same policy class.
export const COMPANIES_HOUSE_FORM_CLASSES = Object.freeze({
  ltd: 'CORPORATE',
  plc: 'CORPORATE',
  llp: 'CORPORATE',
  'private-limited-guarant-nsc': 'CORPORATE',
  'private-limited-guarant-nsc-limited-exemption': 'CORPORATE',
  'private-unlimited': 'CORPORATE',
  'private-unlimited-nsc': 'CORPORATE',
  'old-public-company': 'CORPORATE',
  'european-public-limited-liability-company-se': 'CORPORATE',
  // Partnerships and unusual bodies need a human classification: an English
  // limited partnership is a partnership (an individual subscriber under PECR),
  // a Scottish partnership is treated differently, and charities, societies,
  // royal-charter bodies and overseas entities each need their own review.
  'limited-partnership': 'PARTNERSHIP_REVIEW',
  'scottish-partnership': 'PARTNERSHIP_REVIEW',
  'charitable-incorporated-organisation': 'REVIEW',
  'scottish-charitable-incorporated-organisation': 'REVIEW',
  'royal-charter': 'REVIEW',
  'industrial-and-provident-society': 'REVIEW',
  'registered-society-non-jurisdictional': 'REVIEW',
  'oversea-company': 'REVIEW',
  'uk-establishment': 'REVIEW'
});

// Statuses meaning the entity currently exists and trades as a registered body.
export const COMPANIES_HOUSE_ACTIVE_STATUSES = Object.freeze(['active']);

function validateProfile(body, requestedNumber) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const number = clean(body.company_number, 16).toUpperCase();
  if (number !== requestedNumber) return null;
  const name = clean(body.company_name, 300);
  const status = clean(body.company_status, 60).toLowerCase();
  const type = clean(body.type, 80).toLowerCase();
  if (!name || !status || !type) return null;
  return {
    companyNumber: number,
    name,
    companyStatus: status,
    companyType: type,
    registeredJurisdiction: clean(body.jurisdiction, 60).toLowerCase() || null,
    dateOfCreation: clean(body.date_of_creation, 20) || null,
    dateOfCessation: clean(body.date_of_cessation, 20) || null,
    hasBeenLiquidated: body.has_been_liquidated === true,
    undeliverableRegisteredOfficeAddress: body.undeliverable_registered_office_address === true
  };
}

function validateSearchItems(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) return null;
  const items = [];
  for (const item of body.items.slice(0, 50)) {
    const number = clean(item?.company_number, 16).toUpperCase();
    const title = clean(item?.title, 300);
    if (!NUMBER_RE.test(number) || !title) continue;
    items.push({ companyNumber: number, name: title, companyStatus: clean(item.company_status, 60).toLowerCase() || null, companyType: clean(item.company_type, 80).toLowerCase() || null });
  }
  return items;
}

export function createCompaniesHouseAdapter({
  apiKey = '',
  fetchImpl = globalThis.fetch,
  cache = createRegistryResultCache(),
  rateLimiter = createRateLimiter({ max: COMPANIES_HOUSE_RATE_LIMIT.budget, windowMs: COMPANIES_HOUSE_RATE_LIMIT.windowMs }),
  baseUrl = COMPANIES_HOUSE_BASE_URL,
  timeoutMs = 8000,
  now = () => new Date()
} = {}) {
  const key = clean(apiKey, 200);
  const base = String(baseUrl).replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) throw new Error('companies-house-base-url-must-be-https');
  const header = key ? `Basic ${Buffer.from(`${key}:`).toString('base64')}` : null;

  const result = (status, query, extra = {}) => registryResult({ registryId: COMPANIES_HOUSE_REGISTRY_ID, jurisdiction: 'GB', status, query, ...extra });

  async function get(path) {
    if (!rateLimiter.tryAcquire()) return { kind: REGISTRY_STATUS.RATE_LIMITED, reason: 'local-request-budget-exhausted' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}${path}`, { method: 'GET', headers: { authorization: header, accept: 'application/json' }, redirect: 'error', signal: controller.signal });
      if (response.status === 429) return { kind: REGISTRY_STATUS.RATE_LIMITED, reason: 'registry-http-429' };
      if (response.status === 401 || response.status === 403) return { kind: REGISTRY_STATUS.UNAVAILABLE, reason: 'registry-credential-rejected' };
      if (response.status === 404) return { kind: REGISTRY_STATUS.NOT_FOUND, reason: 'registry-http-404' };
      if (!response.ok) return { kind: REGISTRY_STATUS.UNAVAILABLE, reason: `registry-http-${response.status >= 500 ? '5xx' : 'error'}` };
      const raw = await response.text();
      let body;
      try { body = JSON.parse(raw); } catch { return { kind: REGISTRY_STATUS.INVALID_RESPONSE, reason: 'registry-response-not-json' }; }
      return { kind: 'OK', body, digest: sha256(raw) };
    } catch {
      return { kind: REGISTRY_STATUS.UNAVAILABLE, reason: 'registry-request-failed' };
    } finally {
      clearTimeout(timer);
    }
  }

  const evidenceFor = (path, digest, cacheState) => ({ retrievedAt: now().toISOString(), requestPath: path, responseDigest: digest, cache: cacheState, registryTermsRuleId: 'registry:GB:companies-house-terms' });

  async function profile(number, query) {
    const path = `/company/${encodeURIComponent(number)}`;
    const got = await get(path);
    if (got.kind === REGISTRY_STATUS.NOT_FOUND) return result(REGISTRY_STATUS.NOT_FOUND, query, { reasons: [got.reason] });
    if (got.kind !== 'OK') return result(got.kind, query, { reasons: [got.reason] });
    const record = validateProfile(got.body, number);
    if (!record) return result(REGISTRY_STATUS.INVALID_RESPONSE, query, { reasons: ['registry-profile-invalid-or-number-mismatch'] });
    return result(REGISTRY_STATUS.FOUND, query, { record, candidates: [], evidence: evidenceFor(path, got.digest, 'MISS') });
  }

  return Object.freeze({
    registryId: COMPANIES_HOUSE_REGISTRY_ID,
    jurisdictions: ['GB'],
    zeroCost: true,
    credentialRequired: true,
    credentialConfigured: Boolean(key),

    async resolve({ name = '', companyNumber = '' } = {}) {
      const query = { name, companyNumber };
      if (!key) return result(REGISTRY_STATUS.CREDENTIAL_MISSING, query, { reasons: ['companies-house-api-key-not-configured'] });
      const number = clean(companyNumber, 16).toUpperCase().replace(/\s+/g, '');
      const normalized = normalizeCompanyName(name);
      if (number) {
        if (!NUMBER_RE.test(number)) return result(REGISTRY_STATUS.INVALID_REQUEST, query, { reasons: ['company-number-format-invalid'] });
        const ck = `GB|number:${number}`;
        const hit = cache.get(ck);
        if (hit) return { ...hit, evidence: { ...hit.evidence, cache: 'HIT' } };
        const fresh = await profile(number, query);
        cache.set(ck, fresh);
        return fresh;
      }
      if (!normalized) return result(REGISTRY_STATUS.INVALID_REQUEST, query, { reasons: ['company-name-or-number-required'] });
      const ck = `GB|name:${normalized}`;
      const hit = cache.get(ck);
      if (hit) return { ...hit, evidence: { ...hit.evidence, cache: 'HIT' } };

      const path = `/search/companies?q=${encodeURIComponent(clean(name, 160))}&items_per_page=20`;
      const got = await get(path);
      if (got.kind === REGISTRY_STATUS.NOT_FOUND) return result(REGISTRY_STATUS.NOT_FOUND, query, { reasons: [got.reason] });
      if (got.kind !== 'OK') return result(got.kind, query, { reasons: [got.reason] });
      const items = validateSearchItems(got.body);
      if (!items) return result(REGISTRY_STATUS.INVALID_RESPONSE, query, { reasons: ['registry-search-response-invalid'] });
      // Only EXACT normalized-name matches count. A near match is not a match.
      const exact = items.filter(item => normalizeCompanyName(item.name) === normalized);
      let out;
      if (exact.length === 0) out = result(REGISTRY_STATUS.NOT_FOUND, query, { candidates: items.slice(0, 5), reasons: ['no-exact-normalized-name-match'], evidence: evidenceFor(path, got.digest, 'MISS') });
      else if (exact.length > 1) out = result(REGISTRY_STATUS.AMBIGUOUS, query, { candidates: exact.slice(0, 10), reasons: ['multiple-entities-share-the-normalized-name'], evidence: evidenceFor(path, got.digest, 'MISS') });
      else {
        const confirmed = await profile(exact[0].companyNumber, query);
        out = confirmed.status === REGISTRY_STATUS.FOUND
          ? { ...confirmed, candidates: exact, evidence: { ...confirmed.evidence, searchResponseDigest: got.digest } }
          : confirmed;
      }
      cache.set(ck, out);
      return out;
    }
  });
}
