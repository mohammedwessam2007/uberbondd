import fs from 'node:fs/promises';
import path from 'node:path';
import { PostgresStore } from '../src/store.mjs';
import { importJsonDatabase } from '../src/json-import.mjs';

function option(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const file = option('file', './data/db.json');
const reportFile = option('report', './data/json-import-report.json');
const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL || option('database-url');
if (!dryRun && !databaseUrl) throw new Error('DATABASE_URL is required for a real JSON import. Add --dry-run to validate without writing.');

let store;
try {
  if (dryRun && !databaseUrl) {
    const { loadJsonDatabase } = await import('../src/json-import.mjs');
    await loadJsonDatabase(file);
    const data = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
    const tables = Object.fromEntries(Object.entries(data).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, { source: value.length, written: 0, updated: 0, duplicates: 0 }]));
    const report = { sourceFile: path.resolve(file), dryRun: true, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), tables, settings: { source: Object.keys(data.settings || {}).length, written: 0 }, totals: { source: Object.values(tables).reduce((sum, value) => sum + value.source, 0) + Object.keys(data.settings || {}).length, written: 0, updated: 0, duplicates: 0 }, duplicateDetails: [] };
    await fs.mkdir(path.dirname(path.resolve(reportFile)), { recursive: true });
    await fs.writeFile(path.resolve(reportFile), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } else {
    store = new PostgresStore({ databaseUrl, ssl: String(process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false' });
    await store.init();
    const report = await importJsonDatabase(store, file, { dryRun });
    await fs.mkdir(path.dirname(path.resolve(reportFile)), { recursive: true });
    await fs.writeFile(path.resolve(reportFile), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
} finally {
  await store?.close();
}
