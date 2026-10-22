#!/usr/bin/env node
// Single Audit Obligation Radar: read-only public data -> dated forecasts.
//   node scripts/single-audit-radar.mjs --state GA --fiscal-year 2026 --out <file> [--pages 3]
// Reads USAspending (no key) and the Federal Audit Clearinghouse API
// (FAC_API_KEY or the public DEMO_KEY, within its rate limit). Sends nothing.
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { groupByRecipient, compileForecasts, appendForecasts, ledgerScore } from '../src/single-audit-forecast-ledger.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const state = flag('state', 'GA');
const fiscalYear = Number(flag('fiscal-year', 2026));
const pages = Number(flag('pages', 3));
const startPage = Number(flag('start-page', 1));
const out = flag('out');
if (!out) { console.error('--out is required'); process.exit(2); }
const asOf = new Date().toISOString();
const ledger = { usaspendingCalls: 0, facCalls: 0, messages: 0, spendCents: 0 };
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

const rows = [];
const sources = [];
for (let page = startPage; page < startPage + pages; page += 1) {
  ledger.usaspendingCalls += 1;
  const body = { filters: { time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }], award_type_codes: ['02', '03', '04', '05'], recipient_type_names: ['nonprofit'], place_of_performance_locations: [{ country: 'USA', state }] }, fields: ['Award ID', 'Recipient Name', 'Recipient UEI', 'Award Amount', 'Total Outlays', 'Start Date', 'End Date', 'Awarding Agency'], limit: 100, page, sort: 'Award Amount', order: 'desc' };
  const response = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  sources.push({ source: 'usaspending', page, status: response.status, sha256: sha(text) });
  if (!response.ok) break;
  const json = JSON.parse(text);
  rows.push(...json.results);
  if (!json.page_metadata?.hasNext) break;
}
const recipients = groupByRecipient(rows);

// FAC: which of these UEIs have ever filed. PostgREST "in" filter, chunked.
const facFilers = new Set();
const key = process.env.FAC_API_KEY || 'DEMO_KEY';
const ueis = recipients.map(r => r.uei);
for (let i = 0; i < ueis.length; i += 40) {
  ledger.facCalls += 1;
  const chunk = ueis.slice(i, i + 40);
  const response = await fetch(`https://api.fac.gov/general?select=auditee_uei,audit_year&auditee_uei=in.(${chunk.join(',')})&limit=1000`, { headers: { 'X-Api-Key': key }, signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  sources.push({ source: 'fac', chunk: i / 40, status: response.status, sha256: sha(text) });
  if (!response.ok) { console.error(`FAC ${response.status}: stopping; unchecked UEIs are excluded, not assumed non-filers`); for (const uei of ueis.slice(i)) facFilers.add(uei); break; }
  for (const row of JSON.parse(text)) facFilers.add(row.auditee_uei);
  // A UEI can be covered as an additional entity inside someone else's report.
  ledger.facCalls += 1;
  const additional = await fetch(`https://api.fac.gov/additional_ueis?select=additional_uei&additional_uei=in.(${chunk.join(',')})&limit=1000`, { headers: { 'X-Api-Key': key }, signal: AbortSignal.timeout(60_000) });
  const additionalText = await additional.text();
  sources.push({ source: 'fac-additional-ueis', chunk: i / 40, status: additional.status, sha256: sha(additionalText) });
  if (!additional.ok) { console.error(`FAC additional_ueis ${additional.status}: stopping; unchecked UEIs are excluded`); for (const uei of ueis.slice(i)) facFilers.add(uei); break; }
  for (const row of JSON.parse(additionalText)) facFilers.add(row.additional_uei);
}

const { forecasts, excluded } = compileForecasts({ recipients, facFilers, fiscalYear, asOf, state });
const chain = appendForecasts([], forecasts);
const receipt = { schema: 'uberbond.single-audit-radar-run.v1', asOf, state, fiscalYear, awardRows: rows.length, recipients: recipients.length, facFilersFound: facFilers.size, forecasts: forecasts.length, excludedSummary: excluded.reduce((m, e) => (m[e.reason] = (m[e.reason] ?? 0) + 1, m), {}), sources, readOnlyLedger: ledger, score: ledgerScore(chain), chain, truthBoundary: 'Forecasts are hypotheses until FAC resolution. No entity or audit firm was contacted.' };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ awardRows: rows.length, recipients: recipients.length, facFilersFound: facFilers.size, forecasts: forecasts.length, excluded: receipt.excludedSummary, top: forecasts.slice(0, 5).map(f => `${f.name} p=${f.probability} est=$${f.basis.expectedUsd}`), ledger }, null, 2));
