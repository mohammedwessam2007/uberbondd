import test from 'node:test';
import assert from 'node:assert/strict';
import { importXlsxPack, normalizeOoxmlCompat, XlsxImportError, COLUMN_ALIASES } from '../../revenue-os/src/xlsx-import.mjs';
import {
  validWorkbook, formulaInjectionWorkbook, manyRowsWorkbook, hiddenSheetWorkbook, hiddenRowWorkbook,
  duplicateAcrossSheetsWorkbook, dateVarietyWorkbook, corruptWorkbook, encryptedLikeWorkbookBuffer,
  aliasedHeadersWorkbook, namespacedWithAbsoluteTableTargetWorkbook, titleAndBannerBeforeHeaderWorkbook
} from '../../revenue-os/fixtures/xlsx-fixtures.mjs';

const OPTS = { packType: 'qualified_agency', packVersion: 1, sourceFile: 'test.xlsx' };

test('importXlsxPack accepts a well-formed workbook end to end', async () => {
  const buf = await validWorkbook();
  const result = await importXlsxPack(buf, OPTS);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.quarantined.length, 0);
  assert.equal(result.workbook.sheetsTotal, 1);
  assert.equal(result.sheetReports[0].missingMandatoryColumns.length, 0);
  assert.equal(result.accepted[0].raw.__sheet, 'Qualified Agencies');
  assert.equal(result.accepted[0].raw.__row, 2);
  assert.ok(result.accepted[0].raw.__cellRefs.organizationDomain);
  assert.equal(result.accepted[0].raw.__workbookHash.length, 64);
});

test('importXlsxPack rejects a non-.xlsx extension before parsing', async () => {
  const buf = await validWorkbook();
  await assert.rejects(() => importXlsxPack(buf, { ...OPTS, sourceFile: 'workbook.xlsm' }), (e) => e instanceof XlsxImportError && e.code === 'unsupported-extension');
  await assert.rejects(() => importXlsxPack(buf, { ...OPTS, sourceFile: 'workbook.xlsb' }), (e) => e instanceof XlsxImportError && e.code === 'unsupported-extension');
  await assert.rejects(() => importXlsxPack(buf, { ...OPTS, sourceFile: 'workbook.xls' }), (e) => e instanceof XlsxImportError && e.code === 'unsupported-extension');
});

test('importXlsxPack rejects an oversized file', async () => {
  const buf = await validWorkbook();
  await assert.rejects(() => importXlsxPack(buf, { ...OPTS, maxFileBytes: 10 }), (e) => e instanceof XlsxImportError && e.code === 'file-too-large');
});

test('importXlsxPack rejects an empty buffer and a non-buffer input', async () => {
  await assert.rejects(() => importXlsxPack(Buffer.alloc(0), OPTS), (e) => e instanceof XlsxImportError && e.code === 'empty-file');
  await assert.rejects(() => importXlsxPack('not a buffer', OPTS), (e) => e instanceof XlsxImportError && e.code === 'invalid-input');
});

// --- formula-injection ---

test('formula-injection: mandatory-field formula is discarded (quarantined as missing), non-mandatory formula is used as inert cached text', async () => {
  const buf = await formulaInjectionWorkbook();
  const result = await importXlsxPack(buf, { ...OPTS, packType: 'buyer_intent' });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.quarantined.length, 1);
  assert.ok(result.quarantined[0].reasons.includes('invalid-or-missing-domain'));
  assert.equal(result.quarantined[0].raw.organizationDomain, undefined);
  assert.equal(result.quarantined[0].raw.notes, 'formula-target.invalid-note');
  const mandatoryFormula = result.disclosures.formulaCells.find(f => f.field === 'organizationDomain');
  assert.equal(mandatoryFormula.mandatory, true);
  const notesFormula = result.disclosures.formulaCells.find(f => f.field === 'notes');
  assert.equal(notesFormula.mandatory, false);
});

// --- oversized workbook (row-limit) ---

test('oversized workbook: too many rows in a sheet throws too-many-rows against a small test limit', async () => {
  const buf = await manyRowsWorkbook(50);
  await assert.rejects(() => importXlsxPack(buf, { ...OPTS, packType: 'priority_list', maxRowsPerSheet: 10 }), (e) => e instanceof XlsxImportError && e.code === 'too-many-rows');
  const result = await importXlsxPack(buf, { ...OPTS, packType: 'priority_list', maxRowsPerSheet: 1000 });
  assert.equal(result.accepted.length, 50);
});

