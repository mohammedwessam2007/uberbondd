import { id, now } from './utils.mjs';
import { discoverBusinesses } from './discovery.mjs';
import { parseStrictBoolean, parseDryRunBoolean } from './input.mjs';
import { importProspects } from './prospect-import.mjs';

function permanentDiscoveryError(message) {
  const error = new Error(message);
  error.retryable = false;
  return error;
}

export class DiscoveryRunner {
  constructor(store, config) {
    this.store = store;
    this.config = config;
  }

  async run(options = {}) {
    const campaignId = String(options.campaignId || this.config.discovery.campaignId || '');
    const campaign = await this.store.get('campaigns', campaignId);
    const dryRun = parseDryRunBoolean(options.dryRun, this.config.discovery.dryRun);
    const run = {
      id: id('disc'), provider: 'openstreetmap-overpass', status: 'running',
      scheduled: parseStrictBoolean(options.scheduled, 'scheduled', false), dryRun, campaignId,
      bbox: String(options.bbox || this.config.discovery.bbox || ''),
      categories: Array.isArray(options.categories)
        ? options.categories
        : String(options.categories || this.config.discovery.categories.join(',')).split(',').map(value => value.trim()).filter(Boolean),
      country: String(options.country || this.config.discovery.country || ''),
      city: String(options.city || this.config.discovery.city || ''),
      startedAt: now(), runDate: new Date().toISOString().slice(0, 10),
      rawCount: 0, discoveredCount: 0, importedCount: 0, skippedCount: 0, error: ''
    };
    await this.store.add('discoveryRuns', run);
    try {
      if (!campaignId || !campaign) throw permanentDiscoveryError('A valid discovery campaign is required');
      if (!campaign.approved) throw permanentDiscoveryError('The discovery campaign must be approved');
      if (!run.bbox) throw permanentDiscoveryError('A discovery bounding box is required');
      const requestedNumber = Math.floor(Number(options.limit));
      const requested = Number.isFinite(requestedNumber) && requestedNumber > 0
        ? requestedNumber
        : Math.max(1, Number(this.config.discovery.dailyCap) || 1);
      const limit = dryRun
        ? Math.min(requested, this.config.discovery.dailyCap)
        : await this.store.reserveDiscoveryCapacity(run.runDate, this.config.discovery.dailyCap, requested, run.id);
      if (!dryRun && !limit) throw permanentDiscoveryError('Daily discovery import cap reached');

      const result = await discoverBusinesses(this.config.discovery, {
        bbox: run.bbox, categories: run.categories, country: run.country, city: run.city, limit
      });
      let imported = { added: [], skipped: [] };
      if (!dryRun) imported = await importProspects(this.store, this.config, result.prospects, campaignId);
      const completed = {
        status: 'completed', rawCount: result.rawCount, discoveredCount: result.prospects.length,
        importedCount: imported.added.length, skippedCount: imported.skipped.length,
        preview: result.prospects.slice(0, 20), attribution: result.attribution, completedAt: now()
      };
      await this.store.patch('discoveryRuns', run.id, completed);
      await this.store.log('discovery_completed', {
        runId: run.id, dryRun, discovered: completed.discoveredCount, imported: completed.importedCount
      });
      return { ...run, ...completed };
    } catch (error) {
      await this.store.patch('discoveryRuns', run.id, { status: 'error', importedCount: 0, error: error.message, completedAt: now() });
      await this.store.log('discovery_failed', { runId: run.id, error: error.message });
      throw error;
    }
  }
}
