// Single Audit radar hindcast (experiment X1, pre-registered in
// artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json).
//
// The radar flags a nonprofit whose direct federal obligations in a federal
// fiscal year reach the Single Audit threshold while it has no FAC filing
// history known at forecast time. The hindcast asks how often such an entity
// did in fact file. Pure functions; the script supplies the data.

export const PRE_2024_THRESHOLD_USD = 750_000;

// FAC rows migrated from the Census clearinghouse carry these instead of a
// real UEI (every 2016-2021 row is GSA_MIGRATION), so they identify nothing.
export const PLACEHOLDER_UEIS = new Set(['GSA_MIGRATION', 'XXXXXXXXXXXX']);

// Streaming RFC 4180 reader: yields each record as an array of strings.
export async function* csvRecords(chunks) {
  let field = '';
  let record = [];
  let quoted = false;
  let pendingQuote = false;
  for await (const chunk of chunks) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (pendingQuote) {
        pendingQuote = false;
        if (c === '"') { field += '"'; continue; }
        quoted = false;
      }
      if (quoted) {
        if (c === '"') pendingQuote = true;
        else field += c;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === ',') { record.push(field); field = ''; }
      else if (c === '\n') { record.push(field); yield record; record = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field.length || record.length) { record.push(field); yield record; }
}

export async function* csvObjects(chunks, columns) {
  let header = null;
  let picks = null;
  for await (const record of csvRecords(chunks)) {
    if (!header) {
      header = record.map(h => h.replace(/^﻿/, '').trim());
      picks = columns.map(name => {
        const index = header.indexOf(name);
        if (index < 0) throw new Error(`csv column missing: ${name}`);
        return [name, index];
      });
      continue;
    }
    if (record.length === 1 && record[0] === '') continue;
    yield Object.fromEntries(picks.map(([name, index]) => [name, (record[index] ?? '').trim()]));
  }
}

const NAME_NOISE = new Set(['THE', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'LLC', 'LTD', 'CO', 'NFP', 'NP']);

export function normalizeEntityName(name = '') {
  return String(name).toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/).filter(word => word && !NAME_NOISE.has(word)).join(' ');
}

export const nameStateKey = (name, state) => `${normalizeEntityName(name)}|${String(state ?? '').toUpperCase()}`;

// general rows: { report_id, auditee_uei, audit_year, auditee_name, auditee_state, auditor_firm_name, fac_accepted_date }
// additional rows: { report_id, additional_uei }
export function buildFacIndex(generalRows, additionalRows = []) {
  const reports = new Map();
  const byUei = new Map();
  const byNameState = new Map();
  const push = (map, key, value) => { if (!key) return; const list = map.get(key); if (list) list.push(value); else map.set(key, [value]); };
  for (const row of generalRows) {
    const report = { reportId: row.report_id, year: Number(row.audit_year), accepted: row.fac_accepted_date, uei: row.auditee_uei, auditor: row.auditor_firm_name };
    reports.set(row.report_id, report);
    if (!PLACEHOLDER_UEIS.has(row.auditee_uei)) push(byUei, row.auditee_uei, report);
    push(byNameState, nameStateKey(row.auditee_name, row.auditee_state), report);
  }
  for (const row of additionalRows) {
    const report = reports.get(row.report_id);
    if (report) push(byUei, row.additional_uei, { ...report, viaAdditionalUei: true });
  }
  return { reports, byUei, byNameState };
}

function matchingReports(index, recipient) {
  return [...(index.byUei.get(recipient.uei) ?? []), ...(index.byNameState.get(nameStateKey(recipient.name, recipient.state)) ?? [])];
}

