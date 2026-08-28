// UberBond MailHub: provider-neutral control plane for domain/mailbox
// infrastructure. This composes the existing registries, DNS verifier,
// warm-up policy and deliverability gate; it does not create a second sending
// engine and it never turns a provider dashboard claim into cleared money.
//
// MailHub owns:
//   - provider capability discovery and safe reconciliation;
//   - provisioning plans with explicit financial/effect boundaries;
//   - mailbox/domain readiness summaries;
//   - deterministic sender-route ranking;
//   - provider-neutral receipts and action cards.
//
// The provider owns the physical mailbox, account, IP and reputation layer.
// UberBond never stores provider credentials in this module and never treats
// a plan as an execution authorization.
import crypto from 'node:crypto';
import { redactProviderReceipt } from './provider-receipt-redaction.mjs';

export const MAILHUB_CONTROL_PLANE_POLICY_VERSION = 'mailhub-control-plane-1.0.0';

const VALID_PLAN_STAGES = Object.freeze([
  'RECONCILE_PROVIDER', 'CONFIRM_DOMAIN_OWNERSHIP', 'PROVISION_DOMAIN',
  'PROVISION_MAILBOX', 'VERIFY_DNS', 'VERIFY_MAILBOX', 'START_WARMUP',
  'RECONCILE_WARMUP', 'DRY_RUN', 'OWNER_AUTHORIZE_LIMITED_OUTREACH'
]);

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function atDate(value) {
  const result = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(result.getTime()) ? new Date() : result;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function email(value) {
  const candidate = text(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : '';
}

function domain(value) {
  const candidate = text(value, 254).toLowerCase();
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i.test(candidate) ? candidate : '';
}

function unique(values) {
  return [...new Set(values)];
}

function failure(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: MAILHUB_CONTROL_PLANE_POLICY_VERSION,
    reasonCodes: unique(reasonCodes.filter(Boolean)),
    ...extra
  };
}

function safeProviderSummary(result) {
  if (!result || typeof result !== 'object') return null;
  return redactProviderReceipt({
    ok: result.ok,
    status: result.status,
    httpStatus: result.httpStatus,
    provider: result.provider,
    capability: result.capability,
    providerRequestId: result.providerRequestId,
    operationId: result.operationId,
    providerReference: result.providerReference,
    retryAfterSeconds: result.retryAfterSeconds,
    reason: result.reason
  });
}

function resourceCount(result, key) {
  if (Array.isArray(result?.[key])) return result[key].length;
  const data = result?.data?.data ?? result?.data;
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data?.[key])) return data[key].length;
  return 0;
}

function providerReadResult(result, key) {
  return {
    ok: Boolean(result?.ok),
    status: result?.status || 'UNKNOWN',
    count: resourceCount(result, key),
    receipt: safeProviderSummary(result)
  };
}

function scopeKey(provider, operation) {
  return `${text(provider, 80).toLowerCase()}:${text(operation, 120)}`;
}

/**
 * Reconcile provider state through read-only adapter methods. A failed read is
 * visible and never downgraded to an empty inventory. Empty and unknown are
 * separate states so a provider outage cannot look like "zero mailboxes".
 */
export async function inspectProviderInfrastructure({ providerAdapter, workspaceId = '', includeDomains = true, includeMailboxes = true } = {}) {
  const provider = text(providerAdapter?.providerName, 80).toLowerCase();
  if (!providerAdapter || !provider) return failure(['provider-adapter-required']);
  if (typeof providerAdapter.identity !== 'function') return failure(['provider-identity-capability-missing']);

  const identity = await providerAdapter.identity();
  if (!identity?.ok) return failure(['provider-identity-unavailable'], { provider, providerReceipt: safeProviderSummary(identity) });

  const requests = [];
  if (includeDomains && typeof providerAdapter.listDomains === 'function') requests.push(['domains', providerAdapter.listDomains({ workspaceId })]);
  if (includeMailboxes && typeof providerAdapter.listMailboxes === 'function') requests.push(['mailboxes', providerAdapter.listMailboxes({ workspaceId, includeCredentials: false })]);
  const settled = await Promise.all(requests.map(async ([key, promise]) => [key, await promise]));
  const reads = Object.fromEntries(settled.map(([key, result]) => [key, providerReadResult(result, key)]));
  const failedReads = Object.entries(reads).filter(([, result]) => !result.ok).map(([key, result]) => `${key}:${result.status}`);

  return {
    ok: failedReads.length === 0,
    policyVersion: MAILHUB_CONTROL_PLANE_POLICY_VERSION,
    provider,
    workspaceId: text(workspaceId, 160) || null,
    state: failedReads.length ? 'RECONCILIATION_INCOMPLETE' : 'RECONCILED',
    reasonCodes: failedReads,
    identity: redactProviderReceipt({ provider: identity.provider, status: identity.status, authentication: identity.authentication, workspaceId: identity.workspaceId }),
    reads,
    providerReceipts: settled.map(([, result]) => safeProviderSummary(result)).filter(Boolean),
    noCredentialMaterialReturned: true
  };
}

