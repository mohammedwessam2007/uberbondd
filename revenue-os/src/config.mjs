// Revenue OS configuration. Every capability that could touch a real system defaults OFF and
// nothing in this package ever wires any of these flags to a real effect -- there is no real
// sending, billing, or deploy provider anywhere in revenue-os/, real or gated, so these flags are
// structurally inert regardless of value (see docs/REUSE_VS_REPLACE_DECISION.md).
function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}
function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadRevenueOsConfig(env = process.env) {
  return {
    storeBackend: String(env.REVENUE_OS_STORE_BACKEND || 'json').toLowerCase(),
    liveSending: bool(env.REVENUE_OS_LIVE_SENDING, false),
    liveBilling: bool(env.REVENUE_OS_LIVE_BILLING, false),
    liveDeploy: bool(env.REVENUE_OS_LIVE_DEPLOY, false),
    outboundMode: String(env.REVENUE_OS_OUTBOUND_MODE || 'dry-run').toLowerCase(), // dry-run|export-only|draft-only|manual-copy|fake-replay
    dailySendCap: num(env.REVENUE_OS_DAILY_SEND_CAP, 25),
    rollingSendCapWindowDays: num(env.REVENUE_OS_ROLLING_CAP_WINDOW_DAYS, 7),
    rollingSendCap: num(env.REVENUE_OS_ROLLING_SEND_CAP, 100),
    approvalReviewTargetSeconds: num(env.REVENUE_OS_APPROVAL_REVIEW_TARGET_SECONDS, 60),
    queue: {
      concurrency: num(env.REVENUE_OS_QUEUE_CONCURRENCY, 2),
      maxAttempts: num(env.REVENUE_OS_QUEUE_MAX_ATTEMPTS, 5),
      lockTimeoutMs: num(env.REVENUE_OS_QUEUE_LOCK_TIMEOUT_MS, 300000),
      retryBaseMs: num(env.REVENUE_OS_QUEUE_RETRY_BASE_MS, 30000),
      retryMaxMs: num(env.REVENUE_OS_QUEUE_RETRY_MAX_MS, 3600000),
      jobHeartbeatMs: num(env.REVENUE_OS_QUEUE_JOB_HEARTBEAT_MS, 15000),
      maxRuntimeMs: num(env.REVENUE_OS_QUEUE_MAX_RUNTIME_MS, 900000),
      workerHeartbeatMs: num(env.REVENUE_OS_QUEUE_WORKER_HEARTBEAT_MS, 15000),
      pollMs: num(env.REVENUE_OS_QUEUE_POLL_MS, 1000)
    },
    ai: {
      provider: String(env.REVENUE_OS_AI_PROVIDER || 'fake').toLowerCase(),
      maxCostCentsPerCall: num(env.REVENUE_OS_AI_MAX_COST_CENTS, 5),
      timeoutMs: num(env.REVENUE_OS_AI_TIMEOUT_MS, 10000)
    },
    marginFloorRate: num(env.REVENUE_OS_MARGIN_FLOOR_RATE, 0.3),
    monitoringFalsePositiveThreshold: num(env.REVENUE_OS_MONITORING_FP_THRESHOLD, 0.05),
    monitoringOwnerMinutesThreshold: num(env.REVENUE_OS_MONITORING_OWNER_MINUTES_THRESHOLD, 120)
  };
}

export const SERVICE_CATALOG = Object.freeze({
  FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC: Object.freeze({
    key: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', version: 1, priceCents: 25000,
    siteCount: 3, deliveryHoursMin: 12, deliveryHoursMax: 24, includesImplementation: false,
    implementationCreditCents: 25000, outcomeGuarantee: false
  }),
  AGENCY_IMPLEMENTATION_PACKAGE: Object.freeze({
    key: 'AGENCY_IMPLEMENTATION_PACKAGE', version: 1, priceCents: 100000,
    requiresBackupQaRollback: true
  }),
  AGENCY_MONITORING: Object.freeze({
    key: 'AGENCY_MONITORING', version: 1, priceCentsMin: 19900, priceCentsMax: 49900,
    activeByDefault: false, requiresExplicitConsent: true, cancellable: true
  }),
  AGENCY_RESEARCH_EVIDENCE_PACK: Object.freeze({
    key: 'AGENCY_RESEARCH_EVIDENCE_PACK', version: 1, priceCents: 35000,
    verifiedAccountCount: 10, includesOutreach: false
  })
});

export function getService(key) { return SERVICE_CATALOG[key] || null; }
