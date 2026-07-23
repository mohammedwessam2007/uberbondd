import { parseCsv } from '../csv.mjs';
import { importProspects } from '../prospect-import.mjs';

export class ApifyImportError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ApifyImportError';
    this.code = code;
  }
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

/**
 * Maps one Apify dataset item (any of the common Google-Maps/business-directory scraper output
 * shapes) into the raw-item shape src/prospect-import.mjs already normalizes, deduplicates, and
 * qualifies. This module deliberately does none of that work itself -- normalization,
 * deduplication, freshness, business-identity resolution, and suppression are already handled by
 * the existing prospect-import/pipeline path, and duplicating them here would be exactly the kind
 * of speculative reimplementation to avoid.
 */
export function mapApifyItem(item = {}, campaignId = '') {
  const company = clean(item.title || item.name || item.companyName || item.company);
  const website = clean(item.website || item.url || item.domain);
  const recordId = clean(item.placeId || item.id || item.cid || `${company}:${website}`, 200);
  return {
    company,
    website,
    niche: clean(item.categoryName || item.category || item.industry, 120),
    country: clean(item.countryCode || item.country, 80),
    city: clean(item.city, 80),
    contactName: clean(item.ownerName || item.contactName, 120),
    campaignId,
    notes: clean(item.description, 1000),
    source: 'apify',
    sourceProvider: 'apify',
    sourceUrl: clean(item.url || item.searchPageUrl, 500),
    sourceRecordId: recordId,
    sourceLicense: 'apify-dataset-export',
    sourceLicenseUrl: 'https://apify.com/apify/legal',
    sourceAttribution: 'Publicly available business listing data via an Apify actor run',
    sourceMetadata: { apifyDatasetId: clean(item.__datasetId, 120), scrapedAt: clean(item.scrapedAt, 40) },
    discoveredAt: clean(item.scrapedAt) || undefined,
    __row: item.__row
  };
}

export function parseApifyExport(text, format = 'json') {
  if (format === 'csv') return parseCsv(text);
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new ApifyImportError('apify-export-invalid-json'); }
  if (!Array.isArray(parsed)) throw new ApifyImportError('apify-export-must-be-an-array');
  return parsed;
}

/**
 * Ingests a static Apify dataset export (JSON array or CSV text) that the owner has already
 * downloaded. This is the only Apify path exercised by tests -- no network calls.
 */
export async function importApifyExport(store, config, text, campaignId, options = {}) {
  const format = options.format === 'csv' ? 'csv' : 'json';
  const items = parseApifyExport(text, format).map(item => mapApifyItem(item, campaignId));
  return importProspects(store, config, items, campaignId, options);
}

/**
 * Optional scheduled Apify task polling (spec section A). Disabled unless cfg.apify.enabled and a
 * token/taskId are configured. Takes an injectable `fetchDatasetItems` so tests never perform real
 * network I/O -- the default implementation is provided but is not called by anything in this
 * repository until an operator wires it into a scheduled worker and supplies real credentials.
 */
export async function pollApifyTask(store, config, campaignId, { fetchDatasetItems, options = {} } = {}) {
  if (!config.apify?.enabled) throw new ApifyImportError('apify-polling-disabled');
  if (!config.apify?.token || !config.apify?.taskId) throw new ApifyImportError('apify-credentials-not-configured');
  if (typeof fetchDatasetItems !== 'function') throw new ApifyImportError('apify-fetcher-not-provided');
  const items = await fetchDatasetItems({ token: config.apify.token, taskId: config.apify.taskId });
  if (!Array.isArray(items)) throw new ApifyImportError('apify-task-response-invalid');
  const mapped = items.map(item => mapApifyItem(item, campaignId));
  return importProspects(store, config, mapped, campaignId, options);
}

export async function defaultApifyFetcher({ token, taskId }) {
  const response = await fetch(`https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}/runs/last/dataset/items`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new ApifyImportError('apify-task-request-failed', `Apify task request failed: ${response.status}`);
  return response.json();
}
