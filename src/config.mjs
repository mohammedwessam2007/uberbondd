import path from 'node:path';

const env = process.env;
const root = path.resolve('.');
const num = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = (value, fallback = false) => value == null ? fallback : String(value).toLowerCase() === 'true';
const production = env.NODE_ENV === 'production';

export const config = {
  version: '1.4.0',
  nodeEnv: env.NODE_ENV || 'development',
  port: num(env.PORT, 8080),
  processRole: String(env.PROCESS_ROLE || (production ? 'web' : 'all')).toLowerCase(),
  baseUrl: env.APP_BASE_URL || `http://localhost:${env.PORT || 8080}`,
  dataDir: path.resolve(env.DATA_DIR || './data'),
  screenshotDir: path.resolve(env.SCREENSHOT_DIR || './data/screenshots'),
  storeBackend: String(env.STORE_BACKEND || (production ? 'postgres' : 'json')).toLowerCase(),
  databaseUrl: env.DATABASE_URL || '',
  databaseSsl: bool(env.DATABASE_SSL, production),
  adminToken: env.ADMIN_TOKEN || '',
  encryptionKey: env.TOKEN_ENCRYPTION_KEY || '',
  unsubscribeSecret: env.UNSUBSCRIBE_SECRET || env.TOKEN_ENCRYPTION_KEY || '',
  autopilot: bool(env.AUTOPILOT_ENABLED, false),
  allowLocalFixtures: bool(env.ALLOW_LOCAL_FIXTURES, false) || env.NODE_ENV === 'test',
  chromiumPath: env.CHROMIUM_PATH || '',
  caps: { A: num(env.DEFAULT_DAILY_CAP_A, 20), B: num(env.DEFAULT_DAILY_CAP_B, 20) },
  outbound: {
    enabled: bool(env.OUTBOUND_ENABLED, false),
    dryRun: bool(env.OUTBOUND_DRY_RUN, true),
    allowedCountries: (env.OUTBOUND_ALLOWED_COUNTRIES || '').split(',').map(value => value.trim()).filter(Boolean),
    hourlyCaps: { A: num(env.OUTBOUND_HOURLY_CAP_A, 5), B: num(env.OUTBOUND_HOURLY_CAP_B, 5) },
    minGapSeconds: num(env.OUTBOUND_MIN_GAP_SECONDS, 90),
    businessHourStart: num(env.OUTBOUND_BUSINESS_HOUR_START, 9),
    businessHourEnd: num(env.OUTBOUND_BUSINESS_HOUR_END, 17),
    minEvidenceConfidence: num(env.OUTBOUND_MIN_EVIDENCE_CONFIDENCE, 0.75),
    hardBouncePauseThreshold: num(env.OUTBOUND_HARD_BOUNCE_PAUSE_THRESHOLD, 2),
    complaintPauseThreshold: num(env.OUTBOUND_COMPLAINT_PAUSE_THRESHOLD, 1),
    failurePauseThreshold: num(env.OUTBOUND_FAILURE_PAUSE_THRESHOLD, 3),
    processBatchSize: num(env.OUTBOUND_PROCESS_BATCH_SIZE, 10)
  },
  // Canon/V3 autonomous-cycle integration (premerge audit P0-006, P1-010). ACQUISITION_WORKERS_ACTIVE
  // is the master gate for the Canon opportunity-hunt/prospect-supply/send-planning cycle -- distinct
  // from OUTBOUND_ENABLED, which gates the pre-existing single-prospect outbound pipeline. Both
  // default to off; live dispatch additionally requires a matching campaignActivationApprovals row
  // (src/campaign-activation.mjs) even when this flag is true.
  acquisition: {
    workersActive: bool(env.ACQUISITION_WORKERS_ACTIVE, false),
    simulation: bool(env.ACQUISITION_SIMULATION, true),
    dailyModelCostCeilingCents: num(env.ACQUISITION_DAILY_MODEL_COST_CEILING_CENTS, 500),
    monthlyModelCostCeilingCents: num(env.ACQUISITION_MONTHLY_MODEL_COST_CEILING_CENTS, 10000),
    dailyInfraCostCeilingCents: num(env.ACQUISITION_DAILY_INFRA_COST_CEILING_CENTS, 500),
    targetProspectBacklog: num(env.ACQUISITION_TARGET_PROSPECT_BACKLOG, 1000),
    targetDailySends: num(env.ACQUISITION_TARGET_DAILY_SENDS, 0),
    explorationShare: Math.min(1, Math.max(0, num(env.ACQUISITION_EXPLORATION_SHARE, 0.2))),
    minimumIndependentEvidence: num(env.ACQUISITION_MIN_INDEPENDENT_EVIDENCE, 3),
    sourceFamilyHardBouncePauseThreshold: num(env.ACQUISITION_SOURCE_FAMILY_HARD_BOUNCE_PAUSE_THRESHOLD, 2),
    sourceFamilyComplaintPauseThreshold: num(env.ACQUISITION_SOURCE_FAMILY_COMPLAINT_PAUSE_THRESHOLD, 1)
  },
  maxBatch: num(env.MAX_BATCH_SIZE, 25),
  crawl: {
    concurrency: num(env.CRAWL_CONCURRENCY, 2),
    delayMs: num(env.CRAWL_DELAY_MS, 500),
    maxPages: num(env.MAX_PAGES_PER_SITE, 5),
    timeoutMs: num(env.CRAWL_TIMEOUT_MS, 25000)
  },
  replyPollMinutes: num(env.REPLY_POLL_MINUTES, 10),
  artifacts: {
    maxBytes: num(env.ARTIFACT_MAX_BYTES, 6 * 1024 * 1024),
    retentionDays: num(env.ARTIFACT_RETENTION_DAYS, 90),
    deleteLocalAfterUpload: bool(env.ARTIFACT_DELETE_LOCAL_AFTER_UPLOAD, production)
  },
  queue: {
    concurrency: num(env.QUEUE_CONCURRENCY, 2),
    pollMs: num(env.QUEUE_POLL_MS, 1000),
    maxAttempts: num(env.QUEUE_MAX_ATTEMPTS, 5),
    retryBaseMs: num(env.QUEUE_RETRY_BASE_MS, 30000),
    retryMaxMs: num(env.QUEUE_RETRY_MAX_MS, 3600000),
    lockTimeoutMs: num(env.QUEUE_LOCK_TIMEOUT_MS, 20 * 60 * 1000),
    jobHeartbeatMs: num(env.QUEUE_JOB_HEARTBEAT_MS, 15000),
    workerHeartbeatMs: num(env.WORKER_HEARTBEAT_MS, 15000),
    workerStaleMs: num(env.WORKER_STALE_MS, 90000),
    maxRuntimeMs: num(env.QUEUE_MAX_RUNTIME_MS, 15 * 60 * 1000)
  },
  discovery: {
    enabled: bool(env.DISCOVERY_ENABLED, false),
    dryRun: bool(env.DISCOVERY_DRY_RUN, true),
    endpoint: env.DISCOVERY_OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter',
    campaignId: env.DISCOVERY_CAMPAIGN_ID || '',
    bbox: env.DISCOVERY_BBOX || '',
    categories: (env.DISCOVERY_CATEGORIES || 'clinic,dentist,medical').split(',').map(value => value.trim()).filter(Boolean),
    country: env.DISCOVERY_COUNTRY || '',
    city: env.DISCOVERY_CITY || '',
    dailyCap: num(env.DISCOVERY_DAILY_CAP, 50),
    runEveryHours: num(env.DISCOVERY_RUN_EVERY_HOURS, 24),
    timeoutMs: num(env.DISCOVERY_TIMEOUT_MS, 30000),
    maxBboxSpan: num(env.DISCOVERY_MAX_BBOX_SPAN, 5),
    userAgent: env.DISCOVERY_USER_AGENT || 'UberBondRevenueEngine/1.3'
  },
  ai: {
    provider: env.AI_PROVIDER || 'rules',
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    openaiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || 'gpt-5-mini'
  },
  hunterKey: env.HUNTER_API_KEY || '',
  google: {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: env.GOOGLE_REDIRECT_URI || `${env.APP_BASE_URL || 'http://localhost:8080'}/oauth/google/callback`
  },
  sender: {
    name: env.SENDER_NAME || 'Mohamed Wessam',
    company: env.SENDER_COMPANY || 'UberBond',
    address: env.BUSINESS_ADDRESS || ''
  },
  revenue: {
    publicIntake: bool(env.PUBLIC_AUDIT_ENABLED, true),
    publicRateLimitPerHour: num(env.PUBLIC_RATE_LIMIT_PER_HOUR, 8),
    freeFindings: num(env.FREE_REPORT_FINDINGS, 1),
    fullAuditPrice: num(env.FULL_AUDIT_PRICE_USD, 49),
    strategyAuditPrice: num(env.STRATEGY_AUDIT_PRICE_USD, 299),
    monitoringPrice: num(env.MONITORING_PRICE_USD, 99),
    implementationFrom: num(env.IMPLEMENTATION_FROM_USD, 1000),
    bookingUrl: env.BOOKING_URL || '',
    reportDeliveryInbox: env.REPORT_DELIVERY_INBOX || 'B',
    autoEmailReports: bool(env.AUTO_EMAIL_REPORTS, false),
    paymentProvider: env.PAYMENT_PROVIDER || 'links',
    fullAuditCheckoutUrl: env.FULL_AUDIT_CHECKOUT_URL || '',
    strategyAuditCheckoutUrl: env.STRATEGY_AUDIT_CHECKOUT_URL || '',
    monitoringCheckoutUrl: env.MONITORING_CHECKOUT_URL || '',
    lemonWebhookSecret: env.LEMONSQUEEZY_WEBHOOK_SECRET || '',
    allowTestUnlock: bool(env.ALLOW_TEST_PAYMENT_UNLOCK, false),
    monitoringIntervalDays: num(env.MONITORING_INTERVAL_DAYS, 30),
    monitoringBatchSize: num(env.MONITORING_BATCH_SIZE, 10)
  },
  root
};

