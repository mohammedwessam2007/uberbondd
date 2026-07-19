import { id, now, normalizeDomain, uniq } from './utils.mjs';
import { buildDiscoveryBatches, discoverBusinesses, normalizeCategories } from './discovery.mjs';
import { parseStrictBoolean, parseDryRunBoolean } from './input.mjs';
import { importProspects } from './prospect-import.mjs';
import { redactSensitiveText } from './security.mjs';

function permanentDiscoveryError(message) {
  const error = new Error(message);
  error.retryable = false;
  return error;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function campaignCap(campaign, fallback) {
  return boundedInteger(campaign?.dailyDiscoveryCap, boundedInteger(fallback, 50, 0, 100), 0, 100);
}

function cursorSettingKey(campaignId) {
  return `discoveryCursor:${campaignId}`;
}

function addSummary(target, source = {}) {
  for (const [reason, count] of Object.entries(source)) target[reason] = (target[reason] || 0) + Number(count || 0);
}

function queueableProspectIds(result) {
  return uniq([...(result.added || []), ...(result.existing || [])]
    .filter(prospect => ['queued', 'new', 'retry', 'error'].includes(prospect.status))
    .map(prospect => prospect.id));
}

export class DiscoveryRunner {
  constructor(store, config, hooks = {}) {
    this.store = store;
    this.config = config;
    this.fetcher = hooks.fetcher || fetch;
    this.enqueueResearch = hooks.enqueueResearch || null;
    this.clock = hooks.clock || (() => new Date());
  }

  async run(options = {}) {
    const scheduled = parseStrictBoolean(options.scheduled, 'scheduled', false);
    const campaignId = String(options.campaignId || this.config.discovery.campaignId || '');
    if (scheduled && !campaignId) return this.runScheduled({ ...options, scheduled });
    return this.runCampaign({ ...options, campaignId, scheduled });
  }

  async runScheduled(options = {}) {
    const campaigns = (await this.store.list('campaigns'))
      .filter(campaign => campaign.approved === true && campaign.enabled !== false)
      .filter(campaign => campaignCap(campaign, this.config.discovery.dailyCap) > 0)
      .filter(campaign => (campaign.discoveryCategories || []).length && (campaign.boundingBoxes || []).length)
      .slice(0, boundedInteger(this.config.discovery.maxCampaignsPerRun, 10, 1, 25));
    const results = [];
    const errors = [];
    for (const campaign of campaigns) {
      try {
        results.push(await this.runCampaign({ ...options, campaignId: campaign.id, scheduled: true }));
      } catch (error) {
        errors.push({ campaignId: campaign.id, error: redactSensitiveText(error.message), retryable: error.retryable !== false });
      }
    }
    await this.store.log('scheduled_discovery_completed', {
      campaignsConsidered: campaigns.length,
      campaignsCompleted: results.length,
      campaignsFailed: errors.length,
      discovered: results.reduce((sum, result) => sum + Number(result.discoveredCount || 0), 0),
      imported: results.reduce((sum, result) => sum + Number(result.importedCount || 0), 0)
    });
    if (errors.some(error => error.retryable)) {
      const failure = new Error(`Scheduled discovery has ${errors.length} failed campaign run${errors.length === 1 ? '' : 's'}`);
      failure.results = results;
      failure.failures = errors;
      throw failure;
    }
    return { status: 'completed', scheduled: true, campaignCount: campaigns.length, results, errors };
  }

  async runCampaign(options = {}) {
    const campaignId = String(options.campaignId || '');
    const campaign = campaignId ? await this.store.get('campaigns', campaignId) : null;
    const dryRun = parseDryRunBoolean(options.dryRun, this.config.discovery.dryRun);
    const categories = Array.isArray(options.categories) && options.categories.length
      ? normalizeCategories(options.categories)
      : normalizeCategories(campaign?.discoveryCategories?.length ? campaign.discoveryCategories : this.config.discovery.categories);
    const batches = buildDiscoveryBatches(campaign || {}, {
      bbox: options.bbox || '',
      country: options.country || '',
      city: options.city || '',
      maxSpan: this.config.discovery.maxBboxSpan
    });
    const startedAt = now();
    const runDate = this.clock().toISOString().slice(0, 10);
    const settings = campaignId ? await this.store.getSettings() : {};
    const savedCursor = Number(settings[cursorSettingKey(campaignId)]?.nextBatchIndex || 0);
    const explicitCursor = options.cursor === undefined ? savedCursor : Number(options.cursor);
    const startCursor = batches.length ? Math.max(0, Math.floor(Number.isFinite(explicitCursor) ? explicitCursor : 0)) % batches.length : 0;
    const run = {
      id: id('disc'),
      provider: 'openstreetmap-overpass',
      status: 'running',
      scheduled: Boolean(options.scheduled),
      dryRun,
      campaignId,
      categories,
      startCursor,
      nextCursor: startCursor,
      batchCount: 0,
      batches: [],
      startedAt,
      runDate,
      rawCount: 0,
      rejectedCount: 0,
      discoveredCount: 0,
      importedCount: 0,
      skippedCount: 0,
      queuedCount: 0,
      error: ''
    };
    await this.store.add('discoveryRuns', run);

    let rawCount = 0;
    let rejectedCount = 0;
    let discoveredCount = 0;
    let importedCount = 0;
    let skippedCount = 0;
    let queuedCount = 0;
    let nextCursor = startCursor;
    const preview = [];
    const batchResults = [];
    const rejectionSummary = {};
    const seenDomains = new Set();

    try {
      if (!campaignId || !campaign) throw permanentDiscoveryError('A valid discovery campaign is required');
      if (!campaign.approved || campaign.enabled === false) throw permanentDiscoveryError('The discovery campaign must be enabled');
      if (!batches.length) throw permanentDiscoveryError('At least one campaign or request bounding box is required');

      const globalCap = boundedInteger(this.config.discovery.dailyCap, 50, 0, 100);
      if (!globalCap) throw permanentDiscoveryError('The system daily discovery cap is zero');
      const perCampaignCap = campaignCap(campaign, globalCap);
      if (!perCampaignCap) throw permanentDiscoveryError('The campaign daily discovery cap is zero');
      const requested = boundedInteger(options.limit, perCampaignCap, 1, 100);
      const limit = dryRun
        ? Math.min(requested, globalCap, perCampaignCap)
        : await this.store.reserveDiscoveryCapacity(runDate, globalCap, requested, run.id, { campaignId, campaignCap: perCampaignCap });
      if (!dryRun && !limit) throw permanentDiscoveryError('Daily discovery import cap reached');
      const requestedBatchCount = boundedInteger(options.maxBatches, this.config.discovery.batchesPerRun || 1, 1, 100);
      const maxBatches = Math.min(requestedBatchCount, batches.length);

      for (let offset = 0; offset < maxBatches && importedCount < limit; offset += 1) {
        const batchIndex = (startCursor + offset) % batches.length;
        const batch = batches[batchIndex];
        const remaining = Math.max(1, limit - importedCount);
        const result = await discoverBusinesses(this.config.discovery, {
          bbox: batch.bbox,
          categories,
          country: batch.country,
          city: batch.city,
          limit: remaining,
          excludedDomains: this.config.discovery.excludedDomains,
          allowReservedDomains: this.config.discovery.allowReservedDomains === true,
          discoveredAt: now()
        }, this.fetcher);
        rawCount += result.rawCount;
        rejectedCount += result.rejectedCount;
        addSummary(rejectionSummary, result.rejectionSummary);
        const prospects = result.prospects.filter(prospect => {
          const domain = normalizeDomain(prospect.domain || prospect.website);
          if (!domain || seenDomains.has(domain)) return false;
          seenDomains.add(domain);
          return true;
        });
        discoveredCount += prospects.length;
        preview.push(...prospects.slice(0, Math.max(0, 20 - preview.length)));
        let imported = { added: [], skipped: [], existing: [] };
        let queueIds = [];
        let queueJobId = '';
        if (!dryRun) {
          imported = await importProspects(this.store, this.config, prospects, campaignId, {
            limit: remaining,
            excludedDomains: this.config.discovery.excludedDomains,
            allowReservedDomains: this.config.discovery.allowReservedDomains === true
          });
          importedCount += imported.added.length;
          skippedCount += imported.skipped.length;
          queueIds = queueableProspectIds(imported);
          if (queueIds.length && this.enqueueResearch) {
            const queueJob = await this.enqueueResearch({
              limit: Math.min(100, queueIds.length),
              prospectIds: queueIds,
              campaignId,
              discoveryRunId: run.id,
              discoveryBatchIndex: batchIndex,
              reason: 'discovery',
              dedupeKey: `research:discovery:${campaignId}:${runDate}:${batch.key}`
            });
            queueJobId = queueJob?.id || '';
            queuedCount += queueIds.length;
          }
        }
        nextCursor = (batchIndex + 1) % batches.length;
        const batchResult = {
          index: batchIndex,
          key: batch.key,
          country: batch.country,
          city: batch.city,
          bbox: batch.bbox,
          rawCount: result.rawCount,
          rejectedCount: result.rejectedCount,
          discoveredCount: prospects.length,
          importedCount: imported.added.length,
          skippedCount: imported.skipped.length,
          queuedCount: queueIds.length,
          queueJobId
        };
        batchResults.push(batchResult);
        if (!dryRun) {
          await this.store.setSetting(cursorSettingKey(campaignId), {
            nextBatchIndex: nextCursor,
            lastBatchKey: batch.key,
            lastRunId: run.id,
            updatedAt: now()
          });
        }
        await this.store.patch('discoveryRuns', run.id, {
          rawCount,
          rejectedCount,
          discoveredCount,
          processedImportedCount: importedCount,
          skippedCount,
          queuedCount,
          nextCursor,
          batchCount: batchResults.length,
          batches: batchResults,
          preview,
          rejectionSummary
        });
      }

      const completed = {
        status: 'completed',
        rawCount,
        rejectedCount,
        rejectionSummary,
        discoveredCount,
        importedCount,
        skippedCount,
        queuedCount,
        startCursor,
        nextCursor,
        batchCount: batchResults.length,
        batches: batchResults,
        preview,
        attribution: '© OpenStreetMap contributors',
        sourceLicense: 'Open Data Commons Open Database License (ODbL) 1.0',
        completedAt: now()
      };
      await this.store.patch('discoveryRuns', run.id, completed);
      await this.store.log('discovery_completed', {
        runId: run.id,
        campaignId,
        dryRun,
        discovered: completed.discoveredCount,
        imported: completed.importedCount,
        queued: completed.queuedCount,
        batches: completed.batchCount
      });
      return { ...run, ...completed };
    } catch (error) {
      const status = importedCount > 0 ? 'partial_error' : 'error';
      await this.store.patch('discoveryRuns', run.id, {
        status,
        rawCount,
        rejectedCount,
        rejectionSummary,
        discoveredCount,
        importedCount,
        skippedCount,
        queuedCount,
        nextCursor,
        batchCount: batchResults.length,
        batches: batchResults,
        preview,
        error: redactSensitiveText(error.message),
        completedAt: now()
      });
      await this.store.log('discovery_failed', { runId: run.id, campaignId, status, imported: importedCount, error: redactSensitiveText(error.message) });
      throw error;
    }
  }
}
