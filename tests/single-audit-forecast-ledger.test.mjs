import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFiscalYearExpenditure, crossingProbability, groupByRecipient, compileForecasts, appendForecasts, resolveForecast, ledgerScore, LIKELY_PARENT_COVERED } from '../src/single-audit-forecast-ledger.mjs';

const fy = { fyStart: '2025-10-01', fyEnd: '2026-09-30', asOf: '2026-04-01T00:00:00Z' };

test('expenditure estimate spreads outlays over the period and the remainder over what is left', () => {
  // One 2-year award, $2.4M, half outlaid by mid-period: about $1.2M falls inside the fiscal year.
  const award = { awardAmount: 2_400_000, totalOutlays: 900_000, startDate: '2025-04-01', endDate: '2027-04-01' };
  const { expectedUsd, awardsCounted } = estimateFiscalYearExpenditure([award], fy);
  assert.equal(awardsCounted, 1);
  assert.ok(expectedUsd > 1_000_000 && expectedUsd < 1_400_000, String(expectedUsd));
  assert.equal(estimateFiscalYearExpenditure([{ awardAmount: 5e6, totalOutlays: 5e6, startDate: '2019-01-01', endDate: '2020-01-01' }], fy).expectedUsd, 0, 'expired awards contribute nothing');
  assert.equal(estimateFiscalYearExpenditure([{ awardAmount: 1, startDate: 'x', endDate: 'y' }], fy).awardsCounted, 0);
});

test('crossing probability is monotone and centred on the $1M threshold', () => {
  assert.ok(Math.abs(crossingProbability(1_000_000) - 0.5) < 1e-6);
  assert.ok(crossingProbability(2_000_000) > 0.9);
  assert.ok(crossingProbability(400_000) < 0.05);
  assert.equal(crossingProbability(0), 0);
});

test('forecast compilation excludes FAC filers, parent-covered bodies and the far-from-threshold', () => {
  const rows = [
    { 'Recipient UEI': 'AAAAAAAAAAA1', 'Recipient Name': 'COMMUNITY TEEN COALITION, INC', 'Award Amount': 2_400_000, 'Total Outlays': 900_000, 'Start Date': '2025-04-01', 'End Date': '2027-04-01' },
    { 'Recipient UEI': 'BBBBBBBBBBB2', 'Recipient Name': 'GEORGIA TECH RESEARCH CORP', 'Award Amount': 2_400_000, 'Total Outlays': 900_000, 'Start Date': '2025-04-01', 'End Date': '2027-04-01' },
    { 'Recipient UEI': 'CCCCCCCCCCC3', 'Recipient Name': 'ALREADY AUDITED INC', 'Award Amount': 2_400_000, 'Total Outlays': 900_000, 'Start Date': '2025-04-01', 'End Date': '2027-04-01' },
    { 'Recipient UEI': 'DDDDDDDDDDD4', 'Recipient Name': 'HUGE NONPROFIT INC', 'Award Amount': 90_000_000, 'Total Outlays': 40_000_000, 'Start Date': '2025-04-01', 'End Date': '2027-04-01' },
    { 'Recipient UEI': 'bad', 'Recipient Name': 'NO UEI', 'Award Amount': 1, 'Total Outlays': 1, 'Start Date': '2025-04-01', 'End Date': '2027-04-01' }
  ];
  const recipients = groupByRecipient(rows);
  assert.equal(recipients.length, 4, 'malformed UEIs are dropped');
  const { forecasts, excluded } = compileForecasts({ recipients, facFilers: new Set(['CCCCCCCCCCC3']), fiscalYear: 2026, asOf: fy.asOf, state: 'GA' });
  assert.deepEqual(forecasts.map(f => f.uei), ['AAAAAAAAAAA1']);
  assert.deepEqual(Object.fromEntries(excluded.map(e => [e.uei, e.reason])), { BBBBBBBBBBB2: 'LIKELY_COVERED_BY_PARENT_AUDIT', CCCCCCCCCCC3: 'ALREADY_IN_FAC_OWN_OR_ADDITIONAL_UEI', DDDDDDDDDDD4: 'OUTSIDE_NEAR_THRESHOLD_BAND' });
  assert.equal(forecasts[0].resolvesAfter, '2027-07-01');
  assert.ok(LIKELY_PARENT_COVERED.test('UNIVERSITY OF GEORGIA RESEARCH FOUNDATION, INC.'));
});

test('prediction accounting: append-only, NO waits for the filing window, Brier scored, tamper-evident', () => {
  const forecast = { forecastId: 'f1', uei: 'AAAAAAAAAAA1', probability: 0.7, resolvesAfter: '2027-07-01' };
  let chain = appendForecasts([], [forecast]);
  chain = appendForecasts(chain, [forecast]);
  assert.equal(chain.length, 1, 'the same forecast is never recorded twice');
  assert.throws(() => resolveForecast(chain, { forecastId: 'f1', outcome: 'NO', evidence: 'none yet', resolvedAt: '2027-01-01' }), /wait/);
  const early = resolveForecast(chain, { forecastId: 'f1', outcome: 'YES', evidence: 'FAC report 2026-…', resolvedAt: '2027-01-01' });
  assert.ok(Math.abs(early.at(-1).brier - 0.09) < 1e-12);
  assert.throws(() => resolveForecast(early, { forecastId: 'f1', outcome: 'YES', evidence: 'x', resolvedAt: '2027-02-01' }), /already/);
  const score = ledgerScore(early);
  assert.equal(score.chainValid, true);
  assert.equal(score.resolved, 1);
  const forged = structuredClone(early); forged[0].probability = 0.99;
  assert.equal(ledgerScore(forged).chainValid, false);
  assert.equal(ledgerScore(chain).meanBrier, null, 'no track record before resolution');
});

test('review regression: the track record cannot be inflated by early hits or unresolved misses', () => {
  const make = id => ({ forecastId: id, uei: `${id}AAAAAAAAAAA`.slice(0, 12), probability: 0.3, resolvesAfter: '2027-07-01' });
  let chain = appendForecasts([], ['a', 'b', 'c'].map(make));
  chain = resolveForecast(chain, { forecastId: 'a', outcome: 'YES', evidence: 'FAC', resolvedAt: '2027-01-01' });
  const early = ledgerScore(chain, { asOf: '2027-02-01' });
  assert.equal(early.hitRate, null, 'an early YES is not a track record');
  assert.equal(early.earlyResolutionsNotScored, 1);
  const overdue = ledgerScore(chain, { asOf: '2027-08-01' });
  assert.equal(overdue.status, 'INCOMPLETE_OVERDUE_FORECASTS_UNRESOLVED');
  assert.equal(overdue.overdueUnresolved, 2);
  assert.equal(overdue.hitRate, null, 'misses left unresolved must not produce a perfect hit rate');
  chain = resolveForecast(chain, { forecastId: 'b', outcome: 'NO', evidence: 'no FAC report', resolvedAt: '2027-08-01' });
  chain = resolveForecast(chain, { forecastId: 'c', outcome: 'NO', evidence: 'no FAC report', resolvedAt: '2027-08-01' });
  const complete = ledgerScore(chain, { asOf: '2027-08-02' });
  assert.equal(complete.status, 'COMPLETE');
  assert.ok(Math.abs(complete.hitRate - 1 / 3) < 1e-12);
});
