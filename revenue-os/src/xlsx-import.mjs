// Secure XLSX ingestion (Live Bridge Patch 1). Parses .xlsx workbooks into the same raw-record
// shape CSV/JSON/JSONL/Markdown already produce, then hands off to the EXISTING, already-tested
// importer.mjs#prepareImportBatch/normalizeRecord pipeline for validation/quarantine/dedup -- this
// file only does extraction + lineage + a workbook-specific dedup pass; it never re-implements the
// 9 named quarantine reasons that pipeline already owns.
//
// Parser: exceljs (pinned exact in package.json). Chosen over the npm-published `xlsx` (SheetJS)
// package because exceljs is pure JS (no native bindings), actively maintained on the npm registry
// itself (SheetJS's latest security fixes ship from their own CDN, not npm -- a mismatch with
// "select a maintained parser and pin it in package-lock"), MIT-licensed, and structurally never
// evaluates formulas or executes VBA macros (it does not contain a formula engine at all, and it
// does not read/execute the vbaProject.bin part of a .xlsm container -- macros are excluded from
// this design a layer beneath any option here, not by a checked flag). See
// LIVE_BRIDGE_XLSX_SCHEMA_MAP.md for the full decision record.
//
// Formula-cell policy (explicit, per mission requirement): a formula's *text* is never read by this
// module -- only `cell.result`, exceljs's cached last-computed value, which is treated as inert
// data, exactly like a value cell, never re-evaluated. A formula cell in a MANDATORY field is
// stricter still: its value is discarded entirely (left unset) so the existing pipeline's own
// missing-field quarantine reason applies -- a mandatory fact (e.g. which domain this row is about)
// must never ride in on a formula result an attacker fully controls the *shape* of, even if this
// importer never executes it as a formula.
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { prepareImportBatch } from './importer.mjs';
import { sha256Hex, normalizeDomain } from './utils.mjs';

export class XlsxImportError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'XlsxImportError';
    this.code = code;
  }
}

export const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 25 * 1024 * 1024,
  maxSheets: 50,
  maxRowsPerSheet: 20000,
  maxCellsPerRow: 200
});

// Canonical importer.mjs field -> accepted header spellings (normalized: lowercased,
// non-alphanumeric stripped, so "Source URL", "source_url", and "SourceUrl" all match the same
// alias). `organization` is not read by normalizeRecord but is kept for this module's own
// domain+organization dedup pass (see dedupeByDomainAndOrganization below).
// The 'canonicaldomain', 'business', 'publicsourceurl', 'issueurl', and 'observed' aliases were
// added after this pipeline was first run against a real Work-agent workbook
// (UBERBOND_FIRST_100_VERIFIED_TARGETS.xlsx) whose real column spellings ("Canonical Domain",
// "Business", "Public Source URL", "Issue URL", "Observed") didn't resolve against the original
// alias set -- a disclosed, narrow addition, not a schema redesign. `channel` intentionally has no
// alias added for that workbook's "Public Role Contact" column: its values are free-text
// descriptions ("Website service form; service@gofalconair.com"), not one of ALLOWED_CHANNELS'
// enum values, so aliasing it would only ever produce a predictable 'unsupported-channel'
// quarantine -- leaving it unmapped instead correctly reports 'channel' as a missing mandatory
// column, a more honest signal that this real dataset doesn't carry a structured channel field.
export const COLUMN_ALIASES = Object.freeze({
  organizationDomain: ['organizationdomain', 'domain', 'website', 'organizationdomainname', 'orgdomain', 'companydomain', 'canonicaldomain'],
  organization: ['organization', 'organizationname', 'company', 'companyname', 'agency', 'agencyname', 'business'],
  channel: ['channel', 'contactchannel'],
  sourceUrl: ['sourceurl', 'evidenceurl', 'link', 'url', 'publicsourceurl', 'issueurl'],
  capturedAt: ['capturedat', 'datecaptured', 'evidencedate', 'capturedate', 'observed'],
  confidence: ['confidence', 'confidencescore'],
  verified: ['verified', 'isverified'],
  inferredBasis: ['inferredbasis', 'basis'],
  notes: ['notes', 'note', 'comment', 'comments']
});

const MANDATORY_FIELDS = Object.freeze(['organizationDomain', 'channel', 'sourceUrl', 'capturedAt']);

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function detectContainerFormat(buffer) {
  if (buffer.length >= ZIP_SIGNATURE.length && buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) return 'zip';
  if (buffer.length >= CFB_SIGNATURE.length && buffer.subarray(0, 8).equals(CFB_SIGNATURE)) return 'cfb';
  return 'unknown';
}

