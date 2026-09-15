import crypto from 'node:crypto';

export const OUTREACH_100K_TARGET = 100_000;
export const OUTREACH_100K_CERTIFICATE_VERSION = 'uberbond.outreach-100k-certificate.v1';

const sha256 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const positiveInt = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : null;
const uniq = values => [...new Set((values || []).filter(Boolean))];

function ageHours(value, now) {
  const observed = Date.parse(String(value || ''));
  const current = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return Infinity;
  return (current - observed) / 3_600_000;
}

function freshEvidence(row, { now, maxAgeHours, prefix }) {
  const reasons = [];
  const observedAt = row?.observedAt;
  const age = ageHours(observedAt, now);
  if (!clean(row?.evidenceRef, 1500)) reasons.push(`${prefix}-evidence-ref-required`);
  if (!Number.isFinite(age) || age < -0.05 || age > maxAgeHours) reasons.push(`${prefix}-evidence-stale-or-undated`);
  return { reasons, ageHours: Number.isFinite(age) ? Number(age.toFixed(3)) : null };
}

function remaining(cap, used) {
  const total = positiveInt(cap);
  const consumed = positiveInt(used);
  if (total == null || consumed == null || consumed > total) return null;
  return Math.max(0, total - consumed);
}

function compileDomains(domains, options) {
  const rows = [];
  const ready = new Map();
  for (const raw of Array.isArray(domains) ? domains : []) {
    const domainId = clean(raw?.domainId || raw?.domain, 253).toLowerCase();
    const evidence = freshEvidence(raw, { ...options, prefix: `domain:${domainId || 'unknown'}` });
    const reasons = [...evidence.reasons];
    if (!domainId) reasons.push('domain-id-required');
    if (raw?.ownerAuthorized !== true) reasons.push('domain-owner-authorization-required');
    if (raw?.dnsAuthenticated !== true) reasons.push('domain-dns-authentication-required');
    if (raw?.reputationHealthy !== true) reasons.push('domain-reputation-health-required');
    const row = { domainId: domainId || null, ready: reasons.length === 0, reasonCodes: uniq(reasons), evidenceAgeHours: evidence.ageHours };
    rows.push(row);
    if (row.ready) ready.set(domainId, row);
  }
  return { rows, ready };
}

function compileMailboxes(mailboxes, domainReady, options) {
  const rows = [];
  for (const raw of Array.isArray(mailboxes) ? mailboxes : []) {
    const mailboxId = clean(raw?.mailboxId, 240);
    const domainId = clean(raw?.domainId || String(raw?.address || '').split('@')[1], 253).toLowerCase();
    const routeId = clean(raw?.egressRouteId || raw?.routeId, 240);
    const evidence = freshEvidence(raw, { ...options, prefix: `mailbox:${mailboxId || 'unknown'}` });
    const reasons = [...evidence.reasons];
    const capRemaining = remaining(raw?.observedColdDailyCap ?? raw?.currentDailyCap, raw?.usedToday ?? 0);
    if (!mailboxId) reasons.push('mailbox-id-required');
    if (!domainId || !domainReady.has(domainId)) reasons.push('mailbox-ready-domain-required');
    if (!routeId) reasons.push('mailbox-egress-route-required');
    if (raw?.authenticated !== true && raw?.authenticationStatus !== 'AUTHENTICATED') reasons.push('mailbox-authentication-required');
    if (!['WARMUP_COMPLETE','RAMP','HOLD','LIMITED_CANARY'].includes(String(raw?.warmupState || raw?.warmupStatus || '').toUpperCase())) reasons.push('mailbox-warmup-health-required');
    if (raw?.paused === true) reasons.push('mailbox-paused');
    if (capRemaining == null) reasons.push('mailbox-observed-cap-and-usage-required');
    rows.push({ mailboxId: mailboxId || null, domainId: domainId || null, routeId: routeId || null, remainingDailyCap: reasons.length ? 0 : capRemaining, ready: reasons.length === 0, reasonCodes: uniq(reasons), evidenceAgeHours: evidence.ageHours });
  }
  return rows;
}

