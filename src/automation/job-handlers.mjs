import { id, now } from '../utils.mjs';
import { createFulfillmentTask } from './fulfillment.mjs';
import { assertMonitoringConsent } from './monitoring.mjs';
import { importApifyExport, pollApifyTask } from './apify-import.mjs';
import { buildExceptionQueue, exceptionQueueSummary } from './exceptions.mjs';
import { buildDailyDigest, buildWeeklyHealthReport } from './digest.mjs';
import { buildCockpitSnapshot } from '../cockpit.mjs';
import { automationStatus } from './mode.mjs';

/**
 * Wires the new automation-layer stages into the same generic, already-tested job harness
 * (src/queue.mjs) the existing pipeline/revenue job handlers use -- locks, leases, heartbeats,
 * retries, dead-lettering, and bounded concurrency are inherited for free rather than
 * reimplemented. Merge the returned object with createJobHandlers(...) from src/job-handlers.mjs
 * when registering handlers with the queue.
 */
export function createAutomationJobHandlers({ store, cfg, revenue }) {
  return {
    'fulfillment.process': async (payload = {}) => {
      const limit = Math.max(1, Math.min(20, Number(payload.limit || 10)));
      const deliveries = (await store.list('deliveries')).filter(delivery => delivery.status === 'delivery-queued').slice(0, limit);
      const existingTasks = await store.list('fulfillmentTasks');
      const alreadyTasked = new Set(existingTasks.map(task => task.deliveryId));
      let created = 0;
      const skipped = [];
      for (const delivery of deliveries) {
        if (alreadyTasked.has(delivery.id)) continue;
        try {
          const task = createFulfillmentTask(delivery, payload.laneOptions || {});
          await store.add('fulfillmentTasks', { ...task, id: task.id || id('fulfill') });
          created += 1;
        } catch (error) {
          skipped.push({ deliveryId: delivery.id, code: error.code || 'fulfillment-task-create-failed' });
        }
      }
      return { considered: deliveries.length, created, skipped };
    },

    'monitoring.enroll': async (payload = {}) => {
      assertMonitoringConsent(payload.consent || {});
      const lead = payload.leadId ? await store.get('leads', payload.leadId) : null;
      const offer = await store.get('offers', payload.offerId);
      if (!offer || offer.type !== 'monitoring' || offer.paymentState !== 'paid') {
        throw Object.assign(new Error('monitoring-enrollment-requires-paid-monitoring-offer'), { retryable: false });
      }
      return revenue.activateSubscription(lead || { id: null, prospectId: offer.prospectId }, {
        provider: offer.provider, providerId: offer.id, amountCents: offer.amountCents, currency: offer.currency, status: 'active'
      });
    },

    'apify.import': async (payload = {}) => {
      if (!payload.text || !payload.campaignId) throw Object.assign(new Error('apify-import-requires-text-and-campaignId'), { retryable: false });
      return importApifyExport(store, cfg, payload.text, payload.campaignId, { format: payload.format });
    },

    'apify.poll': async (payload = {}) => pollApifyTask(store, cfg, payload.campaignId, payload),

    'digest.daily': async () => {
      const [prospects, replies, orders, campaigns, senderHealthRecords, settingsAware] = await Promise.all([
        store.list('prospects'), store.list('replies'), store.list('orders'), store.list('campaigns'), store.list('senderHealth'), store.getSettings?.() || {}
      ]);
      const [fulfillmentTasks, subscriptions, jobs, liveWorkers, revenueSummary] = await Promise.all([
        store.list('fulfillmentTasks'), store.list('subscriptions'), store.list('jobs'), store.list('workerHeartbeats'), revenue.summary()
      ]);
      const cockpitSnapshot = buildCockpitSnapshot({ prospects, replies, orders, campaigns, senderHealth: senderHealthRecords, settings: settingsAware, outbound: cfg.outbound });
      const exceptionSummary = exceptionQueueSummary(buildExceptionQueue({
        replies, orders, fulfillmentTasks, subscriptions, senderHealth: senderHealthRecords,
        deadLetterJobs: jobs.filter(job => job.status === 'dead-letter')
      }));
      const digest = buildDailyDigest({
        revenueSummary, cockpitSnapshot, exceptionSummary,
        workerHealth: { liveWorkerCount: liveWorkers.length, deadLetterCount: jobs.filter(job => job.status === 'dead-letter').length },
        automationStatus: automationStatus(cfg)
      });
      const record = { id: id('digest'), ...digest, createdAt: now(), updatedAt: now() };
      try { await store.add('automationDigests', record); }
      catch { await store.patch('automationDigests', record.id, digest); }
      return digest;
    },

    'digest.weekly': async () => {
      const stored = (await store.list('automationDigests')).filter(entry => entry.kind === 'daily')
        .sort((left, right) => (left.digestDate || '').localeCompare(right.digestDate || ''));
      const jobs = await store.list('jobs');
      const [replies, orders, fulfillmentTasks, subscriptions, senderHealthRecords] = await Promise.all([
        store.list('replies'), store.list('orders'), store.list('fulfillmentTasks'), store.list('subscriptions'), store.list('senderHealth')
      ]);
      const exceptionSummary = exceptionQueueSummary(buildExceptionQueue({
        replies, orders, fulfillmentTasks, subscriptions, senderHealth: senderHealthRecords,
        deadLetterJobs: jobs.filter(job => job.status === 'dead-letter')
      }));
      const report = buildWeeklyHealthReport(stored, { exceptionSummary, automationStatus: automationStatus(cfg) });
      const record = { id: id('digest'), ...report, createdAt: now(), updatedAt: now() };
      try { await store.add('automationDigests', record); }
      catch { await store.patch('automationDigests', record.id, report); }
      return report;
    }
  };
}
