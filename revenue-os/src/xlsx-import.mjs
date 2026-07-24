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
export const COLUMN_ALIASES = Object.freeze({
  organizationDomain: ['organizationdomain', 'domain', 'website', 'organizationdomainname', 'orgdomain', 'companydomain'],
  organization: ['organization', 'organizationname', 'company', 'companyname', 'agency', 'agencyname'],
  channel: ['channel', 'contactchannel'],
  sourceUrl: ['sourceurl', 'evidenceurl', 'link', 'url'],
  capturedAt: ['capturedat', 'datecaptured', 'evidencedate', 'capturedate'],
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

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new XlsxImportError('corrupt-workbook', `workbook failed to parse: ${error.message}`);
  }

  if (workbook.worksheets.length > maxSheets) {
    throw new XlsxImportError('too-many-sheets', `workbook has ${workbook.worksheets.length} sheets, limit is ${maxSheets}`);
  }

  const workbookHash = sha256Hex(buffer);
  const sheetReports = [];
  const rawRecords = [];
  const disclosures = { hiddenSheets: [], hiddenRows: [], formulaCells: [], skippedSheetsNotAllowlisted: [] };

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

    const headers = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = cellTextValue(cell).trim();
    });
    const { map: columnMap, usedCols } = resolveColumnMap(headers);
    const unmappedHeaders = headers.filter((h, i) => h && !usedCols.has(i));
    const missingMandatoryColumns = MANDATORY_FIELDS.filter(f => !(f in columnMap));

    const sheetReport = {
      sheet: sheetName, hidden: isHidden, headers: headers.filter(Boolean), columnMap: { ...columnMap },
      unmappedHeaders, missingMandatoryColumns, rowsExtracted: 0, rowsSkippedHidden: 0
    };
    sheetReports.push(sheetReport);

    if (missingMandatoryColumns.length === MANDATORY_FIELDS.length) {
      sheetReport.skippedReason = 'no-mandatory-columns-resolved';
      continue;
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
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