/**
 * Compile the exact infrastructure workflow before any external mutation.
 * This is intentionally a plan, not a hidden executor. Domain purchase,
 * mailbox creation, DNS writes, pre-warm purchases and export all carry
 * separate approval scopes.
 */
export function compileProvisioningPlan({
  provider,
  workspaceId = '',
  existingDomains = [],
  requestedDomains = [],
  requestedMailboxes = [],
  forwardingEmail = '',
  estimatedCostCents = null,
  budgetCents = null,
  requireWarmup = true,
  date = new Date()
} = {}) {
  const timestamp = atDate(date).toISOString();
  const providerName = text(provider, 80).toLowerCase();
  const existing = unique((Array.isArray(existingDomains) ? existingDomains : []).map(domain).filter(Boolean));
  const requested = unique((Array.isArray(requestedDomains) ? requestedDomains : []).map(domain).filter(Boolean));
  const mailboxes = unique((Array.isArray(requestedMailboxes) ? requestedMailboxes : []).map(email).filter(Boolean));
  const reasons = [];
  if (!providerName) reasons.push('provider-required');
  if (!text(workspaceId, 160)) reasons.push('workspace-id-required');
  if ((Array.isArray(requestedDomains) ? requestedDomains : []).length !== requested.length) reasons.push('requested-domain-invalid');
  if ((Array.isArray(requestedMailboxes) ? requestedMailboxes : []).length !== mailboxes.length) reasons.push('requested-mailbox-invalid');
  if (requested.some(item => existing.includes(item))) reasons.push('domain-already-present-reconcile-before-provision');
  if (forwardingEmail && !email(forwardingEmail)) reasons.push('forwarding-email-invalid');
  const estimated = Number.isFinite(Number(estimatedCostCents)) ? Math.max(0, Math.floor(Number(estimatedCostCents))) : null;
  const budget = Number.isFinite(Number(budgetCents)) ? Math.max(0, Math.floor(Number(budgetCents))) : null;
  if (estimated != null && budget != null && estimated > budget) reasons.push('estimated-cost-exceeds-budget');
  if (reasons.length) return failure(reasons, { timestamp, provider: providerName || null, workspaceId: text(workspaceId, 160) || null });

  const stages = [
    { stage: 'RECONCILE_PROVIDER', effectClass: 'ZERO_EFFECT', approvalScope: null },
    { stage: 'CONFIRM_DOMAIN_OWNERSHIP', effectClass: 'ZERO_EFFECT', approvalScope: null }
  ];
  if (requested.length) stages.push({ stage: 'PROVISION_DOMAIN', effectClass: estimated ? 'FINANCIAL_EXTERNAL_EFFECT' : 'EXTERNAL_MUTATION', approvalScope: scopeKey(providerName, 'provisionDomains') });
  if (mailboxes.length) stages.push({ stage: 'PROVISION_MAILBOX', effectClass: estimated ? 'FINANCIAL_EXTERNAL_EFFECT' : 'EXTERNAL_MUTATION', approvalScope: scopeKey(providerName, 'provisionMailboxes') });
  stages.push(
    { stage: 'VERIFY_DNS', effectClass: 'ZERO_EFFECT', approvalScope: null },
    { stage: 'VERIFY_MAILBOX', effectClass: 'ZERO_EFFECT', approvalScope: null }
  );
  if (requireWarmup) stages.push({ stage: 'START_WARMUP', effectClass: 'EXTERNAL_MUTATION', approvalScope: scopeKey(providerName, 'startWarmup') });
  stages.push(
    { stage: 'RECONCILE_WARMUP', effectClass: 'ZERO_EFFECT', approvalScope: null },
    { stage: 'DRY_RUN', effectClass: 'ZERO_EFFECT', approvalScope: null },
    { stage: 'OWNER_AUTHORIZE_LIMITED_OUTREACH', effectClass: 'SOVEREIGNTY_DECISION', approvalScope: 'owner:limited-outreach' }
  );

  const planInput = { provider: providerName, workspaceId, existing, requested, mailboxes, forwardingEmail: email(forwardingEmail) || null, estimated, budget, requireWarmup, stages };
  return {
    ok: true,
    policyVersion: MAILHUB_CONTROL_PLANE_POLICY_VERSION,
    planId: `mailhub_plan_${digest(planInput).slice(0, 24)}`,
    createdAt: timestamp,
    provider: providerName,
    workspaceId: text(workspaceId, 160),
    domains: { existing, requested },
    mailboxAddresses: mailboxes,
    forwardingEmail: email(forwardingEmail) || null,
    estimatedCostCents: estimated,
    budgetCents: budget,
    stages,
    externalEffects: unique(stages.map(stage => stage.effectClass).filter(effect => effect !== 'ZERO_EFFECT')),
    executionStatus: 'PLAN_ONLY_OWNER_APPROVAL_REQUIRED',
    rollback: 'Reconcile provider state by IDs before any repeat mutation; never blindly retry a timed-out write.'
  };
}

