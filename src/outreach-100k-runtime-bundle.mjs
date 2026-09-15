import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const OUTREACH_100K_RUNTIME_BUNDLE_VERSION = 'uberbond.outreach-100k-runtime-bundle.v1';

const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const int = (value, fallback = null, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const n = Math.floor(parsed);
  return n >= min && n <= max ? n : fallback;
};
const uniq = values => [...new Set((values || []).filter(Boolean))];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(reasonCodes, extra = {}) {
  return Object.freeze({
    ok: false,
    status: 'OUTREACH_100K_RUNTIME_BUNDLE_REFUSED',
    version: OUTREACH_100K_RUNTIME_BUNDLE_VERSION,
    reasonCodes: uniq(reasonCodes),
    messagesSent: 0,
    providerCalls: 0,
    externalEffectsAuthorized: false,
    ...extra
  });
}

function ageHours(observedAt, nowMs) {
  const at = Date.parse(String(observedAt || ''));
  if (!Number.isFinite(at)) return Infinity;
  return (nowMs - at) / 3_600_000;
}

function fresh(row, nowMs, maxAgeHours) {
  const age = ageHours(row?.observedAt, nowMs);
  return Boolean(clean(row?.evidenceRef, 1500)) && Number.isFinite(age) && age >= -0.05 && age <= maxAgeHours;
}

function duplicateValues(rows, selector) {
  const seen = new Set();
  const dup = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = clean(selector(row), 500).toLowerCase();
    if (!key) continue;
    if (seen.has(key)) dup.add(key); else seen.add(key);
  }
  return [...dup];
}

