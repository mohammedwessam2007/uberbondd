// PROVIDER-NEUTRAL PUBLIC COMPANY-REGISTRY ADAPTER CONTRACT.
//
// A registry adapter answers one question from an official public register:
// "does this legal entity exist, what is its legal form, and is it active?"
// Companies House is the first implementation (src/companies-house-adapter.mjs);
// future registries (Corporations Canada, ABN Lookup, ACRA, ...) plug into the
// same contract by supplying an object with { registryId, jurisdictions,
// zeroCost, resolve }.
//
// Rules every adapter and the cache here enforce:
//   * ZERO COST: an adapter must declare zeroCost:true; the registry refuses a
//     paid adapter. A missing credential is a CREDENTIAL_MISSING result (fail
//     closed), never a reason to buy anything.
//   * Fail closed on ambiguity: several entities with the same normalized name,
//     an unreachable registry, a rate limit, a malformed response, or a missing
//     credential are all non-FOUND statuses. Nothing here guesses.
//   * Evidence, not trust: every result carries the retrieval time and a digest
//     of the raw response, so a later decision can be tied to exact evidence.
//   * Cache poisoning: cached results are re-hashed on read; a mismatch evicts
//     the entry and is treated as a miss.
//   * Credentials never appear in a result, an error code or a cache key.
//
// No send authority, no provider mutation, no spend.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { sameDomainFamily } from './host-family.mjs';

export const REGISTRY_ADAPTER_VERSION = 'uberbond.company-registry-adapter.v1';

export const REGISTRY_STATUS = Object.freeze({
  FOUND: 'FOUND',
  AMBIGUOUS: 'AMBIGUOUS',
  NOT_FOUND: 'NOT_FOUND',
  UNAVAILABLE: 'UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  CREDENTIAL_MISSING: 'CREDENTIAL_MISSING',
  NO_ADAPTER: 'NO_ADAPTER',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_RESPONSE: 'INVALID_RESPONSE'
});

const clean = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const zeroLedger = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const iso2 = value => {
  const v = clean(value, 8).toUpperCase();
  return v === 'UK' ? 'GB' : v;
};

const NAME_NOISE = new Set(['the', 'limited', 'ltd', 'plc', 'llp', 'lp', 'inc', 'incorporated', 'llc', 'co', 'company', 'corp', 'corporation', 'uk', 'and', 'of']);

/**
 * Normalize a legal name for reconciliation. Legal-form words and punctuation
 * are removed; what remains must be EQUAL, never "similar".
 */
export function normalizeCompanyName(value) {
  return clean(value, 300).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(token => token && !NAME_NOISE.has(token))
    .join(' ');
}

export { sameDomainFamily };

/** In-memory TTL cache whose entries are digest-checked on every read. */
export function createRegistryResultCache({ ttlMs = 24 * 3600_000, maxEntries = 500, now = () => Date.now() } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (now() - entry.storedAt > ttlMs) { entries.delete(key); return null; }
      if (sha256(entry.json) !== entry.digest) { entries.delete(key); return null; }
      try { return JSON.parse(entry.json); } catch { entries.delete(key); return null; }
    },
    set(key, value) {
      if (!REGISTRY_CACHEABLE.has(value?.status)) return false;
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      const json = JSON.stringify(value);
      entries.set(key, { json, digest: sha256(json), storedAt: now() });
      return true;
    },
    size: () => entries.size,
    // test hook for the poisoning invariant: corrupt an entry without re-hashing
    _tamper(key, mutate) {
      const entry = entries.get(key);
      if (entry) entry.json = mutate(entry.json);
    }
  };
}
// Only definitive answers are cached; outages and rate limits never are.
const REGISTRY_CACHEABLE = new Set([REGISTRY_STATUS.FOUND, REGISTRY_STATUS.NOT_FOUND, REGISTRY_STATUS.AMBIGUOUS]);

/** Sliding-window request budget so an adapter never exceeds a registry's published limit. */
export function createRateLimiter({ max, windowMs, now = () => Date.now() } = {}) {
  const hits = [];
  return {
    tryAcquire() {
      const t = now();
      while (hits.length && t - hits[0] >= windowMs) hits.shift();
      if (hits.length >= max) return false;
      hits.push(t);
      return true;
    },
    remaining() {
      const t = now();
      return Math.max(0, max - hits.filter(h => t - h < windowMs).length);
    }
  };
}

export function registryResult({ registryId, jurisdiction, status, query = {}, candidates = [], record = null, evidence = null, reasons = [] }) {
  return {
    version: REGISTRY_ADAPTER_VERSION,
    registryId,
    jurisdiction,
    status,
    query: { name: clean(query.name, 300) || null, companyNumber: clean(query.companyNumber, 32).toUpperCase() || null },
    candidates,
    record,
    evidence,
    reasons: [...new Set(reasons)],
    zeroCost: true,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroLedger()
  };
}

/** Registry of adapters keyed by jurisdiction. Refuses anything that is not zero-cost. */
export function createRegistryAdapterRegistry(adapters = []) {
  const byJurisdiction = new Map();
  const refused = [];
  for (const adapter of adapters) {
    const id = clean(adapter?.registryId, 80);
    const jurisdictions = Array.isArray(adapter?.jurisdictions) ? adapter.jurisdictions.map(iso2).filter(Boolean) : [];
    if (!id || !jurisdictions.length || typeof adapter?.resolve !== 'function') { refused.push({ registryId: id || null, reason: 'adapter-contract-incomplete' }); continue; }
    if (adapter.zeroCost !== true) { refused.push({ registryId: id, reason: 'paid-registry-dependency-refused' }); continue; }
    for (const code of jurisdictions) if (!byJurisdiction.has(code)) byJurisdiction.set(code, adapter);
  }
  return Object.freeze({
    forJurisdiction: code => byJurisdiction.get(iso2(code)) || null,
    jurisdictions: () => [...byJurisdiction.keys()].sort(),
    refused
  });
}

/**
 * Resolve an entity through the adapter for its jurisdiction. Always returns a
 * typed result; a missing adapter is NO_ADAPTER (the jurisdiction's legal form
 * stays unverified), and an adapter that throws is UNAVAILABLE.
 */
export async function resolveCompanyViaRegistry({ registry, jurisdiction, name = '', companyNumber = '' } = {}) {
  const code = iso2(jurisdiction);
  const adapter = registry?.forJurisdiction ? registry.forJurisdiction(code) : null;
  if (!adapter) return registryResult({ registryId: null, jurisdiction: code || null, status: REGISTRY_STATUS.NO_ADAPTER, query: { name, companyNumber }, reasons: ['no-registry-adapter-for-jurisdiction'] });
  try {
    const result = await adapter.resolve({ name, companyNumber });
    if (!result || typeof result !== 'object' || !Object.values(REGISTRY_STATUS).includes(result.status)) {
      return registryResult({ registryId: adapter.registryId, jurisdiction: code, status: REGISTRY_STATUS.INVALID_RESPONSE, query: { name, companyNumber }, reasons: ['adapter-returned-untyped-result'] });
    }
    return result;
  } catch {
    return registryResult({ registryId: adapter.registryId, jurisdiction: code, status: REGISTRY_STATUS.UNAVAILABLE, query: { name, companyNumber }, reasons: ['adapter-threw'] });
  }
}
