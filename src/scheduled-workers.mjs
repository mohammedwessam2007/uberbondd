const MODE_DEFINITIONS = Object.freeze({
  discovery: Object.freeze({
    jobType: 'discovery.run', maximumBatch: 10, defaultBatch: 5, maxAttempts: 4,
    payload: limit => ({ scheduled: true, dryRun: false, limit, maxBatches: 1 })
  }),
  'crawl-audit': Object.freeze({
    jobType: 'research.batch', maximumBatch: 10, defaultBatch: 4, maxAttempts: 3,
    payload: limit => ({ limit, reason: 'scheduled-crawl-audit', deferDrafts: true })
  }),
  'draft-generation': Object.freeze({
    jobType: 'drafts.process', maximumBatch: 20, defaultBatch: 10, maxAttempts: 3,
    payload: limit => ({ limit, reason: 'scheduled-draft-generation' })
  }),
  'reply-sync': Object.freeze({
    jobType: 'replies.poll', maximumBatch: 25, defaultBatch: 20, maxAttempts: 5,
    payload: limit => ({ accountLimit: 2, messageLimit: limit })
  }),
  'followup-scheduler': Object.freeze({
    jobType: 'followups.process', maximumBatch: 20, defaultBatch: 10, maxAttempts: 5,
    payload: limit => ({ limit, reason: 'scheduled-followup-review' })
  }),
  'payment-reconciliation': Object.freeze({
    jobType: 'payments.reconcile', maximumBatch: 20, defaultBatch: 10, maxAttempts: 5,
    payload: limit => ({ limit })
  }),
  'stale-recovery': Object.freeze({
    jobType: 'stale.recover', maximumBatch: 1, defaultBatch: 1, maxAttempts: 3,
    payload: () => ({ includeArtifacts: true })
  })
});

export const SCHEDULED_WORKER_MODES = Object.freeze(Object.keys(MODE_DEFINITIONS));

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function cleanRunKey(value = '') {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_.:-]/g, '-')
    .slice(0, 120) || new Date().toISOString().slice(0, 13);
}

export function scheduledWorkerPlan(mode, input = {}) {
  const normalized = String(mode || '').trim().toLowerCase();
  const definition = MODE_DEFINITIONS[normalized];
  if (!definition) throw new Error(`Unsupported scheduled worker mode: ${normalized || 'missing'}`);
  const limit = boundedInteger(input.batchSize, definition.defaultBatch, 1, definition.maximumBatch);
  return {
    mode: normalized,
    jobType: definition.jobType,
    limit,
    maximumBatch: definition.maximumBatch,
    maxAttempts: definition.maxAttempts,
    payload: definition.payload(limit),
    concurrency: 1,
    jobsPerRun: 1
  };
}

export function scheduledWorkerPreflight(cfg = {}, mode = '') {
  if (cfg.outbound?.enabled !== false
    || cfg.outbound?.dryRun !== true
    || cfg.outbound?.liveSendApproved === true) {
    throw new Error('Scheduled acquisition workers require outbound to remain disabled and dry-run');
  }
  if (mode === 'reply-sync' && cfg.outbound?.provider !== 'gmail') {
    return { ok: false, blockedReason: 'gmail-authentication-required' };
  }
  if (mode !== 'reply-sync' && cfg.outbound?.provider !== 'test') {
    throw new Error('Non-reply scheduled workers require the test outbound provider');
  }
  if (cfg.storeBackend !== 'postgres') throw new Error('Scheduled acquisition workers require STORE_BACKEND=postgres');
  if (!cfg.databaseUrl) return { ok: false, blockedReason: 'database-authentication-required' };
  if (mode === 'reply-sync') {
    const googleReady = Boolean(cfg.google?.clientId && cfg.google?.clientSecret);
    const encryptionReady = /^[a-f0-9]{64}$/i.test(String(cfg.encryptionKey || ''));
    if (!googleReady || !encryptionReady || cfg.google?.allowNetwork !== true) {
      return { ok: false, blockedReason: 'gmail-authentication-required' };
    }
  }
  if (mode === 'draft-generation') {
    if (!String(cfg.baseUrl || '').startsWith('https://') || String(cfg.unsubscribeSecret || '').length < 32) {
      return { ok: false, blockedReason: 'draft-safety-configuration-required' };
    }
  }
  return { ok: true, blockedReason: '' };
}

function safeQueueCounts(stats = {}) {
  const allowed = new Set(['queued', 'retry', 'active', 'completed', 'dead-letter']);
  return Object.fromEntries(Object.entries(stats.counts || {})
    .filter(([status]) => allowed.has(status))
    .map(([status, count]) => [status, Number(count || 0)]));
}

export function safeWorkerLogger(target = console) {
  const emit = (level, event, error) => {
    const record = {
      level,
      event: String(event || 'scheduled-worker').replace(/[^a-zA-Z0-9 _.:/-]/g, '').slice(0, 120)
    };
    if (error) record.code = String(error.code || error.name || 'worker-error').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80);
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    target[method]?.(JSON.stringify(record));
  };
  return {
    log: event => emit('info', event),
    info: event => emit('info', event),
    warn: (event, error) => emit('warn', event, error),
    error: (event, error) => emit('error', event, error)
  };
}

export async function runScheduledWorker({ mode, batchSize, runKey, queue, handlers, store }) {
  const plan = scheduledWorkerPlan(mode, { batchSize });
  const safeRunKey = cleanRunKey(runKey);
  const job = await queue.enqueue(plan.jobType, plan.payload, {
    queue: plan.jobType,
    maxAttempts: plan.maxAttempts,
    priority: 0,
    dedupeKey: `scheduled:${plan.mode}:${safeRunKey}`,
    singletonKey: `scheduled:${plan.mode}`
  });
  let claimed = 0;
  let paused = false;
  for (let index = 0; index < plan.jobsPerRun; index += 1) {
    const result = await queue.runOnce(handlers, {
      concurrency: plan.concurrency,
      types: [plan.jobType]
    });
    claimed += Number(result.claimed || 0);
    paused = paused || result.paused === true;
    if (!result.claimed) break;
  }
  const storedJob = await store.get('jobs', job.id);
  const stats = await queue.stats();
  return {
    mode: plan.mode,
    jobType: plan.jobType,
    batchLimit: plan.limit,
    claimed,
    paused,
    jobStatus: storedJob?.status || job.status || 'unknown',
    queueCounts: safeQueueCounts(stats),
    liveOutboundEnabled: false
  };
}