function compileEgress(routes, mailboxRows, options) {
  const mailboxByRoute = new Map();
  for (const box of mailboxRows.filter(row => row.ready)) mailboxByRoute.set(box.routeId, (mailboxByRoute.get(box.routeId) || 0) + box.remainingDailyCap);
  const rows = [];
  for (const raw of Array.isArray(routes) ? routes : []) {
    const routeId = clean(raw?.routeId || raw?.id, 240);
    const evidence = freshEvidence(raw, { ...options, prefix: `egress:${routeId || 'unknown'}` });
    const reasons = [...evidence.reasons];
    const routeRemaining = remaining(raw?.observedColdDailyCap, raw?.usedToday ?? 0);
    if (!routeId) reasons.push('egress-route-id-required');
    if (raw?.ready !== true && String(raw?.status || '').toUpperCase() !== 'READY') reasons.push('egress-route-not-ready');
    if (raw?.authorized !== true) reasons.push('egress-route-not-authorized');
    if (raw?.termsCompatible !== true) reasons.push('egress-route-terms-not-compatible');
    if (routeRemaining == null) reasons.push('egress-observed-cap-and-usage-required');
    const mailboxRemaining = mailboxByRoute.get(routeId) || 0;
    const usable = reasons.length ? 0 : Math.min(routeRemaining, mailboxRemaining);
    rows.push({ routeId: routeId || null, ready: reasons.length === 0, routeRemainingDailyCap: reasons.length ? 0 : routeRemaining, mailboxRemainingDailyCap: mailboxRemaining, usableRemainingDailyCap: usable, reasonCodes: uniq(reasons), evidenceAgeHours: evidence.ageHours });
  }
  return { rows, totalUsableRemainingDailyCap: rows.reduce((sum, row) => sum + row.usableRemainingDailyCap, 0) };
}

function compileRecipientProviders(rows, inventoryCounts, options) {
  const evaluations = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    const providerId = clean(raw?.providerId, 120).toLowerCase();
    const evidence = freshEvidence(raw, { ...options, prefix: `recipient-provider:${providerId || 'unknown'}` });
    const reasons = [...evidence.reasons];
    const budgetRemaining = remaining(raw?.observedDailyBudget, raw?.usedToday ?? 0);
    const inventory = positiveInt(inventoryCounts?.[providerId]) ?? 0;
    if (!providerId) reasons.push('recipient-provider-id-required');
    if (raw?.ready !== true && String(raw?.state || '').toUpperCase() !== 'READY') reasons.push('recipient-provider-not-ready');
    if (budgetRemaining == null) reasons.push('recipient-provider-budget-and-usage-required');
    const usable = reasons.length ? 0 : Math.min(budgetRemaining, inventory);
    evaluations.push({ providerId: providerId || null, inventory, budgetRemaining: reasons.length ? 0 : budgetRemaining, usableRemainingDailyCap: usable, ready: reasons.length === 0, reasonCodes: uniq(reasons), evidenceAgeHours: evidence.ageHours });
  }
  return { evaluations, totalUsableRemainingDailyCap: evaluations.reduce((sum, row) => sum + row.usableRemainingDailyCap, 0) };
}