export function validateStartupConfig(cfg = config) {
  const role = cfg.processRole || (cfg.nodeEnv === 'production' ? 'web' : 'all');
  if (!['web', 'worker', 'all'].includes(role)) throw new Error('PROCESS_ROLE must be web, worker, or all');
  if (!['json', 'postgres'].includes(cfg.storeBackend)) throw new Error('STORE_BACKEND must be "json" or "postgres"');
  if (cfg.storeBackend === 'postgres' && !cfg.databaseUrl) throw new Error('DATABASE_URL is required when STORE_BACKEND=postgres');
  if (cfg.nodeEnv !== 'production') return true;
  if (cfg.storeBackend !== 'postgres') throw new Error('Production requires STORE_BACKEND=postgres');
  if (role === 'all') throw new Error('Production requires separate PROCESS_ROLE=web or PROCESS_ROLE=worker');
  if (!cfg.databaseUrl) throw new Error('Production requires DATABASE_URL');
  if (!cfg.adminToken || cfg.adminToken.length < 32) throw new Error('Production requires a strong ADMIN_TOKEN of at least 32 characters');
  if (!String(cfg.baseUrl).startsWith('https://')) throw new Error('Production requires an HTTPS APP_BASE_URL');
  if (cfg.outbound?.enabled && !cfg.outbound?.dryRun) {
    if (!cfg.sender?.address) throw new Error('Live outbound requires BUSINESS_ADDRESS');
    if (!Array.isArray(cfg.outbound.allowedCountries) || cfg.outbound.allowedCountries.length === 0) throw new Error('Live outbound requires OUTBOUND_ALLOWED_COUNTRIES');
    if (!cfg.google.clientId || !cfg.google.clientSecret) throw new Error('Live outbound requires Google OAuth credentials');
    if (!/^[a-f0-9]{64}$/i.test(cfg.encryptionKey || '')) throw new Error('Live outbound requires a 64-character hexadecimal TOKEN_ENCRYPTION_KEY');
    if (String(cfg.unsubscribeSecret || '').length < 32) throw new Error('Live outbound requires UNSUBSCRIBE_SECRET with at least 32 characters');
    if (cfg.outbound.businessHourStart < 0 || cfg.outbound.businessHourEnd > 24 || cfg.outbound.businessHourStart >= cfg.outbound.businessHourEnd) throw new Error('Invalid outbound business-hour window');
  }
  if (cfg.acquisition?.workersActive && cfg.acquisition?.simulation !== true) {
    if (!cfg.outbound?.enabled || cfg.outbound?.dryRun) throw new Error('Live ACQUISITION_WORKERS_ACTIVE requires OUTBOUND_ENABLED=true and OUTBOUND_DRY_RUN=false');
    if (!cfg.sender?.address) throw new Error('Live ACQUISITION_WORKERS_ACTIVE requires BUSINESS_ADDRESS');
  }
  const gmailConfigured = Boolean(cfg.google.clientId || cfg.google.clientSecret);
  if (gmailConfigured && !/^[a-f0-9]{64}$/i.test(cfg.encryptionKey || '')) {
    throw new Error('Production Gmail integration requires a 64-character hexadecimal TOKEN_ENCRYPTION_KEY');
  }
  return true;
}