// recipients: [{ uei, name, state, amount }] with amount = FY direct obligations.
export function runHindcast({ recipients, index, thresholdUsd = PRE_2024_THRESHOLD_USD, forecastDate, historyYears, primaryOutcomeYears, strictOutcomeYears, laterYears, coreCapUsd = 5_000_000 }) {
  const flagged = [];
  const excluded = { belowThreshold: 0, knownFilerAtForecast: 0, missingUei: 0 };
  for (const recipient of recipients) {
    if (!recipient.uei) { excluded.missingUei += 1; continue; }
    if (!(recipient.amount >= thresholdUsd)) { excluded.belowThreshold += 1; continue; }
    const reports = matchingReports(index, recipient);
    const known = reports.some(r => historyYears.includes(r.year) && r.accepted && r.accepted < forecastDate);
    if (known) { excluded.knownFilerAtForecast += 1; continue; }
    const years = [...new Set(reports.map(r => r.year))].sort();
    const outcome = reports.some(r => primaryOutcomeYears.includes(r.year)) ? 'FILED_PRIMARY'
      : reports.some(r => laterYears.includes(r.year)) ? 'FILED_LATER_ONLY' : 'NEVER_FILED';
    flagged.push({
      uei: recipient.uei, name: recipient.name, state: recipient.state, amount: recipient.amount,
      stratum: recipient.amount < coreCapUsd ? 'core' : 'large',
      outcome, strict: reports.some(r => strictOutcomeYears.includes(r.year)),
      filedYears: years, auditors: [...new Set(reports.filter(r => primaryOutcomeYears.includes(r.year)).map(r => r.auditor))],
    });
  }
  return { flagged, excluded };
}

const ratio = (n, d) => (d ? Number((n / d).toFixed(4)) : null);

export function summarizeHindcast(flagged, { states, killPrecision = 0.35, thinYieldMedian = 5 }) {
  const stratum = name => {
    const rows = flagged.filter(f => name === 'all' || f.stratum === name);
    const primary = rows.filter(f => f.outcome === 'FILED_PRIMARY').length;
    return { flagged: rows.length, filedPrimary: primary, filedLaterOnly: rows.filter(f => f.outcome === 'FILED_LATER_ONLY').length, neverFiled: rows.filter(f => f.outcome === 'NEVER_FILED').length, precisionPrimary: ratio(primary, rows.length), precisionStrict: ratio(rows.filter(f => f.strict).length, rows.length) };
  };
  const perState = Object.fromEntries(states.map(state => {
    const rows = flagged.filter(f => f.state === state && f.stratum === 'core');
    return [state, { coreFlagged: rows.length, trueNewObligors: rows.filter(f => f.outcome === 'FILED_PRIMARY').length }];
  }));
  const yields = states.map(s => perState[s].trueNewObligors).sort((a, b) => a - b);
  const medianYield = yields.length ? yields[Math.floor((yields.length - 1) / 2)] : 0;
  const core = stratum('core');
  let decision;
  if (core.precisionPrimary === null || core.precisionPrimary < killPrecision) decision = 'KILL';
  else if (medianYield < thinYieldMedian) decision = 'PRECISE_BUT_THIN';
  else decision = 'CONTINUE';
  return { core, large: stratum('large'), all: stratum('all'), perState, medianCoreYieldPerState: medianYield, decision };
}

// Descriptive market facts from FAC alone. general rows as in buildFacIndex.
export function facMarketFacts(generalRows, additionalUeis = new Set(), { years }) {
  const byYear = new Map();
  for (const row of generalRows) {
    if (PLACEHOLDER_UEIS.has(row.auditee_uei)) continue;
    const year = Number(row.audit_year);
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year).set(row.auditee_uei, normalizeEntityName(row.auditor_firm_name));
  }
  const facts = {};
  for (const year of years) {
    const current = byYear.get(year) ?? new Map();
    const prior = [1, 2, 3].map(k => byYear.get(year - k) ?? new Map());
    const previous = byYear.get(year - 1) ?? new Map();
    let firstTime = 0;
    const firstTimeFirms = new Map();
    let continuing = 0;
    let changed = 0;
    for (const [uei, firm] of current) {
      if (!prior.some(m => m.has(uei)) && !additionalUeis.has(uei)) {
        firstTime += 1;
        firstTimeFirms.set(firm, (firstTimeFirms.get(firm) ?? 0) + 1);
      }
      if (previous.has(uei)) { continuing += 1; if (previous.get(uei) && firm && previous.get(uei) !== firm) changed += 1; }
    }
    const firms = new Map();
    for (const firm of current.values()) firms.set(firm, (firms.get(firm) ?? 0) + 1);
    const sorted = [...firms.values()].sort((a, b) => b - a);
    const top = n => ratio(sorted.slice(0, n).reduce((s, v) => s + v, 0), current.size);
    facts[year] = {
      reports: current.size, firstTimeFilers: firstTime, firstTimeFilerAuditorFirms: firstTimeFirms.size,
      distinctAuditorFirms: firms.size, top10FirmShare: top(10), top100FirmShare: top(100),
      firmsWith1to5Audits: sorted.filter(v => v <= 5).length,
      auditorChangeRate: ratio(changed, continuing), continuingEntities: continuing,
    };
  }
  return facts;
}
