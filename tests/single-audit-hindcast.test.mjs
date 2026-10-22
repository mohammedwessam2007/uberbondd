import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { csvRecords, csvObjects, normalizeEntityName, buildFacIndex, runHindcast, summarizeHindcast, facMarketFacts, PRE_2024_THRESHOLD_USD } from '../src/single-audit-hindcast.mjs';

const collect = async iterable => { const out = []; for await (const x of iterable) out.push(x); return out; };

test('csv reader handles quotes, escaped quotes, embedded newlines and chunk boundaries', async () => {
  const text = 'a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\n1,,3\n';
  for (const size of [1, 2, 3, 7, 1000]) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) chunks.push(Buffer.from(text.slice(i, i + size)));
    const rows = await collect(csvRecords(Readable.from(chunks)));
    assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'he said "hi"', 'line1\nline2'], ['1', '', '3']], `chunk size ${size}`);
  }
});

test('csvObjects refuses a missing column instead of yielding blanks', async () => {
  await assert.rejects(collect(csvObjects(Readable.from(['a,b\n1,2\n']), ['a', 'zzz'])), /column missing: zzz/);
});

test('entity names normalize punctuation and corporate suffixes only', () => {
  assert.equal(normalizeEntityName('The Boys & Girls Club of Atlanta, Inc.'), 'BOYS AND GIRLS CLUB OF ATLANTA');
  assert.notEqual(normalizeEntityName('Habitat Co-op'), normalizeEntityName('Habitat'));
});

const general = [
  { report_id: 'r1', auditee_uei: 'KNOWN1', audit_year: '2021', auditee_name: 'Known Org', auditee_state: 'GA', auditor_firm_name: 'Firm A', fac_accepted_date: '2022-03-01' },
  { report_id: 'r2', auditee_uei: 'NEW1', audit_year: '2023', auditee_name: 'New Org', auditee_state: 'GA', auditor_firm_name: 'Firm B', fac_accepted_date: '2024-03-01' },
  { report_id: 'r3', auditee_uei: 'LATE1', audit_year: '2022', auditee_name: 'Late Org', auditee_state: 'GA', auditor_firm_name: 'Firm C', fac_accepted_date: '2024-01-01' },
  { report_id: 'r4', auditee_uei: 'LATE1', audit_year: '2023', auditee_name: 'Late Org', auditee_state: 'GA', auditor_firm_name: 'Firm C', fac_accepted_date: '2024-06-01' },
  { report_id: 'r5', auditee_uei: 'OLDUEI', audit_year: '2020', auditee_name: 'Renamed UEI Org, Inc.', auditee_state: 'GA', auditor_firm_name: 'Firm D', fac_accepted_date: '2021-01-01' },
  { report_id: 'r6', auditee_uei: 'PARENT', audit_year: '2022', auditee_name: 'Parent', auditee_state: 'GA', auditor_firm_name: 'Firm E', fac_accepted_date: '2023-01-01' },
  { report_id: 'r7', auditee_uei: 'SLOW1', audit_year: '2025', auditee_name: 'Slow Org', auditee_state: 'GA', auditor_firm_name: 'Firm F', fac_accepted_date: '2026-02-01' },
];
const additional = [{ report_id: 'r6', additional_uei: 'CHILD1' }];
const options = { forecastDate: '2023-10-01', historyYears: [2019, 2020, 2021, 2022], primaryOutcomeYears: [2023, 2024], strictOutcomeYears: [2023], laterYears: [2025, 2026] };

test('hindcast excludes known filers by UEI, additional UEI and name+state, and scores outcomes', () => {
  const index = buildFacIndex(general, additional);
  const recipients = [
    { uei: 'KNOWN1', name: 'Known Org', state: 'GA', amount: 2e6 },
    { uei: 'CHILD1', name: 'Child', state: 'GA', amount: 2e6 },
    { uei: 'NEWUEI', name: 'Renamed UEI Org', state: 'GA', amount: 2e6 },
    { uei: 'NEW1', name: 'New Org', state: 'GA', amount: 900_000 },
    { uei: 'LATE1', name: 'Late Org', state: 'GA', amount: 1e6 },
    { uei: 'SLOW1', name: 'Slow Org', state: 'GA', amount: 1e6 },
    { uei: 'GHOST', name: 'Ghost', state: 'GA', amount: 8e6 },
    { uei: 'SMALL', name: 'Small', state: 'GA', amount: PRE_2024_THRESHOLD_USD - 1 },
    { uei: '', name: 'No UEI', state: 'GA', amount: 5e6 },
  ];
  const { flagged, excluded } = runHindcast({ recipients, index, ...options });
  assert.deepEqual(excluded, { belowThreshold: 1, knownFilerAtForecast: 3, missingUei: 1 });
  const by = Object.fromEntries(flagged.map(f => [f.uei, f]));
  assert.equal(by.NEW1.outcome, 'FILED_PRIMARY');
  assert.equal(by.NEW1.strict, true);
  assert.deepEqual(by.NEW1.auditors, ['Firm B']);
  assert.equal(by.LATE1.outcome, 'FILED_PRIMARY', 'a 2022 report accepted after the forecast date was not known at forecast time');
  assert.equal(by.SLOW1.outcome, 'FILED_LATER_ONLY');
  assert.equal(by.GHOST.outcome, 'NEVER_FILED');
  assert.equal(by.GHOST.stratum, 'large');

  const summary = summarizeHindcast(flagged, { states: ['GA'] });
  assert.deepEqual(summary.core, { flagged: 3, filedPrimary: 2, filedLaterOnly: 1, neverFiled: 0, precisionPrimary: 0.6667, precisionStrict: 0.6667 });
  assert.equal(summary.decision, 'PRECISE_BUT_THIN', 'two true new obligors in one state is below the pre-registered yield of five');
});

test('decision is KILL below 35% core precision and when nothing is flagged', () => {
  const rows = n => Array.from({ length: n }, (_, i) => ({ state: 'GA', stratum: 'core', outcome: i < 3 ? 'FILED_PRIMARY' : 'NEVER_FILED', strict: i < 3 }));
  assert.equal(summarizeHindcast(rows(10), { states: ['GA'] }).decision, 'KILL');
  assert.equal(summarizeHindcast([], { states: ['GA'] }).decision, 'KILL');
  assert.equal(summarizeHindcast(rows(6).map(r => ({ ...r, outcome: 'FILED_PRIMARY' })), { states: ['GA'] }).decision, 'CONTINUE');
});

test('market facts count first-time filers and auditor changes', () => {
  const rows = [
    { audit_year: '2022', auditee_uei: 'A', auditor_firm_name: 'Firm X' },
    { audit_year: '2023', auditee_uei: 'A', auditor_firm_name: 'Firm Y, LLC' },
    { audit_year: '2023', auditee_uei: 'B', auditor_firm_name: 'Firm X' },
    { audit_year: '2023', auditee_uei: 'C', auditor_firm_name: 'Firm X' },
  ];
  rows.push({ audit_year: '2023', auditee_uei: 'GSA_MIGRATION', auditor_firm_name: 'Firm Z' });
  const facts = facMarketFacts(rows, new Set(['C']), { years: [2023] })[2023];
  assert.equal(facts.reports, 3, 'placeholder UEIs identify nothing and are not counted');
  assert.equal(facts.firstTimeFilers, 1, 'C is covered as an additional UEI elsewhere');
  assert.equal(facts.auditorChangeRate, 1);
  assert.equal(facts.distinctAuditorFirms, 2);
});
