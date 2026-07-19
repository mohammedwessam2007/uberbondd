import fs from 'node:fs/promises';
import path from 'node:path';
import { COLLECTIONS, ConflictError } from './store.mjs';

const IMPORT_ORDER = [
  'campaigns', 'experiments', 'leads', 'prospects', 'offers', 'jobs', 'messages', 'replies', 'suppressions',
  'socialTasks', 'accounts', 'orders', 'deliveries', 'subscriptions', 'monitoringRuns',
  'notifications', 'revenueEvents', 'discoveryRuns', 'auditLog'
];

const UNIQUE_LOOKUPS = {
  prospects: item => item.domain ? { domain: String(item.domain).toLowerCase() } : null,
  suppressions: item => item.value ? { value: String(item.value).toLowerCase() } : null,
  replies: item => item.gmailId ? { gmailId: item.gmailId } : null,
  accounts: item => item.slot ? { slot: item.slot } : null,
  orders: item => item.providerEventId ? { providerEventId: item.providerEventId } : null,
  offers: item => item.prospectId && item.type ? { prospectId: item.prospectId, type: item.type } : null,
  deliveries: item => item.orderId ? { orderId: item.orderId } : null,
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

  await store.transaction(async tx => {
    for (const key of IMPORT_ORDER) {
      for (const item of loaded.data[key] || []) {
        const existingById = await tx.get(key, item.id);
        const lookup = UNIQUE_LOOKUPS[key]?.(item);
        const existingByUnique = lookup ? await tx.findOne(key, lookup) : null;
        if (existingByUnique && existingByUnique.id !== item.id) {
          report.tables[key].duplicates += 1;
          report.totals.duplicates += 1;
          report.duplicateDetails.push({ table: key, incomingId: item.id, existingId: existingByUnique.id, fields: Object.keys(lookup) });
          continue;
        }
        try {
          await tx.upsert(key, item);
          if (existingById) {
            report.tables[key].updated += 1;
            report.totals.updated += 1;
          } else {
            report.tables[key].written += 1;
            report.totals.written += 1;
          }
        } catch (error) {
          if (error instanceof ConflictError) {
            report.tables[key].duplicates += 1;
            report.totals.duplicates += 1;
            report.duplicateDetails.push({ table: key, incomingId: item.id, reason: 'constraint conflict' });
            continue;
          }
          throw error;
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