function normalizeHeader(h) {
  return String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Text form of a header cell -- headers are never trusted as formulas/rich objects, just flattened
 * to a plain string for alias matching. */
function cellTextValue(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (typeof v.text === 'string') return v.text;
    if (Array.isArray(v.richText)) return v.richText.map(rt => rt.text).join('');
    if ('result' in v) return String(v.result ?? '');
    return '';
  }
  return String(v);
}

function safeDateToIso(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  if (year < 1970 || year > 2100) return '';
  return d.toISOString();
}

/** Extracts one cell's value as inert data. `isFormula` cells only ever contribute their cached
 * `.result` -- the formula text itself is never read, matching the "no formula evaluation" policy. */
function extractCellValue(cell, isFormula) {
  let v = cell.value;
  if (isFormula) v = v && typeof v === 'object' && 'result' in v ? v.result : null;
  if (v == null) return '';
  if (v instanceof Date) return safeDateToIso(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if (typeof v.text === 'string') return v.text.trim();
    if (Array.isArray(v.richText)) return v.richText.map(rt => rt.text).join('').trim();
    return '';
  }
  return String(v).trim();
}

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/**
 * Normalizes two real-world OOXML variations found in this operation's actual required input
 * files -- both spec-valid, both incompatible with exceljs's reader:
 *
 * 1. An arbitrary namespace prefix (e.g. `x:`) bound to the spreadsheetML main namespace on every
 *    element, instead of the default (unprefixed) namespace exceljs's parser expects. Confirmed
 *    against `UBERBOND_FIRST_100_VERIFIED_TARGETS.xlsx` and `UBERBOND_FIRST_PAYMENT_COMMAND_CENTER.xlsx`,
 *    both of which crashed exceljs with "Cannot read properties of undefined (reading 'sheets')"
 *    before this normalization.
 * 2. Excel-Table relationship Targets written as package-absolute paths
 *    (`Target="/xl/tables/table1.xml"`) instead of the literal relative-path string
 *    (`../tables/table1.xml`) exceljs's own table lookup hardcodes as a plain string key rather
 *    than resolving generically (`node_modules/exceljs/lib/xlsx/xlsx.js` stores parsed tables
 *    keyed by `` `../tables/${name}.xml` `` and worksheet-xform.js looks that exact string up --
 *    an absolute Target that resolves to the identical file on disk still misses the string match
 *    and produces `undefined`, which crashes a later `.reduce` with "Cannot read properties of
 *    undefined (reading 'name')"). Every other relationship type (worksheets, styles,
 *    sharedStrings, theme) resolves absolute targets correctly in exceljs -- only this one
 *    hardcoded string comparison needed the rewrite, confirmed by testing narrower and broader
 *    fixes against the real file before settling on this exact scope.
 *
 * Returns the original buffer unchanged if neither pattern is present (a no-op scan for a
 * standard Excel/LibreOffice-authored file) or if normalization itself fails for any reason --
 * falls through to exceljs's own load attempt either way, so a genuinely corrupt workbook still
 * produces the normal corrupt-workbook error rather than an error from this preprocessing step.
 */
