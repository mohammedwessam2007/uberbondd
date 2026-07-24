// Hostile + valid XLSX workbook fixtures for xlsx-import.mjs's tests (Live Bridge Patch 1). Built
// programmatically with exceljs (the same parser xlsx-import.mjs uses) rather than checked-in
// binary files, so every fixture's shape is readable as code and stays in sync with the parser's
// own API. All domains use the reserved .invalid TLD -- same discipline as
// fixtures/synthetic-packs.mjs -- nothing here is ever real market evidence.
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

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

/** Reproduces the two real-world OOXML variants found in an actual operational workbook that
 * crashed exceljs before xlsx-import.mjs's normalizeOoxmlCompat preprocessing was added: (1) every
 * spreadsheetML element carries an arbitrary namespace prefix (`x:`) instead of the default
 * namespace, and (2) the Excel-Table relationship Target is a package-absolute path
 * (`/xl/tables/table1.xml`) instead of the relative form exceljs's own reader hardcodes as a
 * literal string key. Built by taking a normal exceljs-authored workbook (which already includes a
 * real Table, so the table-relationship bug has something to bite on) and rewriting its XML parts
 * with jszip -- exceljs itself cannot author either non-standard form, so this is the only way to
 * produce a deterministic, checked-in-as-code reproduction rather than depending on an external
 * binary fixture file. */
export async function namespacedWithAbsoluteTableTargetWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Qualified Targets');
  ws.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  ws.addRow(['prefixed-quirk.invalid', 'published_email', 'https://prefixed-quirk.invalid/', NOW_ISO(), 0.8, true]);
  ws.addTable({
    name: 'T1', ref: 'A1', headerRow: true,
    columns: [{ name: 'Domain' }, { name: 'Channel' }, { name: 'Source URL' }, { name: 'Captured At' }, { name: 'Confidence' }, { name: 'Verified' }],
    rows: [['prefixed-quirk.invalid', 'published_email', 'https://prefixed-quirk.invalid/', NOW_ISO(), 0.8, true]]
  });
  const original = await toBuffer(wb);

  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const zip = await JSZip.loadAsync(original);
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
    const file = zip.files[name];
    if (file.dir) continue;
    let text = await file.async('string');
    let changed = false;
    if (text.includes(`"${NS_MAIN}"`) && !text.includes(`xmlns:x="${NS_MAIN}"`)) {
      text = text.replace(/<\?xml[^>]*\?>/, m => ` ${m} `) // shield the XML declaration from the open-tag rewrite below
        .replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s|>))/g, '<x:$1$2')
        .replace(/<\/([a-zA-Z][a-zA-Z0-9]*)/g, '</x:$1')
        .replace(/ <\?xml[^>]*\?> /, m => m.slice(1, -1))
        .replace(`xmlns="${NS_MAIN}"`, `xmlns:x="${NS_MAIN}"`);
      changed = true;
    }
    if (name.endsWith('.rels') && text.includes('/relationships/table"') && text.includes('Target="../tables/')) {
      text = text.replace(/Target="\.\.\/tables\//g, 'Target="/xl/tables/');
      changed = true;
    }
    if (changed) zip.file(name, text);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** A workbook with a title row and a merged summary-banner row before the real header row (row 3),
 * mirroring the real operational workbook's shape -- proves detectHeaderRow finds the actual
 * header instead of assuming row 1. */
export async function titleAndBannerBeforeHeaderWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Qualified Targets');
  ws.addRow(['Qualified Targets']);
  ws.addRow(['24 of 100 reviewed businesses passed both gates.']);
  ws.addRow(['Domain', 'Channel', 'Source URL', 'Captured At', 'Confidence', 'Verified']);
  ws.addRow(['banner-offset.invalid', 'published_email', 'https://banner-offset.invalid/', NOW_ISO(), 0.8, true]);
  return toBuffer(wb);
}