export function compileOutreach100kLaunchCertificate({
  target = OUTREACH_100K_TARGET,
  inventory = {},
  domains = [],
  mailboxes = [],
  egressRoutes = [],
  recipientProviders = [],
  campaign = {},
  runtime = {},
  outbound = {},
  now = new Date(),
  maxEvidenceAgeHours = 24
} = {}) {
  const hardStopReasonCodes = [];
  const waitReasonCodes = [];
  const requestedTarget = positiveInt(target);
  if (requestedTarget !== OUTREACH_100K_TARGET) hardStopReasonCodes.push('exact-100k-target-required');
  if (!Number.isFinite(Number(maxEvidenceAgeHours)) || Number(maxEvidenceAgeHours) <= 0) hardStopReasonCodes.push('positive-evidence-age-window-required');
  const options = { now, maxAgeHours: Math.max(0.001, Number(maxEvidenceAgeHours) || 24) };

  if (outbound?.enabled !== true) waitReasonCodes.push('live-outbound-enabled-required');
  if (outbound?.dryRun === true) waitReasonCodes.push('dry-run-must-be-disabled');
  if (outbound?.globalPaused === true) waitReasonCodes.push('global-outbound-must-be-resumed');
  if (positiveInt(outbound?.uncertain ?? 0) !== 0) hardStopReasonCodes.push('uncertain-provider-outcomes-must-be-zero');
  if (outbound?.workerOnline !== true) waitReasonCodes.push('resident-outbound-worker-required');
  if (outbound?.schedulerActive !== true) waitReasonCodes.push('resident-outbound-scheduler-required');

  const runtimeEvidence = freshEvidence(runtime, { ...options, prefix: 'sovereign-runtime' });
  waitReasonCodes.push(...runtimeEvidence.reasons);
  if (runtime?.ready !== true && runtime?.state !== 'RUNTIME_EVIDENCE_READY') waitReasonCodes.push('sovereign-runtime-ready-required');

  const inventoryEvidence = freshEvidence(inventory, { ...options, prefix: 'eligible-inventory' });
  waitReasonCodes.push(...inventoryEvidence.reasons);
  const eligibleRemaining = positiveInt(inventory?.eligibleVerifiedUnsuppressedRemaining);
  if (eligibleRemaining == null) waitReasonCodes.push('eligible-verified-unsuppressed-inventory-required');
  if (!clean(inventory?.recipientSetDigest, 200)) waitReasonCodes.push('recipient-set-digest-required');
  const providerCounts = inventory?.recipientProviderCounts && typeof inventory.recipientProviderCounts === 'object' ? inventory.recipientProviderCounts : null;
  if (!providerCounts) waitReasonCodes.push('recipient-provider-distribution-required');

  const domain = compileDomains(domains, options);
  if (!domain.rows.length) waitReasonCodes.push('observed-domain-fleet-required');
  waitReasonCodes.push(...domain.rows.flatMap(row => row.reasonCodes));

  const mailboxRows = compileMailboxes(mailboxes, domain.ready, options);
  if (!mailboxRows.length) waitReasonCodes.push('observed-mailbox-fleet-required');
  waitReasonCodes.push(...mailboxRows.flatMap(row => row.reasonCodes));

  const egress = compileEgress(egressRoutes, mailboxRows, options);
  if (!egress.rows.length) waitReasonCodes.push('observed-egress-fleet-required');
  waitReasonCodes.push(...egress.rows.flatMap(row => row.reasonCodes));

  const provider = compileRecipientProviders(recipientProviders, providerCounts || {}, options);
  if (!provider.evaluations.length) waitReasonCodes.push('observed-recipient-provider-budgets-required');
  waitReasonCodes.push(...provider.evaluations.flatMap(row => row.reasonCodes));
  const providerInventoryTotal = providerCounts ? Object.values(providerCounts).reduce((sum, value) => sum + (positiveInt(value) || 0), 0) : 0;
  if (eligibleRemaining != null && providerCounts && providerInventoryTotal !== eligibleRemaining) waitReasonCodes.push('recipient-provider-distribution-must-cover-exact-eligible-inventory');

  const campaignEvidence = freshEvidence(campaign, { ...options, prefix: 'campaign' });
  waitReasonCodes.push(...campaignEvidence.reasons);
  if (campaign?.authorized !== true) waitReasonCodes.push('campaign-authorization-required');
  const campaignRemaining = remaining(campaign?.dailyCeiling, campaign?.usedToday ?? 0);
  if (campaignRemaining == null) waitReasonCodes.push('campaign-daily-ceiling-and-usage-required');
  if (campaign?.expiresAt && (!Number.isFinite(Date.parse(campaign.expiresAt)) || Date.parse(campaign.expiresAt) <= new Date(now).getTime())) hardStopReasonCodes.push('campaign-authorization-expired');

  const providerConfirmedToday = positiveInt(outbound?.providerConfirmedToday ?? 0) ?? 0;
  const targetRemaining = Math.max(0, OUTREACH_100K_TARGET - providerConfirmedToday);
  const capacities = {
    eligibleInventoryRemaining: eligibleRemaining ?? 0,
    senderAndEgressRemaining: egress.totalUsableRemainingDailyCap,
    recipientProviderRemaining: provider.totalUsableRemainingDailyCap,
    campaignRemaining: campaignRemaining ?? 0
  };
  const certifiableRemaining = Math.min(...Object.values(capacities));
  const certifiableToday = providerConfirmedToday + certifiableRemaining;
  const shortfall = Math.max(0, OUTREACH_100K_TARGET - certifiableToday);

  const hardStops = uniq(hardStopReasonCodes);
  const waits = uniq(waitReasonCodes);
  if (!hardStops.length && !waits.length && certifiableToday < OUTREACH_100K_TARGET) waits.push('100k-observed-capacity-shortfall');

  const state = hardStops.length
    ? 'ABSTAIN'
    : waits.length
      ? 'WAIT_EXTERNAL_EVIDENCE'
      : 'CERTIFIED_100K_READY';

  const seed = {
    version: OUTREACH_100K_CERTIFICATE_VERSION,
    state,
    target: OUTREACH_100K_TARGET,
    observedAt: new Date(now).toISOString(),
    providerConfirmedToday,
    targetRemaining,
    capacities,
    certifiableToday,
    shortfall,
    hardStops,
    waits,
    runtimeRef: clean(runtime?.evidenceRef, 1500) || null,
    inventoryRef: clean(inventory?.evidenceRef, 1500) || null,
    recipientSetDigest: clean(inventory?.recipientSetDigest, 200) || null,
    campaignRef: clean(campaign?.evidenceRef, 1500) || null
  };

  return {
    ...seed,
    certificateId: `ub100k_${sha256(seed)}`,
    oneButton100kPressAvailable: state === 'CERTIFIED_100K_READY',
    hardStopReasonCodes: hardStops,
    waitReasonCodes: waits,
    domainFleet: domain.rows,
    mailboxFleet: mailboxRows,
    egressFleet: egress.rows,
    recipientProviderFleet: provider.evaluations,
    guarantees: {
      exactTarget: OUTREACH_100K_TARGET,
      uniqueEligibleInventoryAtLeastTarget: state === 'CERTIFIED_100K_READY',
      observedRemainingCapacityAtLeastTarget: state === 'CERTIFIED_100K_READY',
      uncertainProviderOutcomeCount: positiveInt(outbound?.uncertain ?? 0) ?? null
    },
    automaticSendAuthority: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'CERTIFIED_100K_READY proves only that fresh supplied evidence shows enough remaining eligible inventory and governed infrastructure capacity to target 100,000 provider-confirmed sends today. It cannot guarantee future provider uptime, inbox placement, human replies, meetings, revenue, or recipient behavior. Those require later provider/outcome receipts.'
  };
}

