// Single Audit Obligation Forecast Ledger (Prediction Accounting over public data).
//
// A US non-federal entity that expends at least $1,000,000 of federal awards
// in a fiscal year beginning on or after 2024-10-01 must obtain a Single
// Audit and file it with the Federal Audit Clearinghouse (2 CFR 200.501).
// This module estimates, from public USAspending award outlays, which
// entities are likely to cross the threshold but have no FAC filing history,
// and records each estimate as a dated, falsifiable forecast. When the FAC
// filing window closes, each forecast is resolved against FAC and scored
// (Brier). The scored track record, not any single lead, is the asset a
// paying audit firm can trust.
//
// Founder ancestry: founder-moonshot-0059 (Prediction Accounting), 0178
// (Missing-Market Detector), 0013 (Observability Engine). Tournament rank 1
// (2026-10-22), WOUNDED: willingness to pay is unproven; nothing is sold here.

import crypto from 'node:crypto';
import { normalCdf } from './quant-backtest.mjs';

export const SINGLE_AUDIT_FORECAST_VERSION = 'uberbond.single-audit-forecast-ledger-1.0.0';
export const SINGLE_AUDIT_THRESHOLD_USD = 1_000_000;
const DAY = 86_400_000;
const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Expected federal expenditure inside [fyStart, fyEnd] for one recipient.
 * Assumption (stated, to be graded by the ledger): each award's outlays are
 * spread evenly over its period of performance, and the not-yet-outlaid
 * obligation is spent evenly over the remaining period from `asOf`.
 */
