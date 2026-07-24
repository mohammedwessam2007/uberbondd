// Hostile + valid XLSX workbook fixtures for xlsx-import.mjs's tests (Live Bridge Patch 1). Built
// programmatically with exceljs (the same parser xlsx-import.mjs uses) rather than checked-in
// binary files, so every fixture's shape is readable as code and stays in sync with the parser's
// own API. All domains use the reserved .invalid TLD -- same discipline as
// fixtures/synthetic-packs.mjs -- nothing here is ever real market evidence.
import ExcelJS from 'exceljs';

const NOW_ISO = () => new Date().toISOString();

async function toBuffer(workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** A well-formed workbook: one visible sheet, clean header row, two valid rows. Control fixture --
 * every hostile fixture below is a deliberate deviation from this one. */
export async function validWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Qualified Agencies');
  ws.addRow(['Domain', 'Organization', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  ws.addRow(['northgate.invalid', 'Northgate Agency', 'published_contact_form', 'https://northgate.invalid/contact', NOW_ISO(), 0.9, true]);
  ws.addRow(['riverside.invalid', 'Riverside Agency', 'referral_intro', 'https://riverside.invalid/', NOW_ISO(), 0.85, true]);
  return toBuffer(wb);
}

/** A mandatory-field formula cell (domain) whose cached result looks like a normal, even
 * plausible-looking, domain -- proves the mandatory-field-formula policy discards the value
 * entirely (quarantined as missing) rather than trusting a caller-controlled cached result for a
 * safety-critical field. Also includes a non-mandatory formula cell (notes) to prove inert-text
 * handling for the non-mandatory case in the same workbook. */
export async function formulaInjectionWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Buyer Intent');
  ws.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Notes']);
  const row = ws.addRow(['', 'published_email', 'https://formula-target.invalid/', NOW_ISO(), 0.8, '']);
  row.getCell(1).value = { formula: 'CONCATENATE("formula-target",".invalid")', result: 'formula-target.invalid' };
  row.getCell(6).value = { formula: 'A2&"-note"', result: 'formula-target.invalid-note' };
  return toBuffer(wb);
}

/** More rows than the (deliberately small, test-supplied) row limit -- exercises the too-many-rows
 * guard without needing to actually generate a multi-megabyte fixture file; callers pass a small
 * `maxRowsPerSheet` override in the test itself. */
export async function manyRowsWorkbook(rowCount = 50) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Priority List');
  ws.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  for (let i = 0; i < rowCount; i++) {
    ws.addRow([`row${i}.invalid`, 'published_email', `https://row${i}.invalid/`, NOW_ISO(), 0.7, true]);
  }
  return toBuffer(wb);
}

/** A workbook with one hidden sheet (never included unless explicitly opted in) and one visible
 * sheet -- proves default-exclusion plus disclosure. */
export async function hiddenSheetWorkbook() {
  const wb = new ExcelJS.Workbook();
  const visible = wb.addWorksheet('Approval Queue');
  visible.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  visible.addRow(['visible-row.invalid', 'published_email', 'https://visible-row.invalid/', NOW_ISO(), 0.8, true]);
  const hidden = wb.addWorksheet('Internal Notes', { state: 'hidden' });
  hidden.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  hidden.addRow(['hidden-row.invalid', 'published_email', 'https://hidden-row.invalid/', NOW_ISO(), 0.8, true]);
  return toBuffer(wb);
}

/** A visible sheet with one row hidden (`row.hidden = true`) -- proves row-level (not just
 * sheet-level) hidden-content detection and default-exclusion. */
export async function hiddenRowWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Channel Signal Evidence');
  ws.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  ws.addRow(['shown.invalid', 'published_email', 'https://shown.invalid/', NOW_ISO(), 0.8, true]);
  const hiddenRow = ws.addRow(['concealed.invalid', 'published_email', 'https://concealed.invalid/', NOW_ISO(), 0.8, true]);
  hiddenRow.hidden = true;
  return toBuffer(wb);
}

/** Same domain+organization repeated across two different sheets of one workbook -- exercises the
 * cross-sheet domain+organization dedup pass (distinct from prepareImportBatch's own
 * domain+channel dedup, which a differing channel column would not catch). */
export async function duplicateAcrossSheetsWorkbook() {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Sheet A');
  a.addRow(['Domain', 'Organization', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  a.addRow(['dupe.invalid', 'Dupe Co', 'published_email', 'https://dupe.invalid/a', NOW_ISO(), 0.8, true]);
  const b = wb.addWorksheet('Sheet B');
  b.addRow(['Domain', 'Organization', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  b.addRow(['dupe.invalid', 'Dupe Co', 'referral_intro', 'https://dupe.invalid/b', NOW_ISO(), 0.8, true]);
  return toBuffer(wb);
}

/** A spread of date representations in the Captured At column: a native Excel date, an ISO string,
 * a non-ISO-but-parseable string, and an outright invalid string -- proves safe date normalization
 * accepts the first three and quarantines the last rather than silently coercing it. */
export async function dateVarietyWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Buyer Intent');
  ws.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  ws.addRow(['native-date.invalid', 'published_email', 'https://native-date.invalid/', new Date('2026-06-01T00:00:00.000Z'), 0.8, true]);
  ws.addRow(['iso-string.invalid', 'published_email', 'https://iso-string.invalid/', '2026-06-02T00:00:00.000Z', 0.8, true]);
  ws.addRow(['loose-string.invalid', 'published_email', 'https://loose-string.invalid/', 'June 3, 2026', 0.8, true]);
  ws.addRow(['invalid-date.invalid', 'published_email', 'https://invalid-date.invalid/', 'not a date at all', 0.8, true]);
  return toBuffer(wb);
}

/** Truncated mid-write -- corrupts the ZIP central directory while keeping the ZIP local-file-header
 * signature intact, so it passes the cheap container-signature check but fails exceljs's own parse
 * -- proves the corrupt-workbook path is a real parse-failure catch, not just a signature check. */
export async function corruptWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence']);
  ws.addRow(['x.invalid', 'published_email', 'https://x.invalid/', NOW_ISO(), 0.8]);
  const full = await toBuffer(wb);
  return full.subarray(0, Math.floor(full.length / 2));
}

/** A CFB (OLE compound document) header -- the container real encrypted .xlsx files (and legacy
 * .xls files) actually use. Not a real encrypted workbook (building one needs a private password
 * flow this fixture set intentionally doesn't reach for), but the exact signature xlsx-import.mjs's
 * container check keys off, so it proves that check fires before any parse is attempted. */
export function encryptedLikeWorkbookBuffer() {
  const header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return Buffer.concat([header, Buffer.alloc(256, 0)]);
}

/** Column headers using varied real-world spellings/casing/punctuation instead of the canonical
 * field names -- proves the alias resolver, not just the canonical-name fast path. */
export async function aliasedHeadersWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Channel and Signal Evidence');
  ws.addRow(['Website', 'Company', 'Contact Channel', 'Evidence URL', 'Date Captured', 'Confidence Score', 'Is Verified']);
  ws.addRow(['aliased.invalid', 'Aliased Co', 'published_email', 'https://aliased.invalid/', NOW_ISO(), 0.75, true]);
  return toBuffer(wb);
}