export function compileOutreach100kRuntimeBundle({
  runtime = {},
  domains = [],
  mailboxes = [],
  egressRoutes = [],
  smtpRoutes = [],
  recipientProviders = [],
  campaign = {},
  campaignAuthorization = {},
  genome = {},
  policy = {},
  recipientSetDigest = '',
  outbound = {}
} = {}, { now = new Date(), maxEvidenceAgeHours = 24 } = {}) {
  const reasons = [];
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
  if (!Number.isFinite(nowMs)) return fail(['valid-reference-time-required']);
  const ageWindow = Number(maxEvidenceAgeHours);
  if (!Number.isFinite(ageWindow) || ageWindow <= 0) return fail(['positive-evidence-age-window-required']);

  const campaignId = clean(campaign?.id || campaignAuthorization?.campaignId, 240);
  if (!campaignId) reasons.push('campaign-id-required');
  if (campaign?.authorized !== true) reasons.push('campaign-authorization-required');
  if (!fresh(campaign, nowMs, ageWindow)) reasons.push('fresh-campaign-evidence-required');
  if (int(campaign?.dailyCeiling, null, 1) == null || int(campaign?.usedToday, null, 0) == null) reasons.push('campaign-daily-ceiling-and-usage-required');
  const campaignExpiry = Date.parse(String(campaign?.expiresAt || ''));
  if (!Number.isFinite(campaignExpiry) || campaignExpiry <= nowMs) reasons.push('campaign-authorization-expired-or-missing');
  if (campaignAuthorization?.authorized !== true || clean(campaignAuthorization?.campaignId, 240) !== campaignId || !clean(campaignAuthorization?.receiptId, 240) || !clean(campaignAuthorization?.authorizedBy, 240)) reasons.push('exact-campaign-dispatch-authorization-required');
  const dispatchExpiry = Date.parse(String(campaignAuthorization?.expiresAt || ''));
  if (!Number.isFinite(dispatchExpiry) || dispatchExpiry <= nowMs) reasons.push('campaign-dispatch-authorization-expired-or-missing');

  if (runtime?.ready !== true && runtime?.state !== 'RUNTIME_EVIDENCE_READY') reasons.push('sovereign-runtime-ready-required');
  if (!fresh(runtime, nowMs, ageWindow)) reasons.push('fresh-sovereign-runtime-evidence-required');

  const dup = {
    domains: duplicateValues(domains, row => row?.domainId || row?.domain),
    mailboxes: duplicateValues(mailboxes, row => row?.mailboxId),
    egressRoutes: duplicateValues(egressRoutes, row => row?.routeId || row?.id),
    smtpRoutes: duplicateValues(smtpRoutes, row => row?.routeId || row?.id),
    recipientProviders: duplicateValues(recipientProviders, row => row?.providerId)
  };
  if (dup.domains.length) reasons.push('duplicate-domain-evidence');
  if (dup.mailboxes.length) reasons.push('duplicate-mailbox-evidence');
  if (dup.egressRoutes.length) reasons.push('duplicate-egress-route-evidence');
  if (dup.smtpRoutes.length) reasons.push('duplicate-smtp-route-evidence');
  if (dup.recipientProviders.length) reasons.push('duplicate-recipient-provider-evidence');

  if (!Array.isArray(domains) || !domains.length) reasons.push('observed-domain-fleet-required');
  if (!Array.isArray(mailboxes) || !mailboxes.length) reasons.push('observed-mailbox-fleet-required');
  if (!Array.isArray(egressRoutes) || !egressRoutes.length) reasons.push('observed-egress-fleet-required');
  if (!Array.isArray(smtpRoutes) || !smtpRoutes.length) reasons.push('observed-smtp-route-fleet-required');
  if (!Array.isArray(recipientProviders) || !recipientProviders.length) reasons.push('observed-recipient-provider-budgets-required');

  const domainIds = new Set();
  for (const row of domains) {
    const id = clean(row?.domainId || row?.domain, 253).toLowerCase();
    if (!id) reasons.push('domain-id-required'); else domainIds.add(id);
    if (row?.ownerAuthorized !== true) reasons.push(`domain:${id || 'unknown'}:owner-authorization-required`);
    if (row?.dnsAuthenticated !== true) reasons.push(`domain:${id || 'unknown'}:dns-authentication-required`);
    if (row?.reputationHealthy !== true) reasons.push(`domain:${id || 'unknown'}:reputation-health-required`);
    if (!fresh(row, nowMs, ageWindow)) reasons.push(`domain:${id || 'unknown'}:fresh-evidence-required`);
  }

  const routeIds = new Set();
  for (const row of egressRoutes) {
    const id = clean(row?.routeId || row?.id, 240);
    if (!id) reasons.push('egress-route-id-required'); else routeIds.add(id);
    if (row?.ready !== true && String(row?.status || '').toUpperCase() !== 'READY') reasons.push(`egress:${id || 'unknown'}:ready-required`);
    if (row?.authorized !== true) reasons.push(`egress:${id || 'unknown'}:authorization-required`);
    if (row?.termsCompatible !== true) reasons.push(`egress:${id || 'unknown'}:terms-compatible-required`);
    if (int(row?.observedColdDailyCap, null, 1) == null || int(row?.usedToday, null, 0) == null) reasons.push(`egress:${id || 'unknown'}:observed-cap-and-usage-required`);
    if (!fresh(row, nowMs, ageWindow)) reasons.push(`egress:${id || 'unknown'}:fresh-evidence-required`);
  }

  const smtpIds = new Set();
  for (const row of smtpRoutes) {
    const id = clean(row?.routeId || row?.id, 240);
    if (!id) reasons.push('smtp-route-id-required'); else smtpIds.add(id);
    if (row?.authorized !== true || row?.termsCompatible !== true) reasons.push(`smtp:${id || 'unknown'}:authorized-terms-compatible-required`);
    if (row?.authenticated !== true && !clean(row?.usernameEnv, 240) && !clean(row?.username, 320)) reasons.push(`smtp:${id || 'unknown'}:authenticated-route-required`);
    if (!clean(row?.evidenceRef, 1500)) reasons.push(`smtp:${id || 'unknown'}:evidence-ref-required`);
  }

  for (const row of mailboxes) {
    const id = clean(row?.mailboxId, 240);
    const domainId = clean(row?.domainId || String(row?.address || '').split('@')[1], 253).toLowerCase();
    const routeId = clean(row?.egressRouteId || row?.routeId, 240);
    if (!id) reasons.push('mailbox-id-required');
    if (!domainId || !domainIds.has(domainId)) reasons.push(`mailbox:${id || 'unknown'}:known-domain-required`);
    if (!routeId || !routeIds.has(routeId) || !smtpIds.has(routeId)) reasons.push(`mailbox:${id || 'unknown'}:bound-egress-and-smtp-route-required`);
    if (row?.authenticated !== true && row?.authenticationStatus !== 'AUTHENTICATED') reasons.push(`mailbox:${id || 'unknown'}:authentication-required`);
    if (!['WARMUP_COMPLETE', 'RAMP', 'HOLD', 'LIMITED_CANARY'].includes(String(row?.warmupState || row?.warmupStatus || '').toUpperCase())) reasons.push(`mailbox:${id || 'unknown'}:warmup-health-required`);
    if (row?.paused === true) reasons.push(`mailbox:${id || 'unknown'}:paused`);
    if (int(row?.observedColdDailyCap ?? row?.currentDailyCap, null, 1) == null || int(row?.observedColdHourlyCap ?? row?.currentHourlyCap, null, 1) == null || int(row?.usedToday, null, 0) == null) reasons.push(`mailbox:${id || 'unknown'}:observed-cap-and-usage-required`);
    if (!fresh(row, nowMs, ageWindow)) reasons.push(`mailbox:${id || 'unknown'}:fresh-evidence-required`);
  }

  for (const row of recipientProviders) {
    const id = clean(row?.providerId, 120).toLowerCase();
    if (!id) reasons.push('recipient-provider-id-required');
    if (row?.ready !== true && String(row?.state || '').toUpperCase() !== 'READY') reasons.push(`recipient-provider:${id || 'unknown'}:ready-required`);
    if (int(row?.observedDailyBudget, null, 1) == null || int(row?.usedToday, null, 0) == null) reasons.push(`recipient-provider:${id || 'unknown'}:budget-and-usage-required`);
    if (!fresh(row, nowMs, ageWindow)) reasons.push(`recipient-provider:${id || 'unknown'}:fresh-evidence-required`);
  }

  const normalizedDigest = clean(recipientSetDigest, 200);
  if (normalizedDigest && !/^sha256:[a-f0-9]{64}$/i.test(normalizedDigest)) reasons.push('valid-recipient-set-digest-required');

  if (reasons.length) return fail(reasons, { duplicateEvidence: dup });

  const bundle = {
    version: OUTREACH_100K_RUNTIME_BUNDLE_VERSION,
    createdAt: new Date(nowMs).toISOString(),
    runtime: {
      ...runtime,
      ready: true,
      state: runtime.state || 'RUNTIME_EVIDENCE_READY'
    },
    domains,
    mailboxes,
    egressRoutes,
    smtpRoutes,
    recipientProviders,
    campaign,
    campaignAuthorization,
    genome,
    policy: {
      businessHourStart: int(policy?.businessHourStart, 9, 0, 23),
      businessHourEnd: int(policy?.businessHourEnd, 17, 1, 24),
      maxEvidenceAgeHours: Number.isFinite(Number(policy?.maxEvidenceAgeHours)) && Number(policy.maxEvidenceAgeHours) > 0 ? Number(policy.maxEvidenceAgeHours) : ageWindow
    },
    outbound: {
      enabled: outbound?.enabled === true,
      dryRun: outbound?.dryRun === true,
      globalPaused: outbound?.globalPaused === true,
      uncertain: int(outbound?.uncertain, 0, 0),
      workerOnline: outbound?.workerOnline === true,
      schedulerActive: outbound?.schedulerActive === true,
      providerConfirmedToday: int(outbound?.providerConfirmedToday, 0, 0)
    },
    recipientSetDigest: normalizedDigest || undefined
  };
  const bundleDigest = `sha256:${digest(bundle)}`;
  return Object.freeze({
    ok: true,
    status: 'OUTREACH_100K_RUNTIME_BUNDLE_COMPILED',
    version: OUTREACH_100K_RUNTIME_BUNDLE_VERSION,
    bundle: Object.freeze(bundle),
    bundleDigest,
    messagesSent: 0,
    providerCalls: 0,
    externalEffectsAuthorized: false,
    truthBoundary: 'COMPILED means fresh caller-supplied fleet evidence was normalized into the exact 100K runtime bundle shape. It does not manufacture DNS, mailbox, egress, transport, provider, campaign, legal, recipient, or send authority.'
  });
}

export async function writeOutreach100kRuntimeBundle({ outputPath, ...input } = {}, options = {}) {
  const destination = clean(outputPath, 4000);
  if (!destination) return fail(['output-path-required']);
  const compiled = compileOutreach100kRuntimeBundle(input, options);
  if (!compiled.ok) return compiled;
  const tmp = `${destination}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(compiled.bundle, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, destination);
  return Object.freeze({ ...compiled, outputPath: destination });
}
