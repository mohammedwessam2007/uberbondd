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
  agentRelay: {
    enabled: bool(env.AGENT_RELAY_ENABLED, false),
    token: env.UBERBOND_AGENT_RELAY_TOKEN || '',
    maxTaskBytes: num(env.AGENT_RELAY_MAX_TASK_BYTES, 200000),
    // Bounds a leaked token or a runaway/misbehaving poller. Generous enough for
    // normal poll/claim/heartbeat traffic from one or two legitimate callers.
    rateLimitPerMinute: num(env.AGENT_RELAY_RATE_LIMIT_PER_MINUTE, 120)
  },
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
    maxEvidenceAgeDays: num(env.OUTBOUND_MAX_EVIDENCE_AGE_DAYS, 45),
    hardBouncePauseThreshold: num(env.OUTBOUND_HARD_BOUNCE_PAUSE_THRESHOLD, 2),
    complaintPauseThreshold: num(env.OUTBOUND_COMPLAINT_PAUSE_THRESHOLD, 1),
    failurePauseThreshold: num(env.OUTBOUND_FAILURE_PAUSE_THRESHOLD, 3),
    processBatchSize: num(env.OUTBOUND_PROCESS_BATCH_SIZE, 10),
    reservationRecoveryTimeoutMs: num(env.OUTBOUND_RESERVATION_RECOVERY_TIMEOUT_MS, 30 * 60 * 1000),
    reservationRecoverySweepLimit: num(env.OUTBOUND_RESERVATION_RECOVERY_SWEEP_LIMIT, 200),
    // Off by default: activates the OMNIA V9 consequence boundary
    // (src/consequence-boundary.mjs) as the final gate in Pipeline.maybeSend,
    // composed with (not replacing) the Deliverability Guard. See
    // docs/PROMETHEUS_CANONICAL_INTEGRATION_PLAN.md. With no real policy
    // content injected via Pipeline hooks.v9Context, turning this on simply
    // makes every send fail closed at V9 -- it is not a shortcut to enabling
    // live sends.
    v9AdmissionRequired: bool(env.OUTBOUND_V9_ADMISSION_REQUIRED, false),
    // Recovered from the historical Instantly-parity/lead-intelligence
    // archive (see docs/INSTANTLY_RECONCILIATION.md). None of these are
    // consulted by src/pipeline.mjs yet -- src/omnia-v9/integrations/
    // outbound-consequence-gate.mjs and the Gmail effect adapter are
    // recovered as available capability, not wired into the live send path
    // this wave. Present so that future wiring work (and the recovered
    // omnia-v9-integration-pipeline test, still deliberately deferred) has
    // real config to read rather than needing yet another follow-up change.
    launchPhase: String(env.OUTBOUND_LAUNCH_PHASE || 'off').trim().toLowerCase(),
    provider: String(env.OUTBOUND_PROVIDER || 'gmail-api').trim().toLowerCase(),
    useEffectAdapter: bool(env.OUTBOUND_USE_EFFECT_ADAPTER, false),
    messageIdDomain: String(env.OUTBOUND_MESSAGE_ID_DOMAIN || '').trim().toLowerCase(),
    approvalSecret: env.OUTREACH_APPROVAL_SECRET || '',
    webhookSecret: env.OUTREACH_WEBHOOK_SECRET || '',
    webhookMaxAgeSeconds: Math.max(60, Math.min(900, num(env.OUTREACH_WEBHOOK_MAX_AGE_SECONDS, 300))),
    approverId: String(env.OUTREACH_APPROVER_ID || '').trim(),
    canaryDailyCap: Math.max(1, Math.min(5, num(env.OUTBOUND_CANARY_DAILY_CAP, 3))),
    canaryHourlyCap: 1,
    canaryMinGapSeconds: Math.max(900, num(env.OUTBOUND_CANARY_MIN_GAP_SECONDS, 1800)),
    routeEvidenceMaxAgeDays: Math.max(1, Math.min(30, num(env.OUTBOUND_ROUTE_EVIDENCE_MAX_AGE_DAYS, 7))),
    recipientCooldownDays: Math.max(30, num(env.OUTBOUND_RECIPIENT_COOLDOWN_DAYS, 365)),
    domainCooldownDays: Math.max(7, num(env.OUTBOUND_DOMAIN_COOLDOWN_DAYS, 90))
  },
  // Recovered alongside the outreach/lead-intelligence layer (see
  // docs/INSTANTLY_RECONCILIATION.md). Off by default; no route exists yet
  // on this branch's server.mjs to receive a capture, so this is config
  // surface only until that route is built.
  leadCapture: {
    enabled: bool(env.LEAD_CAPTURE_ENABLED, false),
    siteKey: String(env.LEAD_CAPTURE_SITE_KEY || '').trim(),
    rateLimitPerHour: Math.max(1, num(env.LEAD_CAPTURE_RATE_LIMIT_PER_HOUR, 30))
  },
  maxBatch: num(env.MAX_BATCH_SIZE, 25),
  prometheus: {
    // Off by default, and layered on top of autopilot (both must be true).
    // Only gates the read-only recomputation jobs registered in
    // src/scheduler.mjs -- never an external-action worker. See
    // docs/PROMETHEUS_ARCHITECTURE.md.
    schedulingEnabled: bool(env.PROMETHEUS_SCHEDULING_ENABLED, false)
  },
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
  // Domain/mailbox readiness OS (see docs/UBERBOND_DOMAIN_MAILBOX_READINESS.md).
  // Every threshold here is a policy default, not a claim that any provider
  // is connected -- `providers.*.configured` is the only thing that decides
  // whether a real adapter can ever be used instead of the unconfigured
  // fixture adapter.
  domainMailbox: {
    minWarmupDays: num(env.WARMUP_MIN_DAYS, 14),
    recommendedWarmupDaysLow: num(env.WARMUP_RECOMMENDED_DAYS_LOW, 21),
    recommendedWarmupDaysHigh: num(env.WARMUP_RECOMMENDED_DAYS_HIGH, 28),
    maxDnsEvidenceAgeHours: num(env.DNS_EVIDENCE_MAX_AGE_HOURS, 24),
    bounceRatePauseThreshold: num(env.DOMAIN_BOUNCE_RATE_PAUSE_THRESHOLD, 0.05),
    complaintRatePauseThreshold: num(env.DOMAIN_COMPLAINT_RATE_PAUSE_THRESHOLD, 0.001),
    schedulingEnabled: bool(env.DOMAIN_MAILBOX_SCHEDULING_ENABLED, false)
  },
  // Provider credentials are read only from the environment, never stored,
  // never logged, and never returned from any function in this codebase --
  // see src/provider-adapter-contract.mjs. `configured` is a boolean derived
  // from presence, not a claim the credential is valid; only a real,
  // successful provider response can prove that.
  providers: {
    instantly: {
      apiKey: env.INSTANTLY_API_KEY || '',
      configured: Boolean(env.INSTANTLY_API_KEY)
    },
    googleWorkspace: {
      clientId: env.GOOGLE_WORKSPACE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_WORKSPACE_CLIENT_SECRET || '',
      configured: Boolean(env.GOOGLE_WORKSPACE_CLIENT_ID && env.GOOGLE_WORKSPACE_CLIENT_SECRET)
    },
    microsoft365: {
      clientId: env.MICROSOFT_365_CLIENT_ID || '',
      clientSecret: env.MICROSOFT_365_CLIENT_SECRET || '',
      tenantId: env.MICROSOFT_365_TENANT_ID || '',
      configured: Boolean(env.MICROSOFT_365_CLIENT_ID && env.MICROSOFT_365_CLIENT_SECRET && env.MICROSOFT_365_TENANT_ID)
    },
    // Infrastructure adapters are server-side only. A configured API key
    // enables read/reconciliation calls; purchases, DNS writes, mailbox
    // creation, pre-warm purchases, exports and deletes still require an
    // explicit scoped owner approval at the adapter boundary.
    icemail: {
      apiKey: env.ICEMAIL_API_KEY || '',
      baseUrl: env.ICEMAIL_BASE_URL || 'https://app.icemail.ai/api/v1',
      workspaceId: env.ICEMAIL_WORKSPACE_ID || '',
      configured: Boolean(env.ICEMAIL_API_KEY)
    },
    mailforge: {
      apiKey: env.MAILFORGE_API_KEY || '',
      baseUrl: env.MAILFORGE_BASE_URL || 'https://api.mailforge.ai/public',
      workspaceId: env.MAILFORGE_WORKSPACE_ID || '',
      configured: Boolean(env.MAILFORGE_API_KEY)
    }
  },
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
    // Optional: only set this if you know your actual blended cost per founder
    // minute. Left at 0 (unconfigured) by default so the offer compiler never
    // fabricates a delivery cost or gross margin from an unvalidated guess.
    founderHourlyRateCents: num(env.FOUNDER_HOURLY_RATE_CENTS, 0),
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
  // ALLOW_TEST_PAYMENT_UNLOCK arms POST /api/test/unlock, which marks a lead paid
  // and writes a revenue event with no provider behind it. It is admin-gated, so
  // this was never remotely reachable -- but there is no version of production
  // where fabricating a payment is the right thing to have switched on, and an
  // environment variable set once for a staging run is exactly how it would
  // arrive there.
  if (cfg.revenue?.allowTestUnlock) throw new Error('Production must not set ALLOW_TEST_PAYMENT_UNLOCK');
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
  const gmailConfigured = Boolean(cfg.google.clientId || cfg.google.clientSecret);
  if (gmailConfigured && !/^[a-f0-9]{64}$/i.test(cfg.encryptionKey || '')) {
    throw new Error('Production Gmail integration requires a 64-character hexadecimal TOKEN_ENCRYPTION_KEY');
  }
  return true;
}
