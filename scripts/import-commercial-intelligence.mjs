// CLI entry point for the Commercial Intelligence Importer (Revenue OS V2). Validates and
// imports a JSONL or CSV batch from ChatGPT Work in dry-run mode by default -- outbound sending
// has no code path here at all (see src/commercial-intelligence-import.mjs's own header comment),
// so there is no "accidentally live" mode to guard against.
//
// Usage:
//   node scripts/import-commercial-intelligence.mjs --file ./batch.jsonl --format jsonl
//   node scripts/import-commercial-intelligence.mjs --file ./batch.csv --format csv --database-url $DATABASE_URL
//   node scripts/import-commercial-intelligence.mjs --file ./batch.jsonl   # format inferred from extension
import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonStore, PostgresStore } from '../src/store.mjs';
import {
  parseCommercialIntelligenceJsonl, parseCommercialIntelligenceCsv, importCommercialIntelligenceBatch
} from '../src/commercial-intelligence-import.mjs';

function option(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const file = option('file');
if (!file) throw new Error('--file is required (a JSONL or CSV commercial-intelligence batch)');
const reportFile = option('report', './data/commercial-intelligence-import-report.json');
const databaseUrl = process.env.DATABASE_URL || option('database-url');
const dataDir = option('data-dir', './data/revenue-os-v2');
const format = option('format') || (file.endsWith('.csv') ? 'csv' : 'jsonl');

const text = await fs.readFile(path.resolve(file), 'utf8');
const { records, errors } = format === 'csv' ? parseCommercialIntelligenceCsv(text) : parseCommercialIntelligenceJsonl(text);

let store;
try {
  store = databaseUrl
    ? new PostgresStore({ databaseUrl, ssl: String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false' })
    : new JsonStore(dataDir);
  await store.init();

  const result = await importCommercialIntelligenceBatch(store, records, { dryRun: true });

  const report = {
    sourceFile: path.resolve(file), format, startedAt: new Date().toISOString(),
    storeBackend: databaseUrl ? 'postgres' : 'json',
    parse: { validRecordCount: records.length, invalidRecordCount: errors.length, errors },
    import: result,
    zeroLiveSend: true // structural guarantee, not a flag: this script has no send-capable import
  };
  await fs.mkdir(path.dirname(path.resolve(reportFile)), { recursive: true });
  await fs.writeFile(path.resolve(reportFile), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await store?.close?.();
}