test('too many sheets throws too-many-sheets against a small test limit', async () => {
  const buf = await validWorkbook();
  await assert.rejects(() => importXlsxPack(buf, { ...OPTS, maxSheets: 0 }), (e) => e instanceof XlsxImportError && e.code === 'too-many-sheets');
});

// --- hidden sheet / hidden row ---

test('hidden sheet: excluded by default, disclosed in disclosures.hiddenSheets, includable via includeHiddenSheets', async () => {
  const buf = await hiddenSheetWorkbook();
  const excluded = await importXlsxPack(buf, { ...OPTS, packType: 'approval_queue' });
  assert.equal(excluded.accepted.length, 1);
  assert.equal(excluded.accepted[0].raw.organizationDomain, 'visible-row.invalid');
  assert.deepEqual(excluded.disclosures.hiddenSheets, [{ sheet: 'Internal Notes', state: 'hidden' }]);

  const included = await importXlsxPack(buf, { ...OPTS, packType: 'approval_queue', includeHiddenSheets: true });
  assert.equal(included.accepted.length, 2);
  assert.ok(included.accepted.some(r => r.raw.organizationDomain === 'hidden-row.invalid'));
});

test('hidden row: excluded by default, disclosed in disclosures.hiddenRows, includable via includeHiddenRows', async () => {
  const buf = await hiddenRowWorkbook();
  const excluded = await importXlsxPack(buf, { ...OPTS, packType: 'channel_signal_evidence' });
  assert.equal(excluded.accepted.length, 1);
  assert.equal(excluded.accepted[0].raw.organizationDomain, 'shown.invalid');
  assert.deepEqual(excluded.disclosures.hiddenRows, [{ sheet: 'Channel Signal Evidence', row: 3 }]);
  assert.equal(excluded.sheetReports[0].rowsSkippedHidden, 1);

  const included = await importXlsxPack(buf, { ...OPTS, packType: 'channel_signal_evidence', includeHiddenRows: true });
  assert.equal(included.accepted.length, 2);
});

// --- duplicate row (domain + organization, across sheets) ---

test('duplicate row: same domain+organization across two sheets is quarantined by the workbook-level dedup pass', async () => {
  const buf = await duplicateAcrossSheetsWorkbook();
  const result = await importXlsxPack(buf, OPTS);
  assert.equal(result.accepted.length, 1);
  const dup = result.quarantined.find(q => q.reasons.includes('duplicate-domain-and-organization-in-workbook'));
  assert.ok(dup);
  assert.equal(dup.raw.organizationDomain, 'dupe.invalid');
});

// --- date parsing ---

test('date parsing: native Excel date, ISO string, and loose-but-parseable string are all accepted; an unparseable string is quarantined', async () => {
  const buf = await dateVarietyWorkbook();
  const result = await importXlsxPack(buf, { ...OPTS, packType: 'buyer_intent' });
  const acceptedDomains = result.accepted.map(r => r.organizationDomain).sort();
  assert.deepEqual(acceptedDomains, ['iso-string.invalid', 'loose-string.invalid', 'native-date.invalid']);
  const nativeRecord = result.accepted.find(r => r.organizationDomain === 'native-date.invalid');
  assert.equal(nativeRecord.capturedAt, '2026-06-01T00:00:00.000Z');
  const invalidQuarantine = result.quarantined.find(q => q.raw.organizationDomain === 'invalid-date.invalid');
  assert.ok(invalidQuarantine.reasons.includes('missing-or-invalid-timestamp'));
});

// --- corrupt / encrypted workbook ---

test('corrupt workbook: a truncated but ZIP-signature-intact file fails exceljs parsing with corrupt-workbook', async () => {
  const buf = await corruptWorkbook();
  await assert.rejects(() => importXlsxPack(buf, OPTS), (e) => e instanceof XlsxImportError && e.code === 'corrupt-workbook');
});