function candidateReasons(candidate, now) {
  const reasons = [];
  const mailbox = candidate?.mailboxState || candidate?.mailbox || {};
  const domainState = candidate?.domainState || candidate?.domain || {};
  if (!mailbox.mailboxId && !mailbox.id) reasons.push('mailbox-id-missing');
  if (mailbox.paused) reasons.push('mailbox-paused');
  if (mailbox.authenticationStatus !== 'AUTHENTICATED') reasons.push('mailbox-authentication-not-confirmed');
  if (mailbox.warmupStatus !== 'WARMUP_COMPLETE') reasons.push('warmup-not-provider-confirmed-complete');
  if (domainState.state !== 'READY_FOR_LIMITED_OUTREACH' || domainState.outreachState !== 'AUTHORIZED') reasons.push('domain-not-owner-authorized');
  if (domainState.evidenceFreshness === 'STALE' || domainState.evidenceFreshness === 'NONE') reasons.push('domain-dns-evidence-not-fresh');
  const dailyCap = Number(mailbox.currentDailyCap ?? candidate?.dailyCap);
  const sentToday = Number(candidate?.sentToday ?? 0);
  if (!Number.isFinite(dailyCap) || dailyCap <= 0) reasons.push('provider-daily-cap-unknown-or-zero');
  else if (Number.isFinite(sentToday) && sentToday >= dailyCap) reasons.push('provider-daily-cap-exhausted');
  const nextAllowedAt = Date.parse(candidate?.nextAllowedAt || '');
  if (Number.isFinite(nextAllowedAt) && nextAllowedAt > now.getTime()) reasons.push('sender-cooldown-active');
  return reasons;
}

/**
 * Rank only senders that have provider-confirmed readiness. This returns a
 * route proposal; the existing deliverability guard, durable reservation and
 * V9 consequence gate still make the final send decision.
 */