export function compileOutreach100kCompletion({ dispatchReceipts = [], target = OUTREACH_100K_TARGET, date, now = new Date() } = {}) {
  const requestedTarget = positiveInt(target);
  const day = clean(date, 10) || new Date(now).toISOString().slice(0, 10);
  const valid = [];
  const uncertain = [];
  const seenDispatch = new Set();
  const seenProviderReceipt = new Set();
  for (const row of Array.isArray(dispatchReceipts) ? dispatchReceipts : []) {
    if (String(row?.state || '') === 'DISPATCH_OUTCOME_UNCERTAIN') uncertain.push(row);
    if (String(row?.state || '') !== 'PROVIDER_CONFIRMED_SEND' || Number(row?.messagesSent) !== 1) continue;
    if (!String(row?.observedAt || row?.sentAt || '').startsWith(day)) continue;
    const dispatchId = clean(row?.dispatchId, 300);
    const providerReceiptId = clean(row?.providerReceiptId, 500);
    if (!dispatchId || !providerReceiptId || seenDispatch.has(dispatchId) || seenProviderReceipt.has(providerReceiptId)) continue;
    seenDispatch.add(dispatchId);
    seenProviderReceipt.add(providerReceiptId);
    valid.push(row);
  }
  const confirmed = valid.length;
  const complete = requestedTarget === OUTREACH_100K_TARGET && confirmed >= OUTREACH_100K_TARGET;
  return {
    version: OUTREACH_100K_CERTIFICATE_VERSION,
    state: complete ? '100K_PROVIDER_CONFIRMED_COMPLETE' : '100K_PROVIDER_CONFIRMED_INCOMPLETE',
    date: day,
    target: OUTREACH_100K_TARGET,
    providerConfirmedUniqueSends: confirmed,
    remaining: Math.max(0, OUTREACH_100K_TARGET - confirmed),
    uncertainOutcomeCount: uncertain.length,
    completionProven: complete,
    truthBoundary: 'Completion counts only unique provider-confirmed send receipts for the target day. Queued, attempted, timed-out, uncertain, duplicated, inbox-placement, reply, and revenue claims do not count as provider-confirmed sends.'
  };
}
