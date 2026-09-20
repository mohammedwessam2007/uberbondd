import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FOUNDER_MOONSHOT_LITERAL_CORPUS_VERSION = 'uberbond.founder-moonshot-literal-corpus.v1';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELATIVE_DIR = 'artifacts/research/founder-moonshot-literal-corpus';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableId(ordinal) {
  return `founder-moonshot-${String(ordinal).padStart(4, '0')}`;
}

export async function loadFounderMoonshotLiteralCorpus({ rootDir = DEFAULT_ROOT } = {}) {
  const dir = path.join(rootDir, RELATIVE_DIR);
  const manifestPath = path.join(dir, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  const shardResults = [];
  const entries = [];
  for (const shard of manifest.shards || []) {
    const shardPath = path.join(dir, shard.path);
    const raw = await fs.readFile(shardPath, 'utf8');
    const parsed = JSON.parse(raw);
    shardResults.push({
      path: shard.path,
      raw,
      parsed,
      sha256: sha256(raw)
    });
    for (const entry of parsed.entries || []) {
      entries.push({
        stableId: stableId(entry.ordinal),
        ...entry
      });
    }
  }

  const rawSourcePath = path.join(dir, 'RAW_SOURCE_Branch_Branch_New_chat.txt');
  const rawSource = await fs.readFile(rawSourcePath, 'utf8');

  return {
    manifest,
    manifestRaw,
    shards: shardResults,
    entries,
    rawSource,
    rawSourceSha256: sha256(rawSource)
  };
}

export function validateFounderMoonshotLiteralCorpus(corpus) {
  const errors = [];
  const warnings = [];
  const { manifest, shards, entries, rawSourceSha256 } = corpus || {};

  if (!manifest || !Array.isArray(shards) || !Array.isArray(entries)) {
    return { ok: false, status: 'FOUNDER_MOONSHOT_CORPUS_INVALID', errors: ['loaded-corpus-required'], warnings };
  }

  if (manifest?.corpus?.expectedCount !== 890) errors.push('manifest-expected-count-must-be-890');
  if (manifest?.corpus?.recoveredCount !== 890) errors.push('manifest-recovered-count-must-be-890');
  if (shards.length !== 10) errors.push('exactly-10-shards-required');
  if (entries.length !== 890) errors.push(`entry-count-mismatch:${entries.length}`);

  const ordinals = entries.map(entry => entry.ordinal);
  const expectedOrdinals = Array.from({ length: 890 }, (_, i) => i + 1);
  if (JSON.stringify(ordinals) !== JSON.stringify(expectedOrdinals)) errors.push('ordinals-not-contiguous-1-through-890');

  const stableIds = entries.map(entry => entry.stableId);
  if (new Set(stableIds).size !== stableIds.length) errors.push('stable-id-collision');

  const duplicateOrdinals = ordinals.filter((value, index) => ordinals.indexOf(value) !== index);
  if (duplicateOrdinals.length) errors.push('duplicate-ordinals-present');

  const missingIq = entries.filter(entry => !entry.hypotheticalIq).map(entry => entry.ordinal);
  const emptyBodies = entries.filter(entry => !String(entry.literalBodyMarkdown || '').trim()).map(entry => entry.ordinal);
  if (missingIq.length) errors.push(`missing-iq:${missingIq.join(',')}`);
  if (emptyBodies.length) errors.push(`empty-body:${emptyBodies.join(',')}`);

  const sourceHashExpected = manifest?.source?.sha256;
  if (!sourceHashExpected || rawSourceSha256 !== sourceHashExpected) {
    errors.push(`raw-source-sha-mismatch:expected=${sourceHashExpected || 'missing'}:actual=${rawSourceSha256}`);
  }

  for (const [index, shardResult] of shards.entries()) {
    const declared = manifest.shards[index];
    if (!declared) {
      errors.push(`undeclared-shard:${shardResult.path}`);
      continue;
    }
    if (shardResult.path !== declared.path) errors.push(`shard-order-mismatch:${index + 1}`);
    if (shardResult.sha256 !== declared.sha256) errors.push(`shard-sha-mismatch:${shardResult.path}`);
    if (shardResult.parsed.entryCount !== declared.entryCount) errors.push(`shard-entry-count-mismatch:${shardResult.path}`);
    if (shardResult.parsed.ordinalStart !== declared.ordinalStart || shardResult.parsed.ordinalEnd !== declared.ordinalEnd) {
      errors.push(`shard-range-mismatch:${shardResult.path}`);
    }
  }

  const canonicalEntries = entries.map(({ stableId: _stableId, ...entry }) => entry);
  const canonicalEntriesSha256 = sha256(JSON.stringify(canonicalEntries));
  if (canonicalEntriesSha256 !== manifest?.corpus?.canonicalEntriesSha256) {
    errors.push(`canonical-entry-sha-mismatch:expected=${manifest?.corpus?.canonicalEntriesSha256 || 'missing'}:actual=${canonicalEntriesSha256}`);
  }

  const titleMap = new Map();
  for (const entry of entries) {
    const list = titleMap.get(entry.literalTitle) || [];
    list.push(entry.ordinal);
    titleMap.set(entry.literalTitle, list);
  }
  const duplicateTitles = [...titleMap.entries()]
    .filter(([, ords]) => ords.length > 1)
    .map(([title, ordinals]) => ({ title, ordinals }));
  const expectedDuplicateTitleCount = Object.keys(manifest?.corpus?.duplicateLiteralTitles || {}).length;
  if (duplicateTitles.length !== expectedDuplicateTitleCount) {
    errors.push('duplicate-title-manifest-mismatch');
  }
  if (duplicateTitles.length) warnings.push('duplicate-literal-titles-preserved-as-distinct-source-entries');

  return {
    ok: errors.length === 0,
    status: errors.length ? 'FOUNDER_MOONSHOT_CORPUS_INVALID' : 'FOUNDER_MOONSHOT_CORPUS_EXACT_890_OF_890',
    errors,
    warnings,
    counts: {
      expected: 890,
      recovered: entries.length,
      shards: shards.length,
      missingIq: missingIq.length,
      emptyBodies: emptyBodies.length,
      duplicateOrdinals: duplicateOrdinals.length,
      duplicateLiteralTitles: duplicateTitles.length
    },
    duplicateTitles,
    source: {
      fileName: manifest.source.fileName,
      sha256: rawSourceSha256,
      bytes: manifest.source.bytes,
      renderedLineCount: manifest.source.renderedLineCount
    },
    canonicalEntriesSha256,
    truthClass: 'DIRECT_PROJECT_TRANSCRIPT_EXACT_LITERAL_RECOVERY',
    noDropLaw: 'DUPLICATE_TITLES_REMAIN_DISTINCT_BY_ORDINAL_AND_SOURCE_TEXT__SEMANTIC_DEDUPE_CANNOT_DELETE_A_LITERAL_SOURCE_ENTRY'
  };
}

export function buildFounderMoonshotAtomizationQueue(corpus, {
  batchSize = 25
} = {}) {
  const validation = validateFounderMoonshotLiteralCorpus(corpus);
  if (!validation.ok) {
    return {
      ok: false,
      status: 'FOUNDER_MOONSHOT_ATOMIZATION_QUEUE_BLOCKED',
      reasonCodes: validation.errors
    };
  }
  const size = Number(batchSize);
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) {
    return {
      ok: false,
      status: 'FOUNDER_MOONSHOT_ATOMIZATION_QUEUE_INVALID',
      reasonCodes: ['batch-size-must-be-integer-1-to-100']
    };
  }

  const batches = [];
  for (let i = 0; i < corpus.entries.length; i += size) {
    const slice = corpus.entries.slice(i, i + size);
    batches.push({
      batch: batches.length + 1,
      ordinalStart: slice[0].ordinal,
      ordinalEnd: slice.at(-1).ordinal,
      count: slice.length,
      stableIds: slice.map(entry => entry.stableId),
      status: 'SOURCE_READY_FOR_CLAIM_ATOMIZATION'
    });
  }

  return {
    ok: true,
    status: 'FOUNDER_MOONSHOT_ATOMIZATION_QUEUE_READY',
    sourceEntryCount: corpus.entries.length,
    batchSize: size,
    batchCount: batches.length,
    batches,
    transformationBoundary: 'LITERAL_SOURCE_TEXT_IS_IMMUTABLE__ATOMIZED_CLAIMS_ARE_DERIVED_OBJECTS_WITH_SEPARATE_PROVENANCE',
    completionLaw: '890_OF_890_SOURCE_IMPORT_IS_COMPLETE__890_OF_890_CLAIM_ATOMIZATION_IS_A_SEPARATE_EXECUTION_STAGE'
  };
}

export async function runFounderMoonshotCorpusDoctor({ rootDir = DEFAULT_ROOT } = {}) {
  const corpus = await loadFounderMoonshotLiteralCorpus({ rootDir });
  const validation = validateFounderMoonshotLiteralCorpus(corpus);
  const queue = validation.ok ? buildFounderMoonshotAtomizationQueue(corpus) : null;
  return { validation, queue };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runFounderMoonshotCorpusDoctor({});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.validation.ok) process.exitCode = 1;
}
