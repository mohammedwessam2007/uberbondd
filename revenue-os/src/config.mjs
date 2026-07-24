// Revenue OS configuration. Every capability that could touch a real system defaults OFF and
// nothing in this package ever wires any of these flags to a real effect -- there is no real
// sending, billing, or deploy provider anywhere in revenue-os/, real or gated, so these flags are
// structurally inert regardless of value (see docs/REUSE_VS_REPLACE_DECISION.md).
import { assertValidServiceCatalog } from './service-registry.mjs';

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

// 24/7 Continuous Revenue Core, section 3: every entry now carries the mission's required
// non-blank text/array fields (publicName, scope, customerDefinition, disclaimers, checklistItems,
// evidenceRequirements, approvals, deliverables), validated at module load below via
// assertValidServiceCatalog -- a service definition missing any of these, or containing only
// whitespace in one, fails the moment this module is imported, not the first time a caller reads
// the blank field. No entry here hard-codes a specific city, region, or prior candidate; scope
// text is generic across whatever business the offer is ultimately used for.
const MARKET_VALIDATION_DISCLAIMER = 'Price is a launch offer set internally; it is not independently market-validated.';

export const SERVICE_CATALOG = Object.freeze({
  FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC: Object.freeze({
    key: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', version: 1, priceCents: 25000,
    siteCount: 3, deliveryHoursMin: 12, deliveryHoursMax: 24, includesImplementation: false,
    implementationCreditCents: 25000, outcomeGuarantee: false,
    publicName: 'Founding Revenue Leak Diagnostic',
    scope: 'A public, evidence-backed lead-path and conversion-surface review of the agreed site(s), delivered as a prioritized defect report within the stated delivery window after verified payment and accepted scope.',
    customerDefinition: 'A business or agency that owns or operates every site in scope and can accept the scope and receive delivery through a published business channel.',
    disclaimers: [MARKET_VALIDATION_DISCLAIMER, 'No traffic, lead, conversion, or revenue outcome is guaranteed.', 'Findings are evidence-backed observations only, not a security or legal audit.'],
    checklistItems: ['Confirm the exact site URL(s) to be checked.', 'Confirm the primary lead paths to prioritize (phone/form/booking/contact).', 'Confirm branding for the delivered report.', 'Confirm a delivery contact and preferred format.'],
    evidenceRequirements: ['Public-page observation only; no login, form submission, or access-control bypass.', 'Capture timestamp, final URL, HTTP status, and a screenshot/HTML hash for every checked page.'],
    approvals: ['Owner scope acceptance before diagnostic work begins.', 'Owner delivery sign-off before the report is sent.'],
    deliverables: ['HTML report', 'Print/PDF-ready report', 'Prioritized defect list with severity and recommendation per item']
  }),
  AGENCY_CLIENT_RESCUE_PILOT: Object.freeze({
    key: 'AGENCY_CLIENT_RESCUE_PILOT', version: 1, priceCents: 75000,
    siteCount: 3, deliveryHoursMin: 24, deliveryHoursMax: 48, includesImplementation: false,
    implementationCreditCents: 25000, outcomeGuarantee: false,
    publicName: 'Agency Client Rescue Pilot',
    scope: 'For an agency with an at-risk client relationship: an evidence-backed audit of up to three of that client\'s sites, plus a prioritized stabilization plan, delivered within the stated delivery window after verified payment and accepted scope.',
    customerDefinition: 'A marketing or web agency acting on behalf of its own client, with the client\'s authority to share the site URL(s) in scope and to receive the audit on the client\'s behalf.',
    disclaimers: [MARKET_VALIDATION_DISCLAIMER, 'No claim is made about saving, retaining, or repairing the client relationship.', 'No implementation work is included in this scope.'],
    checklistItems: ['Confirm agency authority to commission this audit on the client\'s behalf.', 'Confirm the exact site URL(s) in scope (up to 3).', 'Confirm the primary concern driving the rescue request.', 'Confirm a delivery contact and preferred format.'],
    evidenceRequirements: ['Public-page observation only; no login, form submission, or access-control bypass.', 'Capture timestamp, final URL, HTTP status, and a screenshot/HTML hash for every checked page.'],
    approvals: ['Owner scope acceptance before audit work begins.', 'Owner delivery sign-off before the stabilization plan is sent.'],
    deliverables: ['HTML report', 'Print/PDF-ready report', 'Prioritized stabilization plan across all sites in scope']
  }),
  AGENCY_IMPLEMENTATION_PACKAGE: Object.freeze({
    key: 'AGENCY_IMPLEMENTATION_PACKAGE', version: 1, priceCents: 100000,
    requiresBackupQaRollback: true,
    publicName: 'Approved Implementation Package',
    scope: 'Scoped, reversible fixes for the defects named in an already-delivered diagnostic or rescue pilot report, limited to the fixes the customer explicitly authorized.',
    customerDefinition: 'A customer who has already received a diagnostic or rescue pilot report and has authorized specific fixes from it in writing.',
    disclaimers: [MARKET_VALIDATION_DISCLAIMER, 'No outcome beyond the specific authorized fixes is guaranteed.', 'Work is gated on a verified backup, a safe-edit or staging path, and a rollback plan existing before any change is made.'],
    checklistItems: ['Confirm the exact authorized fix list, one to one against the source report.', 'Confirm a backup exists before any change.', 'Confirm a staging or safe-edit path.', 'Confirm a rollback plan.'],
    evidenceRequirements: ['Before/after evidence for every fix applied.', 'QA pass recorded before delivery.'],
    approvals: ['Written scope authorization naming the exact fixes.', 'Owner sign-off before any live change is made.'],
    deliverables: ['Before/after evidence package', 'Change log', 'QA result']
  }),
  AGENCY_MONITORING: Object.freeze({
    key: 'AGENCY_MONITORING', version: 1, priceCentsMin: 19900, priceCentsMax: 49900,
    activeByDefault: false, requiresExplicitConsent: true, cancellable: true,
    publicName: 'Ongoing Site Monitoring',
    scope: 'Recurring, configurable-frequency re-checks of the same checks run in the original diagnostic, with an alert to the owner when a check result changes.',
    customerDefinition: 'A customer who has completed a diagnostic or implementation and has explicitly opted in to ongoing monitoring for the same site(s).',
    disclaimers: [MARKET_VALIDATION_DISCLAIMER, 'This is an unvalidated, configurable offer -- price, frequency, and scope are not fixed and are not claimed to reflect proven market demand.', 'No hidden recurring charge; inactive until explicit consent is recorded.'],
    checklistItems: ['Confirm the site(s) to monitor.', 'Confirm check frequency.', 'Confirm the false-positive and owner-time thresholds that govern continuation.', 'Confirm cancellation terms.'],
    evidenceRequirements: ['Every monitoring run captures the same evidence standard as the original diagnostic.'],
    approvals: ['Explicit, recorded owner consent before activation.', 'Explicit consent before any price or scope change.'],
    deliverables: ['Recurring check-result digest', 'Change/regression alert when a prior pass becomes a fail']
  }),
  AGENCY_RESEARCH_EVIDENCE_PACK: Object.freeze({
    key: 'AGENCY_RESEARCH_EVIDENCE_PACK', version: 1, priceCents: 35000,
    verifiedAccountCount: 10, includesOutreach: false,
    publicName: 'Verified Research Evidence Pack',
    scope: 'A pack of independently verified, evidence-backed prospect research records for the customer\'s own outreach use -- research only, no outreach performed on the customer\'s behalf.',
    customerDefinition: 'A business or agency that intends to perform its own outreach using verified research it did not have to gather itself.',
    disclaimers: [MARKET_VALIDATION_DISCLAIMER, 'No outreach is performed by this offer -- research only.', 'No claim is made about the reply or conversion rate the customer will get from this research.'],
    checklistItems: ['Confirm the target market/category for research.', 'Confirm the required record count.', 'Confirm delivery format.'],
    evidenceRequirements: ['Every record cites a public source URL and a capture timestamp.', 'Every contact channel is a published, role-based channel -- never a guessed or scraped personal address.'],
    approvals: ['Owner scope acceptance before research begins.'],
    deliverables: ['Verified record pack with full source lineage']
  })
});

assertValidServiceCatalog(SERVICE_CATALOG);

export function getService(key) { return SERVICE_CATALOG[key] || null; }
