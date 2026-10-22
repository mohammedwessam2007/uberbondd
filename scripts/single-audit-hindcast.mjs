#!/usr/bin/env node
// Experiment X1: Single Audit radar hindcast on federal FY2023.
//   node scripts/single-audit-hindcast.mjs --fac-dir <dir with general.csv, additional_ueis.csv> --out <file> [--states GA,OH,AZ]
// FAC bulk CSVs are keyless downloads from app.fac.gov/dissemination/public-data/gsa/full/.
// Reads USAspending (no key). Sends nothing, contacts no one.
import crypto from 'node:crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PRE_2024_THRESHOLD_USD, PLACEHOLDER_UEIS, csvObjects, buildFacIndex, runHindcast, summarizeHindcast, facMarketFacts } from '../src/single-audit-hindcast.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const facDir = flag('fac-dir');
const out = flag('out');
const states = flag('states', 'GA,OH,AZ').split(',');
if (!facDir || !out) { console.error('--fac-dir and --out are required'); process.exit(2); }

const ledger = { usaspendingCalls: 0, messages: 0, spendCents: 0 };
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const fileSha = path => new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); createReadStream(path).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject); });

const generalPath = join(facDir, 'general.csv');
const additionalPath = join(facDir, 'additional_ueis.csv');
const generalRows = [];
for await (const row of csvObjects(createReadStream(generalPath), ['report_id', 'auditee_uei', 'audit_year', 'auditee_name', 'auditee_state', 'auditor_firm_name', 'fac_accepted_date'])) generalRows.push(row);
const additionalRows = [];
for await (const row of csvObjects(createReadStream(additionalPath), ['report_id', 'additional_uei'])) additionalRows.push(row);
const index = buildFacIndex(generalRows, additionalRows);

const sources = [];
const recipients = [];
for (const state of states) {
  for (let page = 1; page <= 20; page += 1) {
    ledger.usaspendingCalls += 1;
    const body = { filters: { time_period: [{ start_date: '2022-10-01', end_date: '2023-09-30' }], award_type_codes: ['02', '03', '04', '05'], recipient_type_names: ['nonprofit'], place_of_performance_locations: [{ country: 'USA', state }] }, limit: 100, page };
    const response = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
    const text = await response.text();
    sources.push({ source: 'usaspending.spending_by_category.recipient', state, page, status: response.status, sha256: sha(text) });
    if (!response.ok) throw new Error(`USAspending ${response.status} for ${state} page ${page}; stopping rather than scoring a partial cohort`);
    const json = JSON.parse(text);
    for (const r of json.results) recipients.push({ uei: r.uei, name: r.name, state, amount: Number(r.amount) });
    const last = json.results.at(-1);
    if (!json.page_metadata?.hasNext || !last || Number(last.amount) < PRE_2024_THRESHOLD_USD) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

const { flagged, excluded } = runHindcast({
  recipients, index, forecastDate: '2023-10-01',
  historyYears: [2019, 2020, 2021, 2022], primaryOutcomeYears: [2023, 2024], strictOutcomeYears: [2023], laterYears: [2025, 2026],
});
const summary = summarizeHindcast(flagged, { states });

// Disclosed post-hoc diagnostic (not pre-registered): a "true positive" that has
// any 2019-2022 FAC report, accepted after the forecast date, is a late filer
// with an existing auditor, not a new obligor.
const lateFilers = flagged.filter(f => f.outcome === 'FILED_PRIMARY' && f.filedYears.some(y => y >= 2019 && y <= 2022));
const additionalUeis = new Set(additionalRows.map(r => r.additional_uei));
const marketFacts = facMarketFacts(generalRows, additionalUeis, { years: [2022, 2023, 2024] });
const placeholderRowsByYear = {};
for (const row of generalRows) if (PLACEHOLDER_UEIS.has(row.auditee_uei)) placeholderRowsByYear[row.audit_year] = (placeholderRowsByYear[row.audit_year] ?? 0) + 1;
const dataQuality = {
  placeholderUeiRowsByYear: placeholderRowsByYear,
  consequence: 'FAC 2016-2021 rows have no real UEI, so the hindcast history window 2019-2021 is matched by normalized name + state only, and first-time-filer counts are invalid for 2022 and partial for 2023 (one real prior year) and 2024 (two).',
  firstTimeFilerValidity: { 2022: 'INVALID', 2023: 'PARTIAL_ONE_PRIOR_YEAR', 2024: 'PARTIAL_TWO_PRIOR_YEARS' },
  auditorChangeRate: 'UPPER_BOUND: auditor firm names are free text and only normalized for punctuation and suffixes, so spelling variants count as changes.',
};

const receipt = {
  schema: 'uberbond.machiavelli.x1-single-audit-hindcast.v1',
  preregistration: 'artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json',
  ranAt: new Date().toISOString(),
  data: {
    facGeneral: { path: 'app.fac.gov/dissemination/public-data/gsa/full/general.csv', rows: generalRows.length, sha256: await fileSha(generalPath) },
    facAdditionalUeis: { path: 'app.fac.gov/dissemination/public-data/gsa/full/additional_ueis.csv', rows: additionalRows.length, sha256: await fileSha(additionalPath) },
    usaspending: sources,
  },
  cohort: { states, recipientsRead: recipients.length, excluded },
  summary,
  postHocDiagnostic: { lateFilersAmongCoreTruePositives: lateFilers.filter(f => f.stratum === 'core').length, note: 'Not pre-registered. These filed for 2023/2024 but also have a 2019-2022 report accepted after 2023-10-01: existing auditees filing late, not new clients for an audit firm.' },
  marketFacts,
  dataQuality,
  flagged,
  readOnlyLedger: ledger,
  truthBoundary: 'Hindcast precision of a lead-generation rule. Not buyer demand, not willingness to pay, not revenue. No entity, auditor or firm was contacted.',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ cohort: receipt.cohort, summary, postHocDiagnostic: receipt.postHocDiagnostic, marketFacts, ledger }, null, 2));
