#!/usr/bin/env node
// Experiment X2: snapshot the public Apify Store listing and test the
// pre-registered breakage hypotheses. No account, no key, read-only.
//   node scripts/apify-store-observatory.mjs --out <result.json> --snapshot <compact-snapshot.jsonl outside git>
// Amendment X2-A1: the Store returns nothing at offset >= 15,000, so the
// listing is the union of a global and per-category popularity-sorted crawl.
// Amendment X2-A2: capped partitions are also crawled by newest, lastUpdate and
// relevance, and completeness is measured by enumeration.
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { compactActor, dedupeActors, analyzeStore, enumerationCompleteness, DEFINITIONS, STORE_OFFSET_CAP } from '../src/apify-store-observatory.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const out = flag('out');
const snapshotPath = flag('snapshot');
if (!out || !snapshotPath) { console.error('--out and --snapshot are required'); process.exit(2); }

const ledger = { storeCalls: 0, messages: 0, spendCents: 0, accounts: 0 };
const pages = [];
const raw = [];
const limit = 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const seenBy = new Map();
const seen = name => { if (!seenBy.has(name)) seenBy.set(name, new Set()); return seenBy.get(name); };

async function crawl(name, query, sortBy = 'popularity') {
  let reportedTotal = null;
  let lastPage = [];
  let reachedCap = false;
  for (let offset = 0; ; offset += limit) {
    if (offset >= STORE_OFFSET_CAP) { reachedCap = true; break; }
    // Idempotent public GET: retry a 5xx at most twice with backoff, and record every attempt.
    let response;
    let text;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      ledger.storeCalls += 1;
      response = await fetch(`https://api.apify.com/v2/store?limit=${limit}&offset=${offset}&sortBy=${sortBy}${query}`, { signal: AbortSignal.timeout(120_000) });
      text = await response.text();
      pages.push({ partition: name, sortBy, offset, attempt, status: response.status, sha256: crypto.createHash('sha256').update(text).digest('hex') });
      if (response.status < 500) break;
      await sleep(5000 * attempt);
    }
    if (!response.ok) throw new Error(`Store ${response.status} in ${name} at offset ${offset}; stopping rather than analysing a partial listing`);
    const { data } = JSON.parse(text);
    reportedTotal = data.total;
    await sleep(1100);
    if (data.items.length === 0) { reachedCap = offset < data.total; break; }
    lastPage = data.items.map(compactActor);
    raw.push(...lastPage);
    for (const actor of lastPage) seen(name).add(actor.id);
    if (offset + limit >= data.total) break;
  }
  return { name, reportedTotal, reachedCap, lastPageMaxUsers30: lastPage.length ? Math.max(...lastPage.map(a => a.users30)) : undefined };
}

const partitions = [await crawl('global', '')];
const categories = [...new Set(raw.flatMap(a => a.categories))].sort();
for (const category of categories) partitions.push(await crawl(`category:${category}`, `&category=${encodeURIComponent(category)}`));
for (const partition of partitions.filter(p => p.reachedCap)) {
  const query = partition.name === 'global' ? '' : `&category=${encodeURIComponent(partition.name.slice('category:'.length))}`;
  for (const sortBy of ['newest', 'lastUpdate', 'relevance']) await crawl(partition.name, query, sortBy);
}
// A category's distinct count also includes Actors first met in the global
// crawl or another category, as long as they list that category.
for (const actor of dedupeActors(raw)) { seen('global').add(actor.id); for (const c of actor.categories) seen(`category:${c}`).add(actor.id); }
for (const partition of partitions) partition.distinct = seen(partition.name).size;

const actors = dedupeActors(raw);
const snapshotText = actors.map(a => JSON.stringify(a)).join('\n') + '\n';
mkdirSync(dirname(snapshotPath), { recursive: true });
writeFileSync(snapshotPath, snapshotText);

const coverageCheck = enumerationCompleteness(partitions);
const analysis = analyzeStore(actors, DEFINITIONS, { complete: coverageCheck.complete });
const receipt = {
  schema: 'uberbond.machiavelli.x2-apify-store-observatory.v3',
  preregistration: 'artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json (amendments X2-A1, X2-A2)',
  snapshotAt: new Date().toISOString(),
  source: 'GET https://api.apify.com/v2/store (public, unauthenticated), global + per category by popularity; capped partitions also by newest, lastUpdate, relevance',
  coverage: { globalReportedTotal: partitions[0].reportedTotal, itemsRead: raw.length, distinctActors: actors.length, completeness: coverageCheck, partitions },
  snapshot: { storedOutsideGit: true, lines: actors.length, sha256: crypto.createHash('sha256').update(snapshotText).digest('hex') },
  pages,
  definitions: DEFINITIONS,
  ...analysis,
  migrationRetest: 'Re-run this script on or after 2026-11-05 and compare users30 of each leader and its topSubstitutes below; one snapshot cannot measure migration.',
  readOnlyLedger: ledger,
  truthBoundary: 'Public listing statistics. Run failure share includes failures caused by user input. Not demand for a new Actor, not revenue, not a payout.',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
const { leaders, ...headline } = analysis;
console.log(JSON.stringify({ coverage: { ...receipt.coverage, partitions: partitions.map(p => `${p.name} total=${p.reportedTotal} distinct=${p.distinct} cap=${p.reachedCap}`) }, ...headline, top: leaders.slice(0, 30).map(l => `${l.users30} u30 | fail ${l.failShare} | subs ${l.healthySubstitutes}${l.absorbed ? ' ABSORBED' : ''} | ${l.id} | ${l.title}`), ledger }, null, 2));
