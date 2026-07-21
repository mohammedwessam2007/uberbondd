import path from 'node:path';

const env = process.env;
const root = path.resolve('.');
const num = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bool = (value, fallback = false) => value == null ? fallback : String(value).toLowerCase() === 'true';
// Strict, canonical-only boolean parsing for capability-gate flags: anything other than the exact
// lowercase string "true" is false. Unlike bool() above, this never treats "TRUE", "1", "yes", or
// whitespace-padded input as an enable signal, so an ambiguous env var can never turn on a gate.
export const parseCanonicalBoolean = value => value === 'true';
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
    provider: String(env.OUTBOUND_PROVIDER || 'test').toLowerCase(),
    enabled: bool(env.OUTBOUND_ENABLED, false),
    dryRun: bool(env.OUTBOUND_DRY_RUN, true),
    liveSendApproved: bool(env.OUTBOUND_LIVE_SEND_APPROVED, false),
    allowedCountries: (env.OUTBOUND_ALLOWED_COUNTRIES || '').split(',').map(value => value.trim()).filter(Boolean),
    hourlyCaps: { A: num(env.OUTBOUND_HOURLY_CAP_A, 5), B: num(env.OUTBOUND_HOURLY_CAP_B, 5) },
    minGapSeconds: num(env.OUTBOUND_MIN_GAP_SECONDS, 90),
    maxGapJitterSeconds: num(env.OUTBOUND_MAX_GAP_JITTER_SECONDS, 90),
    businessHourStart: num(env.OUTBOUND_BUSINESS_HOUR_START, 9),
    businessHourEnd: num(env.OUTBOUND_BUSINESS_HOUR_END, 17),
    minEvidenceConfidence: num(env.OUTBOUND_MIN_EVIDENCE_CONFIDENCE, 0.75),
    hardBouncePauseThreshold: num(env.OUTBOUND_HARD_BOUNCE_PAUSE_THRESHOLD, 2),
    complaintPauseThreshold: num(env.OUTBOUND_COMPLAINT_PAUSE_THRESHOLD, 1),
    failurePauseThreshold: num(env.OUTBOUND_FAILURE_PAUSE_THRESHOLD, 3),
    processBatchSize: num(env.OUTBOUND_PROCESS_BATCH_SIZE, 10)
  },
  // Inbound (P2.2 shadow autonomy) read gate. Deliberately independent of `outbound.*` above —
  // this must never be inferred from, or tied to, outbound enablement. Everything defaults off.
  inbound: {
    provider: String(env.INBOUND_PROVIDER || 'test').toLowerCase(),
    enabled: parseCanonicalBoolean(env.INBOUND_ENABLED),
    gmailReadEnabled: parseCanonicalBoolean(env.INBOUND_GMAIL_READ_ENABLED),
    // Defensible bounds so a single cycle can never run unbounded work, regardless of what an
    // upstream API returns. All are clamp-safe (num() falls back to the default for bad input).
    limits: {
      maxPagesPerCycle: Math.max(1, num(env.INBOUND_MAX_PAGES_PER_CYCLE, 5)),
      maxMessagesPerPage: Math.max(1, Math.min(500, num(env.INBOUND_MAX_MESSAGES_PER_PAGE, 25))),
      maxMessageBytes: Math.max(1024, num(env.INBOUND_MAX_MESSAGE_BYTES, 2 * 1024 * 1024)),
      // Raw HTTP response byte cap, checked before any JSON parsing/allocation -- distinct from
      // maxMessageBytes above, which bounds the already-parsed Gmail payload's declared size.
      maxResponseBytes: Math.max(1024, num(env.INBOUND_MAX_RESPONSE_BYTES, 5 * 1024 * 1024)),
      maxMimeDepth: Math.max(1, num(env.INBOUND_MAX_MIME_DEPTH, 10)),
      maxMimePartCount: Math.max(1, num(env.INBOUND_MAX_MIME_PART_COUNT, 200)),
      maxDecodedBodyBytes: Math.max(1024, num(env.INBOUND_MAX_DECODED_BODY_BYTES, 262144)),
      maxStageRuntimeMs: Math.max(1000, num(env.INBOUND_MAX_STAGE_RUNTIME_MS, 60000)),
      maxCycleRuntimeMs: Math.max(1000, num(env.INBOUND_MAX_CYCLE_RUNTIME_MS, 300000)),
      maxStageRetries: Math.max(0, num(env.INBOUND_MAX_STAGE_RETRIES, 3)),
      maxOwnerExceptionsPerCycle: Math.max(1, num(env.INBOUND_MAX_OWNER_EXCEPTIONS_PER_CYCLE, 25)),
      maxPaymentSignalsPerCycle: Math.max(1, Math.min(500, num(env.INBOUND_MAX_PAYMENT_SIGNALS_PER_CYCLE, 25))),
      maxSummaryBytes: Math.max(512, num(env.INBOUND_MAX_SUMMARY_BYTES, 8192)),
      leaseTtlMs: Math.max(10000, num(env.INBOUND_LEASE_TTL_MS, 120000)),
      // Default keeps the 4:1 lease-to-heartbeat ratio the repair spec calls for (30s against a
      // 120s TTL) regardless of what leaseTtlMs is overridden to, unless explicitly overridden itself.
      heartbeatIntervalMs: Math.max(1000, num(env.INBOUND_HEARTBEAT_INTERVAL_MS, Math.floor(Math.max(10000, num(env.INBOUND_LEASE_TTL_MS, 120000)) / 4)))
    }
  },
  maxBatch: num(env.MAX_BATCH_SIZE, 25),
  crawl: {
    concurrency: num(env.CRAWL_CONCURRENCY, 2),
    delayMs: num(env.CRAWL_DELAY_MS, 500),
    minDomainGapMs: num(env.CRAWL_MIN_DOMAIN_GAP_MS, 1500),
    maxPages: num(env.MAX_PAGES_PER_SITE, 5),
    timeoutMs: num(env.CRAWL_TIMEOUT_MS, 25000),
    maxAttempts: Math.max(1, Math.min(5, num(env.CRAWL_MAX_ATTEMPTS, 3))),
    minimumTextLength: Math.max(20, num(env.CRAWL_MIN_TEXT_LENGTH, 80)),
    minimumQualityScore: Math.max(0, Math.min(100, num(env.CRAWL_MIN_QUALITY_SCORE, 60)))
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
    dailyCap: Math.max(0, Math.min(100, num(env.DISCOVERY_DAILY_CAP, 100))),
    batchesPerRun: Math.max(1, Math.min(100, num(env.DISCOVERY_BATCHES_PER_RUN, 1))),
    maxCampaignsPerRun: Math.max(1, Math.min(25, num(env.DISCOVERY_MAX_CAMPAIGNS_PER_RUN, 10))),
    runEveryHours: num(env.DISCOVERY_RUN_EVERY_HOURS, 24),
    timeoutMs: num(env.DISCOVERY_TIMEOUT_MS, 30000),
    maxBboxSpan: num(env.DISCOVERY_MAX_BBOX_SPAN, 5),
    excludedDomains: (env.DISCOVERY_EXCLUDED_DOMAINS || 'uberbondd-lite-private.vercel.app,uberbondd.vercel.app').split(',').map(value => value.trim()).filter(Boolean),
    allowReservedDomains: env.NODE_ENV === 'test' && bool(env.DISCOVERY_ALLOW_RESERVED_DOMAINS, false),
    userAgent: env.DISCOVERY_USER_AGENT || 'UberBondRevenueEngine/1.4 (+public business discovery; contact via site)'
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
    redirectUri: env.GOOGLE_REDIRECT_URI || `${env.APP_BASE_URL || 'http://localhost:8080'}/oauth/google/callback`,
    allowNetwork: env.NODE_ENV !== 'test' && !bool(env.CI, false)
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
  if (!['test', 'gmail'].includes(cfg.outbound?.provider || 'test')) throw new Error('OUTBOUND_PROVIDER must be test or gmail');
  if (cfg.nodeEnv === 'test' && cfg.outbound?.provider === 'gmail') throw new Error('Tests cannot use the real Gmail provider');
  if (cfg.storeBackend === 'postgres' && !cfg.databaseUrl) throw new Error('DATABASE_URL is required when STORE_BACKEND=postgres');
  if (cfg.nodeEnv !== 'production') return true;
  if (cfg.storeBackend !== 'postgres') throw new Error('Production requires STORE_BACKEND=postgres');
  if (role === 'all') throw new Error('Production requires separate PROCESS_ROLE=web or PROCESS_ROLE=worker');
  if (!cfg.databaseUrl) throw new Error('Production requires DATABASE_URL');
  if (!cfg.adminToken || cfg.adminToken.length < 32) throw new Error('Production requires a strong ADMIN_TOKEN of at least 32 characters');
  if (!String(cfg.baseUrl).startsWith('https://')) throw new Error('Production requires an HTTPS APP_BASE_URL');
  if (cfg.outbound?.enabled && !cfg.outbound?.dryRun) {
    if (cfg.outbound?.provider !== 'gmail') throw new Error('Live outbound requires OUTBOUND_PROVIDER=gmail');
    if (cfg.outbound?.liveSendApproved !== true) throw new Error('Live outbound requires explicit OUTBOUND_LIVE_SEND_APPROVED=true');
    if (!cfg.sender?.address) throw new Error('Live outbound requires BUSINESS_ADDRESS');
    if (!Array.isArray(cfg.outbound.allowedCountries) || cfg.outbound.allowedCountries.length === 0) throw new Error('Live outbound requires OUTBOUND_ALLOWED_COUNTRIES');
    if (!cfg.google.clientId || !cfg.google.clientSecret) throw new Error('Live outbound requires Google OAuth credentials');
    if (!/^[a-f0-9]{64}$/i.test(cfg.encryptionKey || '')) throw new Error('Live outbound requires a 64-character hexadecimal TOKEN_ENCRYPTION_KEY');
    if (String(cfg.unsubscribeSecret || '').length < 32) throw new Error('Live outbound requires UNSUBSCRIBE_SECRET with at least 32 characters');
    if (cfg.outbound.businessHourStart < 0 || cfg.outbound.businessHourEnd > 24 || cfg.outbound.businessHourStart >= cfg.outbound.businessHourEnd) throw new Error('Invalid outbound business-hour window');
  }
  const gmailConfigured = Boolean(cfg.google.clientId || cfg.google.clientSecret);
  if (gmailConfigured && !/^[a-f0-9]{64}$/i.test(cfg.encryptionKey || '')) {
    throw new Error('Production Gmail integration requires a 64-character hexadecimal TOKEN_ENCRYPTION_KEY');
  }
  if (cfg.revenue?.autoEmailReports && !/^[a-f0-9]{64}$/i.test(cfg.encryptionKey || '')) {
    throw new Error('Automatic report delivery requires a 64-character hexadecimal TOKEN_ENCRYPTION_KEY');
  }
  return true;
}