test('encrypted-or-legacy container: a CFB-signature file is rejected before any parse attempt', async () => {
  const buf = encryptedLikeWorkbookBuffer();
  await assert.rejects(() => importXlsxPack(buf, OPTS), (e) => e instanceof XlsxImportError && e.code === 'encrypted-or-legacy-format');
});

test('unknown container: neither ZIP nor CFB signature is rejected as not-xlsx', async () => {
  const buf = Buffer.from('this is not a spreadsheet at all, just plain text bytes');
  await assert.rejects(() => importXlsxPack(buf, OPTS), (e) => e instanceof XlsxImportError && e.code === 'not-xlsx');
});

// --- column aliasing / mapping report ---

test('column aliasing: varied real-world header spellings resolve via COLUMN_ALIASES and are reported in the mapping report', async () => {
  const buf = await aliasedHeadersWorkbook();
  const result = await importXlsxPack(buf, { ...OPTS, packType: 'channel_signal_evidence' });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].organizationDomain, 'aliased.invalid');
  const report = result.sheetReports[0];
  assert.equal(report.columnMap.organizationDomain, 1); // "Website" column
  assert.equal(report.columnMap.channel, 3); // "Contact Channel" column
  assert.equal(report.unmappedHeaders.length, 0);
  assert.ok(Object.keys(COLUMN_ALIASES).includes('organizationDomain'));
});

// --- sheet allowlist ---

test('sheet allowlist: a sheet not in the allowlist is skipped and disclosed, not silently dropped', async () => {
  const buf = await hiddenSheetWorkbook(); // has "Approval Queue" (visible) and "Internal Notes" (hidden)
  const result = await importXlsxPack(buf, { ...OPTS, packType: 'approval_queue', sheetAllowlist: ['Approval Queue'] });
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.disclosures.skippedSheetsNotAllowlisted, ['Internal Notes']);
});

// --- OOXML compatibility normalization (found against a real operational workbook) ---

test('normalizeOoxmlCompat rewrites a namespace-prefixed workbook and an absolute-path table Target so exceljs can parse it', async () => {
  const buf = await namespacedWithAbsoluteTableTargetWorkbook();
  const { buffer: normalized, applied } = await normalizeOoxmlCompat(buf);
  assert.equal(applied, true);
  assert.notDeepEqual(normalized, buf);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(normalized); // would throw before the fix ("Cannot read properties of undefined")
  assert.equal(wb.worksheets.length, 1);
});

test('normalizeOoxmlCompat is a no-op (byte-identical) for a normally-authored workbook', async () => {
  const buf = await validWorkbook();
  const { buffer: normalized, applied } = await normalizeOoxmlCompat(buf);
  assert.equal(applied, false);
  assert.equal(normalized, buf);
});

test('importXlsxPack transparently imports a namespace-prefixed workbook with an absolute table Target, and discloses that normalization ran', async () => {
  const buf = await namespacedWithAbsoluteTableTargetWorkbook();
  const result = await importXlsxPack(buf, { ...OPTS, packType: 'priority_list' });
  assert.equal(result.disclosures.ooxmlCompatNormalizationApplied, true);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].organizationDomain, 'prefixed-quirk.invalid');
});

test('importXlsxPack does not flag normalization as applied for a normally-authored workbook', async () => {
  const buf = await validWorkbook();
  const result = await importXlsxPack(buf, OPTS);
  assert.equal(result.disclosures.ooxmlCompatNormalizationApplied, false);
});

// --- header-row auto-detection (found against a real workbook with a title + banner row) ---

test('importXlsxPack detects a header row after a title row and a merged summary banner, not just row 1', async () => {
  const buf = await titleAndBannerBeforeHeaderWorkbook();
  const result = await importXlsxPack(buf, { ...OPTS, packType: 'buyer_intent' });
  assert.equal(result.sheetReports[0].headerRow, 3);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].organizationDomain, 'banner-offset.invalid');
  assert.equal(result.accepted[0].raw.__row, 4); // lineage still reports the true spreadsheet row
});

test('importXlsxPack still detects header row 1 for every existing row-1-header fixture (no regression)', async () => {
  const buf = await validWorkbook();
  const result = await importXlsxPack(buf, OPTS);
  assert.equal(result.sheetReports[0].headerRow, 1);
});
