// Research-pack ingestion (workstream 2). One shared validation/normalization/quarantine core
// (`importRecords`) behind format-specific parsers (CSV, JSON, JSONL, Markdown tables). Every
// accepted record carries source lineage (source URL, timestamp, importer version,
// verified/inferred, confidence) before it is ever allowed to become an opportunity -- a record
// missing any of that is quarantined with an explicit reason, never silently dropped or silently
// promoted with defaults.
//
// XLSX is explicitly NOT implemented -- this repository has no spreadsheet-parsing dependency
// (confirmed during forensics; no xlsx/exceljs package present) and adding one is outside this
// mission's "no new dependency" discipline used throughout this session. An XLSX pack fails
// importPack() with a clear 'unsupported-format:xlsx' error rather than a silent no-op; see
// EXTERNAL_BLOCKERS for the full disclosure. ZIP packs are validated at the entry-metadata level
// (archive-safety.mjs) exactly like this session's other missions -- this repo has no ZIP
// central-directory parser, so ZIP *content* import assumes the caller already extracted entries
// and supplies them as a JSON/CSV/JSONL record array plus the raw entry metadata for the safety
// check.
import { id } from './store.mjs';
import { parseCsv, parseJsonl } from './csv.mjs';
import { validateArchiveSafety } from './archive-safety.mjs';
import { sha256Hex, isValidDomain, normalizeDomain } from './utils.mjs';

export const IMPORTER_VERSION = 1;

export const PACK_TYPES = Object.freeze([
  'qualified_agency', 'buyer_intent', 'marketplace_demand', 'partner', 'proof_demo', 'payment_legal_research'
]);

export const ALLOWED_CHANNELS = Object.freeze([
  'published_contact_form', 'published_email', 'linkedin_public_profile', 'public_directory_listing', 'referral_intro'
]);

const MAX_EVIDENCE_AGE_DAYS = 90;
const REPLACEMENT_CHAR = '�';

export class ImporterError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ImporterError';
    this.code = code;
  }
}

/** Validates a pack manifest's declared file list against caller-supplied actual file
 * hashes/sizes -- refuses to proceed if any declared file is missing or its checksum mismatches,
 * since a tampered/incomplete pack is exactly what manifest+checksum validation exists to catch. */
export function validateManifest(manifest, actualFiles) {
  if (!manifest || !Array.isArray(manifest.files)) throw new ImporterError('manifest-malformed', 'manifest.files must be an array');
  const problems = [];
  for (const declared of manifest.files) {
    const actual = actualFiles.find(f => f.name === declared.name);
    if (!actual) { problems.push({ code: 'manifest-file-missing', detail: declared.name }); continue; }
    const actualHash = sha256Hex(actual.content);
    if (declared.sha256 && declared.sha256 !== actualHash) problems.push({ code: 'manifest-checksum-mismatch', detail: `${declared.name}: expected ${declared.sha256}, got ${actualHash}` });
  }
  return { valid: problems.length === 0, problems };
}

function detectCorruptedEncoding(value) {
  return typeof value === 'string' && value.includes(REPLACEMENT_CHAR);
}

/**
 * Normalizes and validates one raw record into an opportunity-shaped candidate, or returns a
 * quarantine reason. Never throws for a bad *record* (only for a malformed *call*) -- quarantine
 * is the expected outcome for hostile/malformed input, not an exception a caller must catch per row.
 */
export function normalizeRecord(raw, { packType, packVersion, sourceFile } = {}) {
  const reasons = [];
  const organizationDomain = normalizeDomain(raw.organizationDomain || raw.domain || '');
  const channel = String(raw.channel || '').trim();
  const sourceUrl = String(raw.sourceUrl || raw.source_url || '').trim();
  const capturedAt = String(raw.capturedAt || raw.captured_at || '').trim();
  const confidence = Number(raw.confidence);
  const verified = ['true', '1', 'yes'].includes(String(raw.verified ?? '').toLowerCase());

  if (!organizationDomain || !isValidDomain(organizationDomain)) reasons.push('invalid-or-missing-domain');
  if (!ALLOWED_CHANNELS.includes(channel)) reasons.push('unsupported-channel');
  if (!sourceUrl) reasons.push('missing-source-url');
  if (!capturedAt || !Number.isFinite(Date.parse(capturedAt))) reasons.push('missing-or-invalid-timestamp');
  else if ((Date.now() - Date.parse(capturedAt)) / 86400000 > MAX_EVIDENCE_AGE_DAYS) reasons.push('stale-evidence');
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) reasons.push('invalid-confidence');
  if (!verified && !raw.inferredBasis) reasons.push('inferred-contact-without-basis');
  if ([raw.organizationDomain, raw.channel, raw.sourceUrl, raw.notes].some(detectCorruptedEncoding)) reasons.push('corrupted-encoding');
  if (!PACK_TYPES.includes(packType)) reasons.push('unknown-pack-type');

  if (reasons.length) return { ok: false, reasons, raw };

  return {
    ok: true,
    record: {
      organizationDomain, channel, sourceUrl, capturedAt, confidence, verified,
      evidenceHash: sha256Hex(`${organizationDomain}|${channel}|${sourceUrl}|${capturedAt}`),
      lineage: { packType, packVersion: packVersion || 1, sourceFile: sourceFile || '', importerVersion: IMPORTER_VERSION, importedAt: new Date().toISOString() },
      raw
    }
  };
}

