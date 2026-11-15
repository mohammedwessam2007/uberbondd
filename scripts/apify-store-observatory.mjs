#!/usr/bin/env node
// Apify Store demand observatory. Reads the public, keyless Store listing and
// measures, per niche: how many Actors exist, how many people used them in the
// last 30 days, and how often a YOUNG Actor reaches real usage ("entrant
// traction"). That last number is the base rate for a new listing in the niche.
//
// Plan-only by default. `--execute` performs read-only GETs against
// api.apify.com/v2/store (no account, no key) and writes the receipt.
//   node scripts/apify-store-observatory.mjs --execute [--snapshot file.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OBSERVATORY_SCHEMA = 'uberbond.apify-store-observatory.v1';
export const NICHES = Object.freeze({
  'email verification': /email.{0,12}(verif|valid)|verif.{0,10}email/i,
  'contact or email from website': /(website|domain|url).{0,25}(email|contact)|contact (details|info)|email (extract|scrap|find)/i,
  'lead lists (Apollo-style)': /leads? (finder|scraper)/i,
  'google maps': /google maps|google places/i,
  'screenshot': /screenshot/i,
  'phone validation': /phone.{0,14}(valid|verif|lookup|enrich)/i,
  'company enrichment': /company.{0,12}(enrich|data|info|detail)/i,
  'ai search visibility': /ai visib|llms\.txt|ai search|ai overview|\bgeo\b|chatgpt/i,
  'sales triggers and intent': /sales trigger|intent|hiring signal|funding/i,
  'dns, whois, domain': /whois|dns|domain (avail|age|lookup)/i,
  'tech stack detection': /tech ?stack|technology (detect|lookup)|wappalyzer|builtwith/i,
  'seo or site audit': /seo.{0,12}(audit|check|analy)|site audit|website audit|lighthouse/i,
  'url status and broken links': /broken link|status check|redirect check/i,
  'government contracts and grants': /sam\.gov|tender|procure|grants?\b/i
});
const YOUNG_MAX_TOTAL_USERS = 600; // proxy for "recently listed": few all-time users
const TRACTION_USERS_30D = 50;

// actors: [{ title, name, users30, usersTotal, runs30, ok30, rating, reviews }]
export function analyzeStore(actors, { storeTotal = actors.length, niches = NICHES } = {}) {
  const share = (n, d) => (d ? Math.round((10000 * n) / d) / 10000 : 0);
  const young = actors.filter(a => a.usersTotal <= YOUNG_MAX_TOTAL_USERS);
  const rows = Object.entries(niches).map(([niche, re]) => {
    const m = actors.filter(a => re.test(a.title ?? ''));
    const y = m.filter(a => a.usersTotal <= YOUNG_MAX_TOTAL_USERS);
    const hits = y.filter(a => a.users30 >= TRACTION_USERS_30D).sort((a, b) => b.users30 - a.users30);
    return { niche, actors: m.length, users30Sum: m.reduce((s, a) => s + a.users30, 0), actorsWithTraction: m.filter(a => a.users30 >= TRACTION_USERS_30D).length, youngActors: y.length, youngWithTraction: hits.length, entrantTractionRate: share(hits.length, y.length), examples: hits.slice(0, 3).map(a => `${a.name} (${a.users30})`) };
  }).sort((a, b) => b.entrantTractionRate - a.entrantTractionRate || b.users30Sum - a.users30Sum);
  const unhappy = actors.filter(a => a.rating && a.rating <= 3.6 && a.reviews >= 5).sort((a, b) => b.users30 - a.users30).slice(0, 15).map(a => ({ name: a.name, title: a.title, users30: a.users30, rating: Math.round(a.rating * 10) / 10, reviews: a.reviews }));
  return {
    sample: actors.length, storeTotal,
    usersIn30Days: Object.fromEntries([1, 10, 50, 100, 500, 1000].map(t => [`atLeast${t}`, { actors: actors.filter(a => a.users30 >= t).length, shareOfStore: share(actors.filter(a => a.users30 >= t).length, storeTotal) }])),
    storeWideEntrantTraction: { youngActorsInSample: young.length, withTraction: young.filter(a => a.users30 >= TRACTION_USERS_30D).length, shareOfStore: share(young.filter(a => a.users30 >= TRACTION_USERS_30D).length, storeTotal) },
    definitions: { young: `all-time users <= ${YOUNG_MAX_TOTAL_USERS}`, traction: `users in last 30 days >= ${TRACTION_USERS_30D}`, nicheMatch: 'regular expression over the Actor title only' },
    niches: rows, unhappyDemand: unhappy
  };
}