export async function normalizeOoxmlCompat(buffer) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch { return { buffer, applied: false }; }
  let changedAny = false;
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
    const file = zip.files[name];
    if (file.dir) continue;
    let text;
    try { text = await file.async('string'); } catch { continue; }
    let changed = false;

    const nsMatch = text.match(/xmlns:([a-zA-Z0-9_]+)="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/);
    if (nsMatch) {
      const prefix = nsMatch[1];
      text = text.replace(new RegExp(`<${prefix}:`, 'g'), '<').replace(new RegExp(`</${prefix}:`, 'g'), '</');
      text = text.replace(new RegExp(`xmlns:${prefix}="${NS_MAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `xmlns="${NS_MAIN}"`);
      changed = true;
    }
    if (name.endsWith('.rels') && text.includes('/relationships/table"') && text.includes('Target="/xl/tables/')) {
      text = text.replace(/Target="\/xl\/tables\//g, 'Target="../tables/');
      changed = true;
    }

    if (changed) { zip.file(name, text); changedAny = true; }
  }
  if (!changedAny) return { buffer, applied: false };
  try { return { buffer: await zip.generateAsync({ type: 'nodebuffer' }), applied: true }; }
  catch { return { buffer, applied: false }; }
}

/** Scans the first few rows of a sheet and picks the one that resolves the most COLUMN_ALIASES
 * fields as the header row, instead of always assuming row 1. Real Work-agent workbooks were found
 * to prepend a title row and a merged summary-banner row before the actual header row (table `ref`
 * starting at row 3, not row 1) -- assuming row 1 in that case would treat the title text as every
 * column's header and silently import zero usable rows. Ties prefer the earliest row, so every
 * existing fixture with a genuine row-1 header (the common case) is unaffected. */
function detectHeaderRow(worksheet, maxScanRows = 10) {
  let best = { row: 1, score: -1 };
  const scanLimit = Math.min(maxScanRows, worksheet.rowCount || 1);
  for (let r = 1; r <= scanLimit; r++) {
    const headers = [];
    worksheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = cellTextValue(cell).trim();
    });
    const { usedCols } = resolveColumnMap(headers);
    if (usedCols.size > best.score) best = { row: r, score: usedCols.size };
  }
  return best.row;
}

function resolveColumnMap(headers) {
  const map = {};
  const usedCols = new Set();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const normalizedAliases = new Set(aliases.map(normalizeHeader));
    let found = null;
    headers.forEach((h, colNumber) => {
      if (found != null || !h) return;
      if (normalizedAliases.has(normalizeHeader(h))) found = colNumber;
    });
    if (found != null) { map[field] = found; usedCols.add(found); }
  }
  return { map, usedCols };
}

/** Mission-required "deduplicate by domain and organization" pass, distinct from and in addition to
 * importer.mjs#prepareImportBatch's own domain+channel dedup -- this catches the same
 * organization/domain listed twice within one workbook (e.g. across two Work-agent sheets) even
 * when the channel column differs, which the core pipeline's dedup key would not catch. */
function dedupeByDomainAndOrganization(rawRecords) {
  const seen = new Map();
  const deduped = [];
  const duplicates = [];
  for (const raw of rawRecords) {
    const domain = normalizeDomain(raw.organizationDomain || '');
    const org = String(raw.organization || '').trim().toLowerCase();
    const key = domain && org ? `${domain}|${org}` : null;
    if (key && seen.has(key)) {
      duplicates.push({ raw, reasons: ['duplicate-domain-and-organization-in-workbook'], firstSeenAt: seen.get(key) });
      continue;
    }
    if (key) seen.set(key, { sheet: raw.__sheet, row: raw.__row });
    deduped.push(raw);
  }
  return { deduped, duplicates };
}

/**
 * Parses a .xlsx workbook Buffer into raw records and runs them through the existing
 * prepareImportBatch pipeline. Never throws for hostile *content* inside a validly-formed workbook
 * (bad rows are quarantined, same discipline as every other format importer) -- it only throws
 * XlsxImportError for a workbook that cannot be safely opened at all (wrong container/extension,
 * too large, encrypted/corrupt, over a structural limit).
 */
export async function importXlsxPack(buffer, options = {}) {
  const {
    packType, packVersion, sourceFile = 'workbook.xlsx', sheetAllowlist = null,
    includeHiddenSheets = false, includeHiddenRows = false,
    maxFileBytes = DEFAULT_LIMITS.maxFileBytes, maxSheets = DEFAULT_LIMITS.maxSheets,
    maxRowsPerSheet = DEFAULT_LIMITS.maxRowsPerSheet, maxCellsPerRow = DEFAULT_LIMITS.maxCellsPerRow
  } = options;

  if (!/\.xlsx$/i.test(sourceFile)) {
    throw new XlsxImportError('unsupported-extension', 'only .xlsx workbooks are accepted (.xlsm/.xlsb/.xls are rejected to exclude macro-enabled and legacy binary formats)');
  }
  if (!Buffer.isBuffer(buffer)) throw new XlsxImportError('invalid-input', 'importXlsxPack requires a Buffer');
  if (buffer.length === 0) throw new XlsxImportError('empty-file', 'workbook is empty');
  if (buffer.length > maxFileBytes) throw new XlsxImportError('file-too-large', `workbook is ${buffer.length} bytes, limit is ${maxFileBytes}`);

  const format = detectContainerFormat(buffer);
  if (format === 'cfb') throw new XlsxImportError('encrypted-or-legacy-format', 'workbook appears to be password-protected (OOXML encryption wraps the workbook in a CFB container) or is a legacy .xls binary file -- neither is supported');
  if (format !== 'zip') throw new XlsxImportError('not-xlsx', 'file is not a valid .xlsx (OOXML zip) workbook');

  const workbookHash = sha256Hex(buffer); // hash of the ORIGINAL bytes, not the compat-normalized copy -- lineage must reflect what was actually uploaded
  const { buffer: loadBuffer, applied: ooxmlCompatApplied } = await normalizeOoxmlCompat(buffer);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(loadBuffer);
  } catch (error) {
    throw new XlsxImportError('corrupt-workbook', `workbook failed to parse: ${error.message}`);
  }

  if (workbook.worksheets.length > maxSheets) {
    throw new XlsxImportError('too-many-sheets', `workbook has ${workbook.worksheets.length} sheets, limit is ${maxSheets}`);
  }

  const sheetReports = [];
  const rawRecords = [];
  const disclosures = { hiddenSheets: [], hiddenRows: [], formulaCells: [], skippedSheetsNotAllowlisted: [], ooxmlCompatNormalizationApplied: ooxmlCompatApplied };

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name;
    const isHidden = Boolean(worksheet.state) && worksheet.state !== 'visible';
    if (isHidden) disclosures.hiddenSheets.push({ sheet: sheetName, state: worksheet.state });

    if (sheetAllowlist && !sheetAllowlist.includes(sheetName)) {
      disclosures.skippedSheetsNotAllowlisted.push(sheetName);
      continue;
    }
    if (isHidden && !includeHiddenSheets) {
      sheetReports.push({ sheet: sheetName, hidden: true, skippedReason: 'hidden-sheet-excluded-by-default', headers: [], columnMap: {}, unmappedHeaders: [], missingMandatoryColumns: MANDATORY_FIELDS.slice(), rowsExtracted: 0, rowsSkippedHidden: 0 });
      continue;
    }

    if (worksheet.rowCount > maxRowsPerSheet) {
      throw new XlsxImportError('too-many-rows', `sheet "${sheetName}" has ${worksheet.rowCount} rows, limit is ${maxRowsPerSheet}`);
    }

    const headerRow = detectHeaderRow(worksheet);
    const headers = [];
    worksheet.getRow(headerRow).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = cellTextValue(cell).trim();
    });
    const { map: columnMap, usedCols } = resolveColumnMap(headers);
    const unmappedHeaders = headers.filter((h, i) => h && !usedCols.has(i));
    const missingMandatoryColumns = MANDATORY_FIELDS.filter(f => !(f in columnMap));

    const sheetReport = {
      sheet: sheetName, hidden: isHidden, headerRow, headers: headers.filter(Boolean), columnMap: { ...columnMap },
      unmappedHeaders, missingMandatoryColumns, rowsExtracted: 0, rowsSkippedHidden: 0
    };
    sheetReports.push(sheetReport);

    if (missingMandatoryColumns.length === MANDATORY_FIELDS.length) {
      sheetReport.skippedReason = 'no-mandatory-columns-resolved';
      continue;
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      if (row.hidden) {
        disclosures.hiddenRows.push({ sheet: sheetName, row: rowNumber });
        if (!includeHiddenRows) { sheetReport.rowsSkippedHidden += 1; return; }
      }
      if (row.cellCount > maxCellsPerRow) {
        throw new XlsxImportError('too-many-cells', `sheet "${sheetName}" row ${rowNumber} has ${row.cellCount} cells, limit is ${maxCellsPerRow}`);
      }

      const raw = {};
      const cellRefs = {};
      for (const [field, colNumber] of Object.entries(columnMap)) {
        const cell = row.getCell(colNumber);
        const isFormula = cell.type === ExcelJS.ValueType.Formula;
        cellRefs[field] = cell.address;
        if (isFormula) {
          disclosures.formulaCells.push({ sheet: sheetName, row: rowNumber, field, address: cell.address, mandatory: MANDATORY_FIELDS.includes(field) });
          if (MANDATORY_FIELDS.includes(field)) continue; // discarded, not evaluated -- mandatory field must not ride in on a formula result
        }
        raw[field] = extractCellValue(cell, isFormula);
      }

      raw.__sheet = sheetName;
      raw.__row = rowNumber;
      raw.__sourceFile = sourceFile;
      raw.__workbookHash = workbookHash;
      raw.__cellRefs = cellRefs;
      rawRecords.push(raw);
      sheetReport.rowsExtracted += 1;
    });
  }

  const { deduped, duplicates: domainOrgDuplicates } = dedupeByDomainAndOrganization(rawRecords);
  const prepared = prepareImportBatch(deduped, { packType, packVersion, sourceFile });
  prepared.quarantined.push(...domainOrgDuplicates);
  prepared.totalIn = rawRecords.length;

  return {
    ...prepared,
    workbook: { sourceFile, sheetHash: workbookHash, sheetsTotal: workbook.worksheets.length, sheetsProcessed: sheetReports.length },
    sheetReports,
    disclosures
  };
}