/**
 * Runs every raw record through normalizeRecord, deduplicates by organizationDomain+channel
 * within this one import call (a later duplicate loses, first-seen wins, both reported), and
 * returns accepted vs. quarantined -- this function does not touch the store, so it is fully
 * testable against fixed input without any I/O.
 */
export function prepareImportBatch(rawRecords = [], options = {}) {
  const accepted = []; const quarantined = []; const seen = new Set();
  for (const raw of rawRecords) {
    const result = normalizeRecord(raw, options);
    if (!result.ok) { quarantined.push({ raw, reasons: result.reasons }); continue; }
    const dedupeKey = `${result.record.organizationDomain}|${result.record.channel}`;
    if (seen.has(dedupeKey)) { quarantined.push({ raw, reasons: ['duplicate-domain-and-channel-in-pack'] }); continue; }
    seen.add(dedupeKey);
    accepted.push(result.record);
  }
  return { accepted, quarantined, totalIn: rawRecords.length };
}

/** Persists an already-prepared batch's accepted records as opportunities + evidence items,
 * skipping (not erroring on) any that already exist as an open opportunity for that domain/channel
 * -- import is safe to re-run against the same pack. */
export async function importBatch(store, prepared, { organizationsById = new Map() } = {}) {
  let imported = 0, skippedExisting = 0;
  const importedIds = [];
  for (const record of prepared.accepted) {
    const existing = await store.findOne('opportunities', { organizationDomain: record.organizationDomain, channel: record.channel });
    if (existing) { skippedExisting += 1; continue; }
    const opportunity = await store.add('opportunities', {
      id: id('opp'), organizationDomain: record.organizationDomain, channel: record.channel,
      status: 'candidate', score: null,
      data: { demandSignals: [], portfolioItems: [], buyerRole: null, verified: record.verified, confidence: record.confidence, lineage: record.lineage }
    });
    await store.add('evidenceItems', {
      id: id('evidence'), opportunityId: opportunity.id, sourceUrl: record.sourceUrl, sourceType: 'research_pack',
      rawHash: record.evidenceHash, verified: record.verified, confidence: record.confidence, capturedAt: record.capturedAt,
      data: { lineage: record.lineage }
    });
    imported += 1;
    importedIds.push(opportunity.id);
  }
  await store.log('research_pack_imported', { imported, skippedExisting, quarantined: prepared.quarantined.length });
  return { imported, skippedExisting, quarantined: prepared.quarantined.length, importedIds };
}

// ---- format-specific entry points ----

export function importCsvPack(text, options) { return prepareImportBatch(parseCsv(text), options); }

export function importJsonPack(jsonText, options) {
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch (error) { throw new ImporterError('malformed-json', error.message); }
  const rows = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(rows)) throw new ImporterError('malformed-json', 'expected an array or {records:[...]}');
  return prepareImportBatch(rows, options);
}

export function importJsonlPack(text, options) {
  const { rows, problems } = parseJsonl(text);
  const prepared = prepareImportBatch(rows.map(r => r.value), options);
  for (const problem of problems) prepared.quarantined.push({ raw: null, reasons: [problem.code], detail: problem.detail, lineNumber: problem.lineNumber });
  return prepared;
}

/** Minimal GitHub-flavored pipe-table parser -- proof/demo packs are often hand-written Markdown
 * tables; this reads the header row and every data row into record objects the same shape a CSV
 * row would produce. */
export function importMarkdownTablePack(markdown, options) {
  const lines = String(markdown).split('\n').map(l => l.trim()).filter(Boolean).filter(l => l.startsWith('|'));
  if (lines.length < 2) return prepareImportBatch([], options);
  const headers = lines[0].split('|').map(c => c.trim()).filter(Boolean);
  const dataLines = lines.slice(1).filter(l => !/^\|[\s:|-]+\|$/.test(l));
  const rows = dataLines.map(line => {
    const cells = line.split('|').map(c => c.trim()).filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] || '']));
  });
  return prepareImportBatch(rows, options);
}

/** ZIP pack pre-check: validates entry metadata for traversal/bomb safety before any content is
 * trusted. The caller is responsible for actual extraction (no ZIP-parsing dependency here, see
 * this file's header) and must pass already-extracted file contents to one of the format-specific
 * importers above for the records themselves. */
export function precheckZipPack(entries) { return validateArchiveSafety(entries); }