export const normalizeItem = i => ({ title: i.title, name: `${i.username}/${i.name}`, users30: i.stats?.totalUsers30Days ?? 0, usersTotal: i.stats?.totalUsers ?? 0, runs30: i.stats?.publicActorRunStats30Days?.TOTAL ?? 0, ok30: i.stats?.publicActorRunStats30Days?.SUCCEEDED ?? 0, rating: i.stats?.actorReviewRating ?? null, reviews: i.stats?.actorReviewCount ?? 0 });

export async function harvest({ fetchImpl = globalThis.fetch, pageSize = 1000, maxPages = 40, pauseMs = 400 } = {}) {
  const actors = []; let total = null; let calls = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await fetchImpl(`https://api.apify.com/v2/store?limit=${pageSize}&offset=${page * pageSize}&sortBy=popularity`, { signal: AbortSignal.timeout(60000) }); calls += 1;
    if (res.status === 403 || res.status === 429) return { actors, total, calls, stopped: 'RATE_LIMITED_NO_BLIND_RETRY' };
    if (!res.ok) return { actors, total, calls, stopped: `HTTP_${res.status}` };
    const { data } = await res.json(); total = data.total;
    if (!data.items?.length) return { actors, total, calls, stopped: 'EMPTY_PAGE' };
    actors.push(...data.items.map(normalizeItem));
    if (actors.length >= total) return { actors, total, calls, stopped: 'COMPLETE' };
    await new Promise(r => setTimeout(r, pauseMs));
  }
  return { actors, total, calls, stopped: 'PAGE_CEILING' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  if (!process.argv.includes('--execute')) { console.log('plan-only: would read https://api.apify.com/v2/store (public, keyless, read-only). Re-run with --execute.'); process.exit(0); }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let actors; let meta;
  if (arg('--snapshot')) { const snap = JSON.parse(fs.readFileSync(arg('--snapshot'), 'utf8')); actors = snap.actors; meta = snap.meta; }
  else { const h = await harvest(); actors = h.actors; meta = { observedAt: new Date().toISOString(), storeTotal: h.total, providerCalls: h.calls, stopped: h.stopped }; }
  const receipt = { schema: OBSERVATORY_SCHEMA, source: 'https://api.apify.com/v2/store?sortBy=popularity (public, keyless)', ...meta,
    limits: ['The listing returned only the most popular part of the store; Actors beyond the sample are counted as having no traction, which the sample tail (1 or 0 users in 30 days) supports but does not prove.', 'Users are counted per Actor; one person using three Actors is three users.', 'Niche membership is a title match and misses differently named Actors.', '"Young" is inferred from low all-time users because the listing has no creation date.', 'Usage is not revenue. No earnings figure is published per Actor.'],
    effects: { accounts: 0, messages: 0, spend: 0, writes: 0 }, ...analyzeStore(actors, { storeTotal: meta.storeTotal }) };
  const out = path.join(root, 'artifacts/monetization-singularity', `apify-store-observatory-${String(meta.observedAt).slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, `${JSON.stringify(receipt, null, 1)}\n`);
  console.log(out); console.table(receipt.niches.map(n => ({ niche: n.niche, actors: n.actors, users30: n.users30Sum, young: n.youngActors, youngHit: n.youngWithTraction, rate: n.entrantTractionRate })));
}