export function rankReadySenderRoutes({ candidates = [], date = new Date(), strategy = 'least-used' } = {}) {
  const at = atDate(date);
  const rows = (Array.isArray(candidates) ? candidates : []).map((candidate, index) => {
    const reasons = candidateReasons(candidate, at);
    const mailbox = candidate?.mailboxState || candidate?.mailbox || {};
    const cap = Number(mailbox.currentDailyCap ?? candidate?.dailyCap);
    const sent = Number(candidate?.sentToday ?? 0);
    return {
      candidateId: text(candidate?.candidateId || mailbox.mailboxId || mailbox.id || `candidate-${index}`, 160),
      address: email(mailbox.address || candidate?.address) || null,
      provider: text(candidate?.provider || mailbox.provider, 80).toLowerCase() || null,
      dailyCap: Number.isFinite(cap) ? cap : null,
      sentToday: Number.isFinite(sent) ? sent : null,
      availableCapacity: Number.isFinite(cap) && Number.isFinite(sent) ? Math.max(0, cap - sent) : null,
      eligible: reasons.length === 0,
      reasonCodes: reasons,
      healthScore: Number.isFinite(Number(candidate?.healthScore)) ? Number(candidate.healthScore) : null,
      stableOrder: index
    };
  });
  const eligible = rows.filter(row => row.eligible).sort((left, right) => {
    if (strategy === 'health-first') return (right.healthScore ?? -1) - (left.healthScore ?? -1) || (right.availableCapacity ?? -1) - (left.availableCapacity ?? -1) || left.stableOrder - right.stableOrder;
    return (right.availableCapacity ?? -1) - (left.availableCapacity ?? -1) || (right.healthScore ?? -1) - (left.healthScore ?? -1) || left.stableOrder - right.stableOrder;
  });
  return {
    ok: true,
    policyVersion: MAILHUB_CONTROL_PLANE_POLICY_VERSION,
    state: eligible.length ? 'ROUTE_AVAILABLE' : 'NO_READY_ROUTE',
    selected: eligible[0] || null,
    eligible,
    blocked: rows.filter(row => !row.eligible),
    routeIsNotSendAuthorization: true
  };
}

export function buildMailHubSnapshot({ providerInspections = [], domainStates = [], mailboxStates = [], date = new Date() } = {}) {
  const at = atDate(date);
  const domains = Array.isArray(domainStates) ? domainStates.filter(Boolean) : [];
  const mailboxes = Array.isArray(mailboxStates) ? mailboxStates.filter(Boolean) : [];
  const countBy = (items, key) => Object.fromEntries([...new Set(items.map(item => text(item?.[key], 80) || 'UNKNOWN'))].map(value => [value, items.filter(item => (text(item?.[key], 80) || 'UNKNOWN') === value).length]));
  const providerReads = Array.isArray(providerInspections) ? providerInspections : [];
  const providerFailures = providerReads.filter(item => item?.ok === false || item?.state === 'RECONCILIATION_INCOMPLETE').length;
  const providerConfirmedCapacity = mailboxes.reduce((sum, mailbox) => {
    const cap = Number(mailbox.currentDailyCap);
    return Number.isFinite(cap) && cap >= 0 ? sum + cap : sum;
  }, 0);
  return {
    ok: true,
    policyVersion: MAILHUB_CONTROL_PLANE_POLICY_VERSION,
    observedAt: at.toISOString(),
    state: providerFailures ? 'PARTIAL_PROVIDER_EVIDENCE' : 'OBSERVED',
    domains: { total: domains.length, byState: countBy(domains, 'state'), readyForLimitedOutreach: domains.filter(item => item.state === 'READY_FOR_LIMITED_OUTREACH').length },
    mailboxes: { total: mailboxes.length, byAuthentication: countBy(mailboxes, 'authenticationStatus'), byWarmup: countBy(mailboxes, 'warmupStatus'), paused: mailboxes.filter(item => item.paused).length, providerConfirmedDailyCapacity: providerConfirmedCapacity },
    providers: { inspected: providerReads.length, failedOrIncomplete: providerFailures },
    commercialTruth: { verifiedCustomers: 0, clearedRevenue: 'not-derived-from-mailbox-state', acceptedDeliveries: 0 },
    noSyntheticCapacity: true
  };
}

export function buildMailHubCapabilityMatrix({ adapters = [] } = {}) {
  const rows = (Array.isArray(adapters) ? adapters : []).map(adapter => ({
    provider: text(adapter?.providerName, 80).toLowerCase() || 'unknown',
    configured: Boolean(adapter?.configured),
    capabilities: Object.fromEntries(['listWorkspaces', 'listDomains', 'listMailboxes', 'domainDns', 'provisionDomains', 'provisionMailboxes', 'configureDns', 'warmupStatus', 'exportMailboxes'].map(capability => [capability, typeof adapter?.[capability] === 'function'])),
    liveSendingAuthority: false
  }));
  return { ok: true, policyVersion: MAILHUB_CONTROL_PLANE_POLICY_VERSION, providers: rows, noProviderClaimedAsFreeCapacity: true };
}