export function estimateFiscalYearExpenditure(awards, { fyStart, fyEnd, asOf }) {
  const from = Date.parse(fyStart), to = Date.parse(fyEnd), now = Date.parse(asOf);
  let expected = 0, awardsCounted = 0;
  for (const award of awards) {
    const start = Date.parse(award.startDate), end = Date.parse(award.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const outlays = Math.max(0, Number(award.totalOutlays) || 0);
    const remaining = Math.max(0, (Number(award.awardAmount) || 0) - outlays);
    const overlap = (a, b) => Math.max(0, Math.min(b, to) - Math.max(a, from));
    const pastSpan = Math.max(DAY, Math.min(now, end) - start);
    const futureSpan = Math.max(DAY, end - Math.max(now, start));
    const past = outlays * overlap(start, Math.min(now, end)) / pastSpan;
    const future = now < end ? remaining * overlap(Math.max(now, start), end) / futureSpan : 0;
    if (past + future > 0) awardsCounted += 1;
    expected += past + future;
  }
  return { expectedUsd: Math.round(expected), awardsCounted };
}

/** P(expenditure >= threshold) under log-normal estimation error with dispersion sigma. */
export function crossingProbability(expectedUsd, { thresholdUsd = SINGLE_AUDIT_THRESHOLD_USD, sigma = 0.5 } = {}) {
  if (!(expectedUsd > 0)) return 0;
  return normalCdf((Math.log(expectedUsd) - Math.log(thresholdUsd)) / sigma);
}

/** Group award rows by recipient UEI. */
export function groupByRecipient(rows) {
  const map = new Map();
  for (const row of rows) {
    const uei = String(row['Recipient UEI'] ?? '').trim();
    if (!/^[A-Z0-9]{12}$/.test(uei)) continue;
    const entry = map.get(uei) ?? { uei, name: row['Recipient Name'], awards: [] };
    entry.awards.push({ awardId: row['Award ID'], awardAmount: row['Award Amount'], totalOutlays: row['Total Outlays'], startDate: row['Start Date'], endDate: row['End Date'], agency: row['Awarding Agency'] });
    map.set(uei, entry);
  }
  return [...map.values()];
}

/**
 * Turn recipients into forecasts. Only entities with no FAC filing under their
 * own UEI are forecast as "new obligation" candidates; filers are recorded as
 * already-known so the ledger shows what was excluded and why.
 * facFilers: Set of UEIs with any FAC report.
 */
// Public bodies and university affiliates are almost always audited inside a
// parent report (statewide or university-system Single Audit) under another
// UEI. Falsified on the first live run (2026-10-22): own-UEI matching alone
// labelled Georgia Tech Research Corp a "new" obligation.
export const LIKELY_PARENT_COVERED = /\b(universit(?:y|ies)|college|state of|department|agency|county|city of|town of|school district|board of|authority|commission|research (?:foundation|institute|corp))\b/i;

export function compileForecasts({ recipients, facFilers, fiscalYear, asOf, state, minProbability = 0.2, sigma = 0.5, bandMinUsd = 400_000, bandMaxUsd = 5_000_000 }) {
  const fyStart = `${fiscalYear - 1}-10-01`, fyEnd = `${fiscalYear}-09-30`;
  const resolvesAfter = new Date(Date.parse(fyEnd) + 274 * DAY).toISOString().slice(0, 10); // ~9 months after FY end
  const forecasts = [], excluded = [];
  for (const recipient of recipients) {
    const estimate = estimateFiscalYearExpenditure(recipient.awards, { fyStart, fyEnd, asOf });
    const probability = crossingProbability(estimate.expectedUsd, { sigma });
    if (facFilers.has(recipient.uei)) { excluded.push({ uei: recipient.uei, reason: 'ALREADY_IN_FAC_OWN_OR_ADDITIONAL_UEI' }); continue; }
    if (LIKELY_PARENT_COVERED.test(String(recipient.name ?? ''))) { excluded.push({ uei: recipient.uei, reason: 'LIKELY_COVERED_BY_PARENT_AUDIT' }); continue; }
    // New crossings happen near the line; large recipients are established auditees.
    if (estimate.expectedUsd < bandMinUsd || estimate.expectedUsd > bandMaxUsd) { excluded.push({ uei: recipient.uei, reason: 'OUTSIDE_NEAR_THRESHOLD_BAND', expectedUsd: estimate.expectedUsd }); continue; }
    if (probability < minProbability) { excluded.push({ uei: recipient.uei, reason: 'BELOW_MIN_PROBABILITY', probability: Number(probability.toFixed(3)) }); continue; }
    forecasts.push({
      forecastId: sha256({ uei: recipient.uei, fiscalYear, asOf }).slice(0, 24),
      uei: recipient.uei,
      name: recipient.name,
      state,
      fiscalYear,
      claim: `Federal expenditure in FY${fiscalYear} (assumed Oct-Sep) will reach the $1,000,000 Single Audit threshold, and the entity has no FAC filing under its own UEI.`,
      probability: Number(probability.toFixed(3)),
      basis: { expectedUsd: estimate.expectedUsd, awardsCounted: estimate.awardsCounted, sigma, method: 'even outlay spread over period of performance; remaining obligation spread over remaining period' },
      madeAt: asOf,
      resolvesAfter,
      resolutionRule: 'YES if FAC holds a report for this UEI (or a reporting parent naming it) with audit_year covering the FY and total_amount_expended >= 1,000,000; NO otherwise once resolvesAfter has passed. Entity fiscal years that differ from Oct-Sep are a known source of error.'
    });
  }
  forecasts.sort((a, b) => b.probability - a.probability);
  return { forecasts, excluded };
}

/** Append forecasts to a hash chain; resolved later, never edited. */
export function appendForecasts(chain = [], forecasts) {
  let next = [...chain];
  for (const forecast of forecasts) {
    if (next.some(entry => entry.type === 'FORECAST' && entry.forecastId === forecast.forecastId)) continue;
    const body = { index: next.length, type: 'FORECAST', previousHash: next.length ? next.at(-1).hash : '0'.repeat(64), ...forecast };
    next = [...next, { ...body, hash: sha256(body) }];
  }
  return next;
}

export function resolveForecast(chain, { forecastId, outcome, evidence, resolvedAt }) {
  const forecast = chain.find(entry => entry.type === 'FORECAST' && entry.forecastId === forecastId);
  if (!forecast) throw new Error('unknown forecast');
  if (chain.some(entry => entry.type === 'RESOLUTION' && entry.forecastId === forecastId)) throw new Error('already resolved');
  if (Date.parse(resolvedAt) < Date.parse(forecast.resolvesAfter) && outcome !== 'YES') throw new Error('a NO resolution must wait for the filing window to close');
  if (!['YES', 'NO'].includes(outcome) || !evidence) throw new Error('outcome YES|NO with evidence required');
  const body = { index: chain.length, type: 'RESOLUTION', previousHash: chain.at(-1).hash, forecastId, outcome, evidence, resolvedAt, brier: (forecast.probability - (outcome === 'YES' ? 1 : 0)) ** 2 };
  return [...chain, { ...body, hash: sha256(body) }];
}

export function ledgerScore(chain = []) {
  const resolutions = chain.filter(entry => entry.type === 'RESOLUTION');
  const forecasts = chain.filter(entry => entry.type === 'FORECAST');
  let valid = true, previous = '0'.repeat(64);
  for (const [index, entry] of chain.entries()) {
    const { hash, ...body } = entry;
    if (body.index !== index || body.previousHash !== previous || sha256(body) !== hash) { valid = false; break; }
    previous = hash;
  }
  return {
    version: SINGLE_AUDIT_FORECAST_VERSION,
    chainValid: valid,
    forecasts: forecasts.length,
    resolved: resolutions.length,
    meanBrier: resolutions.length ? resolutions.reduce((sum, entry) => sum + entry.brier, 0) / resolutions.length : null,
    hitRate: resolutions.length ? resolutions.filter(entry => entry.outcome === 'YES').length / resolutions.length : null,
    note: 'A track record exists only after resolution; unresolved forecasts are hypotheses.'
  };
}
