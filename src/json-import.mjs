import fs from 'node:fs/promises';
import path from 'node:path';
import { COLLECTIONS, ConflictError } from './store.mjs';

const IMPORT_ORDER = [
  'campaigns', 'leads', 'prospects', 'jobs', 'messages', 'replies', 'suppressions',
  'socialTasks', 'accounts', 'orders', 'subscriptions', 'monitoringRuns',
  'notifications', 'revenueEvents', 'discoveryRuns', 'auditLog'
];

const UNIQUE_LOOKUPS = {
  prospects: item => item.domain ? { domain: String(item.domain).toLowerCase() } : null,
  suppressions: item => item.value ? { value: String(item.value).toLowerCase() } : null,
  replies: item => item.gmailId ? { gmailId: item.gmailId } : null,
  accounts: item => item.slot ? { slot: item.slot } : null,
  orders: item => item.providerEventId ? { providerEventId: item.providerEventId } : null,
  revenueEvents: item => item.providerEventId ? { providerEventId: item.providerEventId } : null
};

export async function loadJsonDatabase(file) {
  const absolute = path.resolve(file);
  const raw = JSON.parse(await fs.readFile(absolute, 'utf8'));
  const errors = [];
  for (const key of COLLECTIONS) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) errors.push(`${key} must be an array`);
    for (const [index, item] of (raw[key] || []).entries()) {
      if (!item || typeof item !== 'object') errors.push(`${key}[${index}] must be an object`);
      else if (!item.id) errors.push(`${key}[${index}] is missing id`);
    }
  }
  if (raw.settings !== undefined && (!raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings))) {
    errors.push('settings must be an object');
  }
  if (errors.length) throw new Error(`JSON database validation failed:\n- ${errors.join('\n- ')}`);
  return { absolute, data: raw };
}

function emptyReport(file, dryRun) {
  return {
    sourceFile: file,
    dryRun,
    startedAt: new Date().toISOString(),
    completedAt: null,
    tables: {},
    settings: { source: 0, written: 0 },
    totals: { source: 0, written: 0, updated: 0, duplicates: 0 },
    duplicateDetails: []
  };
}

function duplicate(detail) {
  return { status: 'duplicate', detail };
}

// Writes one source row and reports how it was counted. A unique-constraint
// conflict is a duplicate, not a failure of the batch. It is reported with the
// table, the incoming id and the constraint that rejected it. The constraint name
// is the only database detail kept: PostgreSQL's detail text repeats the row's
// values (an email address, for instance), and the report is written to disk.
async function writeRow(tx, key, item) {
  const lookup = UNIQUE_LOOKUPS[key]?.(item);
  const existingByUnique = lookup ? await tx.findOne(key, lookup) : null;
  if (existingByUnique && existingByUnique.id !== item.id) {
    return duplicate({ table: key, incomingId: item.id, existingId: existingByUnique.id, fields: Object.keys(lookup) });
  }
  try {
    // The savepoint confines a rejected row to its own writes. Without it, PostgreSQL
    // aborts the whole transaction on the first conflict, and every later row fails
    // with that abort instead of the conflict that caused it.
    const { inserted } = await tx.savepoint(() => tx.upsertWithStatus(key, item));
    return { status: inserted ? 'written' : 'updated' };
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    return duplicate({ table: key, incomingId: item.id, reason: 'constraint conflict', constraint: error.cause?.constraint ?? null });
  }
}

export async function importJsonDatabase(store, file, { dryRun = false } = {}) {
  const loaded = await loadJsonDatabase(file);
  const report = emptyReport(loaded.absolute, dryRun);
  for (const key of IMPORT_ORDER) {
    const source = loaded.data[key] || [];
    report.tables[key] = { source: source.length, written: 0, updated: 0, duplicates: 0 };
    report.totals.source += source.length;
  }
  report.settings.source = Object.keys(loaded.data.settings || {}).length;
  report.totals.source += report.settings.source;
  if (dryRun) {
    report.completedAt = new Date().toISOString();
    return report;
  }

  // The batch is all-or-nothing for everything except duplicates. A duplicate is
  // skipped and counted; any other failure aborts the transaction, so nothing from
  // this run is committed.
  await store.transaction(async tx => {
    for (const key of IMPORT_ORDER) {
      const table = report.tables[key];
      for (const item of loaded.data[key] || []) {
        const outcome = await writeRow(tx, key, item);
        if (outcome.status === 'duplicate') {
          table.duplicates += 1;
          report.totals.duplicates += 1;
          report.duplicateDetails.push(outcome.detail);
        } else if (outcome.status === 'updated') {
          table.updated += 1;
          report.totals.updated += 1;
        } else {
          table.written += 1;
          report.totals.written += 1;
        }
      }
    }
    for (const [key, value] of Object.entries(loaded.data.settings || {})) {
      await tx.setSetting(key, value);
      report.settings.written += 1;
      report.totals.written += 1;
    }
  });
  report.completedAt = new Date().toISOString();
  return report;
}
