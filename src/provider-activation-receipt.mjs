// Provider activation receipt: the typed, secret-free record an external
// account-activation step (a human, an operator script, a browser session)
// hands back so the free-first router can derive LIVE provider states from it
// without a code change per provider.
//
// A receipt carries STATES, never VALUES. `credentialRuntimeState:
// 'CONFIGURED_SECURELY'` says a credential exists somewhere outside this
// repository; the credential itself is refused at the door, by key shape and
// by value shape, before anything in the receipt is echoed back.
//
// A receipt is evidence that an activation step was observed at a point in
// time. It is not send permission, not consent, not deliverability, and it
// decays: past maxReceiptAgeDays it yields no live flags at all. A receipt can
// make routing stricter (a prohibition, an auto-charge risk, a lower observed
// quota) and never looser than the researched registry.
import { containsSecretValue, SECRET_KEY_PATTERN } from './secret-patterns.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PROVIDER_ACTIVATION_RECEIPT_SCHEMA_VERSION = 'uberbond-provider-activation-receipt-1.0.0';

export const ACCOUNT_STATES = Object.freeze([
  'NOT_STARTED', 'CREATED', 'EXISTING', 'BLOCKED_HUMAN', 'REJECTED', 'SKIPPED_LOW_ECONOMIC_FIT'
]);
export const COLD_B2B_RULES = Object.freeze(['ALLOWED', 'CONSENT_REQUIRED', 'PROHIBITED', 'UNKNOWN']);
export const DOMAIN_VERIFICATION_STATES = Object.freeze(['NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED', 'UNKNOWN']);
export const CREDENTIAL_RUNTIME_STATES = Object.freeze(['NOT_CONFIGURED', 'CONFIGURED_SECURELY', 'BLOCKED_HUMAN']);
export const HEALTH_STATES = Object.freeze(['HEALTHY', 'DEGRADED', 'UNKNOWN']);
export const RECEIPT_STATES = Object.freeze(['FRESH', 'STALE', 'MISSING', 'INVALID']);
export const ACTIVE_ACCOUNT_STATES = Object.freeze(['CREATED', 'EXISTING']);

// Strictness order for the cold-B2B rule. A receipt may only move a provider
// up this ladder; moving down requires editing the registry artifact with
// evidence.
const COLD_RULE_STRICTNESS = Object.freeze({ ALLOWED: 0, CONSENT_REQUIRED: 1, UNKNOWN: 2, PROHIBITED: 3 });

// The one key whose name looks like a credential and is not one: it holds an
// enum-validated STATE. Exempt from the key-shape scan at the top level only;
// its value still goes through the value-shape scan and the enum check.
const STATE_KEYS_EXEMPT_FROM_KEY_SCAN = new Set(['credentialRuntimeState']);

const QUOTA_FIELDS = Object.freeze(['daily', 'monthly', 'recipientCap']);
const DAY_MS = 86_400_000;

function clone(value) { return structuredClone(value); }
function ledger() { return clone(ZERO_EXTERNAL_EFFECTS); }
function text(value, max = 300) {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  return out && out.length <= max ? out : null;
}
function toDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const raw = text(value, 80);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}
function ageDays(from, now) {
  return Math.floor((now.getTime() - from.getTime()) / DAY_MS);
}
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    schemaVersion: PROVIDER_ACTIVATION_RECEIPT_SCHEMA_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: ledger(),
    ...extra
  };
}

export function stricterColdRule(a, b) {
  const left = COLD_B2B_RULES.includes(a) ? a : 'UNKNOWN';
  const right = COLD_B2B_RULES.includes(b) ? b : 'UNKNOWN';
  return COLD_RULE_STRICTNESS[left] >= COLD_RULE_STRICTNESS[right] ? left : right;
}

// Walks every key and every string at bounded depth. Reports paths only --
// never the offending value -- so the rejection itself cannot leak.
export function scanReceiptForSecrets(value, path = 'receipt', depth = 0, hits = []) {
  if (depth > 6) {
    hits.push(`receipt-depth-exceeded:${path}`);
    return hits;
  }
  if (typeof value === 'string') {
    if (containsSecretValue(value)) hits.push(`secret-value-rejected:${path}`);
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanReceiptForSecrets(item, `${path}[${index}]`, depth + 1, hits));
    return hits;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const at = `${path}.${key}`;
      const exempt = depth === 0 && STATE_KEYS_EXEMPT_FROM_KEY_SCAN.has(key);
      if (!exempt && SECRET_KEY_PATTERN.test(key)) hits.push(`secret-shaped-key-rejected:${at}`);
      scanReceiptForSecrets(child, at, depth + 1, hits);
    }
  }
  return hits;
}

function enumField(raw, values, code, reasons) {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) {
    reasons.push(`${code}-required`);
    return null;
  }
  const value = String(raw).trim().toUpperCase();
  if (!values.includes(value)) {
    reasons.push(`${code}-invalid`);
    return null;
  }
  return value;
}

function booleanField(raw, code, reasons) {
  if (typeof raw !== 'boolean') {
    reasons.push(`${code}-boolean-required`);
    return false;
  }
  return raw;
}

function quotaField(raw, field, reasons) {
  if (raw == null) return null;
  if (!Number.isSafeInteger(raw) || raw < 0) {
    reasons.push(`free-quota-observed-invalid:${field}`);
    return null;
  }
  return raw;
}

function httpsUrl(raw) {
  const value = text(raw, 500);
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function validateProviderActivationReceipt(input, { now = new Date(), registryProvider = null } = {}) {
  const nowDate = toDate(now);
  if (!nowDate) return fail(['valid-validation-time-required']);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(['receipt-object-required']);

  // Secrets are refused before any field is normalized or echoed. The result
  // of a secret rejection carries no receipt at all.
  const secretHits = scanReceiptForSecrets(input);
  if (secretHits.length) return fail(secretHits);

  const reasons = [];
  const flags = [];

  if (input.schemaVersion != null && input.schemaVersion !== PROVIDER_ACTIVATION_RECEIPT_SCHEMA_VERSION) {
    reasons.push('receipt-schema-version-unsupported');
  }

  const providerId = text(input.providerId, 100)?.toLowerCase() || null;
  if (!providerId) reasons.push('provider-id-required');
  const registryId = registryProvider ? (text(registryProvider.id, 100)?.toLowerCase() || null) : null;
  if (providerId && registryId && providerId !== registryId) reasons.push('receipt-provider-mismatch');

  const accountState = enumField(input.accountState, ACCOUNT_STATES, 'account-state', reasons);
  const coldB2BRule = enumField(input.coldB2BRule, COLD_B2B_RULES, 'cold-b2b-rule', reasons);
  const domainVerificationState = enumField(input.domainVerificationState, DOMAIN_VERIFICATION_STATES, 'domain-verification-state', reasons);
  const credentialRuntimeState = enumField(input.credentialRuntimeState, CREDENTIAL_RUNTIME_STATES, 'credential-runtime-state', reasons);

  const freePlanVerified = booleanField(input.freePlanVerified, 'free-plan-verified', reasons);
  const apiAvailable = booleanField(input.apiAvailable, 'api-available', reasons);
  const smtpAvailable = booleanField(input.smtpAvailable, 'smtp-available', reasons);
  const autoChargeRisk = booleanField(input.autoChargeRisk, 'auto-charge-risk', reasons);

  const policyObservedAt = toDate(input.policyObservedAt);
  if (!policyObservedAt) reasons.push('policy-observed-at-required');
  else if (policyObservedAt.getTime() > nowDate.getTime()) reasons.push('policy-observed-at-in-future');

  let observedAt = null;
  if (input.observedAt != null) {
    observedAt = toDate(input.observedAt);
    if (!observedAt) reasons.push('observed-at-invalid');
    else if (observedAt.getTime() > nowDate.getTime()) reasons.push('observed-at-in-future');
  }

  const policyEvidenceUrl = httpsUrl(input.policyEvidenceUrl);
  if (!policyEvidenceUrl) {
    reasons.push(text(input.policyEvidenceUrl, 500) ? 'policy-evidence-url-https-required' : 'policy-evidence-url-required');
  }

  let trialExpiresAt = null;
  if (input.trialExpiresAt != null) {
    trialExpiresAt = toDate(input.trialExpiresAt);
    if (!trialExpiresAt) reasons.push('trial-expires-at-invalid');
  }
  if (registryProvider?.freePlan?.trial === true && !trialExpiresAt) reasons.push('trial-expiry-required');

  const rawQuota = input.freeQuotaObserved == null ? {} : input.freeQuotaObserved;
  const freeQuotaObserved = { daily: null, monthly: null, recipientCap: null };
  if (!rawQuota || typeof rawQuota !== 'object' || Array.isArray(rawQuota)) {
    reasons.push('free-quota-observed-object-required');
  } else {
    for (const field of QUOTA_FIELDS) freeQuotaObserved[field] = quotaField(rawQuota[field], field, reasons);
  }
  const observedQuotaPresent = QUOTA_FIELDS.some(field => freeQuotaObserved[field] != null);
  if (accountState && ACTIVE_ACCOUNT_STATES.includes(accountState) && freePlanVerified && !observedQuotaPresent) {
    flags.push('observed-quota-missing');
  }

  let blocker = null;
  if (input.blocker != null) {
    blocker = text(input.blocker, 500);
    if (!blocker) reasons.push('blocker-text-invalid');
  }
  if ((accountState === 'BLOCKED_HUMAN' || credentialRuntimeState === 'BLOCKED_HUMAN') && !blocker) flags.push('blocker-text-missing');

  let healthObservation = null;
  if (input.healthObservation != null) {
    const raw = input.healthObservation;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      reasons.push('health-observation-object-required');
    } else {
      const state = enumField(raw.state, HEALTH_STATES, 'health-observation-state', reasons);
      const at = toDate(raw.observedAt);
      if (!at) reasons.push('health-observation-observed-at-required');
      else if (at.getTime() > nowDate.getTime()) reasons.push('health-observation-observed-at-in-future');
      if (state && at) healthObservation = { state, observedAt: at.toISOString() };
    }
  }

  let evidenceRefs = [];
  if (input.evidenceRefs != null) {
    if (!Array.isArray(input.evidenceRefs)) reasons.push('evidence-refs-array-required');
    else evidenceRefs = input.evidenceRefs.map(ref => text(ref, 500)).filter(Boolean);
  }
  let notes = null;
  if (input.notes != null) {
    notes = text(input.notes, 1000);
    if (!notes) reasons.push('notes-text-invalid');
  }

  if (reasons.length) return fail(reasons, { providerId, flags });

  const receipt = {
    schemaVersion: PROVIDER_ACTIVATION_RECEIPT_SCHEMA_VERSION,
    providerId,
    accountState,
    freePlanVerified,
    freeQuotaObserved,
    coldB2BRule,
    apiAvailable,
    smtpAvailable,
    domainVerificationState,
    credentialRuntimeState,
    trialExpiresAt: trialExpiresAt ? trialExpiresAt.toISOString() : null,
    autoChargeRisk,
    policyObservedAt: policyObservedAt.toISOString(),
    policyEvidenceUrl,
    blocker,
    observedAt: observedAt ? observedAt.toISOString() : null,
    healthObservation,
    evidenceRefs,
    notes
  };
  return {
    ok: true,
    schemaVersion: PROVIDER_ACTIVATION_RECEIPT_SCHEMA_VERSION,
    receipt,
    reasonCodes: [],
    flags,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: ledger()
  };
}

function registryColdRule(registryProvider) {
  const raw = String(registryProvider?.purposeRules?.COLD_B2B ?? 'UNKNOWN').trim().toUpperCase();
  return COLD_B2B_RULES.includes(raw) ? raw : 'UNKNOWN';
}

// Every flag defaults to false. A state is only ever made true by an explicit
// argument, so every exceptional exit (missing, invalid, stale, expired) is
// the all-false state plus a reason.
function providerState({
  receiptState,
  reasonCodes = [],
  configured = false,
  active = false,
  domainAuthenticated = false,
  providerHealthy = false,
  autoChargeRisk = false,
  observedQuota = null,
  coldB2BRule = 'UNKNOWN'
}) {
  return { configured, active, domainAuthenticated, providerHealthy, autoChargeRisk, observedQuota, coldB2BRule, receiptState, reasonCodes };
}

function deriveOneProviderState({ registryProvider, rawReceipts, now, maxReceiptAgeDays }) {
  const registryRule = registryColdRule(registryProvider);
  if (rawReceipts.length === 0) {
    return providerState({ receiptState: 'MISSING', reasonCodes: ['provider-activation-receipt-missing'], coldB2BRule: registryRule });
  }
  if (rawReceipts.length > 1) {
    return providerState({
      receiptState: 'INVALID',
      reasonCodes: ['provider-activation-receipt-invalid', 'duplicate-activation-receipts-for-provider'],
      autoChargeRisk: rawReceipts.some(raw => raw?.autoChargeRisk === true),
      coldB2BRule: registryRule
    });
  }
  const raw = rawReceipts[0];
  const validated = validateProviderActivationReceipt(raw, { now, registryProvider });
  if (!validated.ok) {
    return providerState({
      receiptState: 'INVALID',
      reasonCodes: ['provider-activation-receipt-invalid', ...validated.reasonCodes],
      autoChargeRisk: raw?.autoChargeRisk === true,
      coldB2BRule: registryRule
    });
  }
  const receipt = validated.receipt;
  const effectiveRule = stricterColdRule(registryRule, receipt.coldB2BRule);
  const observedAges = [ageDays(new Date(receipt.policyObservedAt), now)];
  if (receipt.observedAt) observedAges.push(ageDays(new Date(receipt.observedAt), now));
  const receiptAgeDays = Math.max(...observedAges);
  if (receiptAgeDays > maxReceiptAgeDays) {
    return providerState({ receiptState: 'STALE', reasonCodes: ['provider-activation-receipt-stale'], autoChargeRisk: receipt.autoChargeRisk, coldB2BRule: effectiveRule });
  }
  if (receipt.trialExpiresAt && now.getTime() >= new Date(receipt.trialExpiresAt).getTime()) {
    return providerState({ receiptState: 'FRESH', reasonCodes: ['free-trial-expired'], autoChargeRisk: receipt.autoChargeRisk, coldB2BRule: effectiveRule });
  }
  const reasonCodes = [...validated.flags];
  const healthAge = receipt.healthObservation ? ageDays(new Date(receipt.healthObservation.observedAt), now) : null;
  const providerHealthy = receipt.healthObservation?.state === 'HEALTHY' && healthAge != null && healthAge >= 0 && healthAge <= maxReceiptAgeDays;
  if (!providerHealthy) reasonCodes.push(receipt.healthObservation ? 'provider-health-observation-not-healthy-or-stale' : 'provider-health-observation-missing');
  const observedQuotaPresent = QUOTA_FIELDS.some(field => receipt.freeQuotaObserved[field] != null);
  return providerState({
    receiptState: 'FRESH',
    reasonCodes,
    configured: receipt.credentialRuntimeState === 'CONFIGURED_SECURELY',
    active: ACTIVE_ACCOUNT_STATES.includes(receipt.accountState) && receipt.freePlanVerified === true,
    domainAuthenticated: receipt.domainVerificationState === 'VERIFIED',
    providerHealthy,
    autoChargeRisk: receipt.autoChargeRisk === true,
    observedQuota: observedQuotaPresent ? { ...receipt.freeQuotaObserved } : null,
    coldB2BRule: effectiveRule
  });
}

export function isLiveReadyProviderState(state) {
  return Boolean(state)
    && state.configured === true
    && state.active === true
    && state.domainAuthenticated === true
    && state.providerHealthy === true
    && state.autoChargeRisk !== true
    && state.receiptState === 'FRESH';
}

export function deriveProviderStatesFromReceipts({ receipts = [], registryProviders = [], now = new Date(), maxReceiptAgeDays = 45 } = {}) {
  const nowDate = toDate(now);
  if (!nowDate) return fail(['valid-validation-time-required']);
  if (!Number.isSafeInteger(maxReceiptAgeDays) || maxReceiptAgeDays < 1 || maxReceiptAgeDays > 365) return fail(['valid-receipt-age-window-required']);
  if (!Array.isArray(receipts)) return fail(['activation-receipts-array-required']);
  if (!Array.isArray(registryProviders)) return fail(['registry-providers-array-required']);

  const byProvider = new Map();
  const unregistered = [];
  for (const raw of receipts) {
    const id = raw && typeof raw === 'object' ? (text(raw.providerId, 100)?.toLowerCase() || null) : null;
    const key = id ?? '__missing_provider_id__';
    if (!byProvider.has(key)) byProvider.set(key, []);
    byProvider.get(key).push(raw);
  }

  const providerStates = {};
  const registryIds = new Set();
  for (const registryProvider of registryProviders) {
    const id = text(registryProvider?.id, 100)?.toLowerCase() || null;
    if (!id) continue;
    registryIds.add(id);
    providerStates[id] = deriveOneProviderState({
      registryProvider,
      rawReceipts: byProvider.get(id) || [],
      now: nowDate,
      maxReceiptAgeDays
    });
  }
  for (const [id, rows] of byProvider) {
    if (registryIds.has(id)) continue;
    unregistered.push(id);
    providerStates[id] = providerState({
      receiptState: 'INVALID',
      reasonCodes: ['provider-activation-receipt-invalid', 'receipt-provider-not-in-registry'],
      autoChargeRisk: rows.some(raw => raw?.autoChargeRisk === true)
    });
  }

  const states = Object.values(providerStates);
  const count = state => states.filter(row => row.receiptState === state).length;
  const summary = {
    providerCount: registryIds.size,
    receiptCount: receipts.length,
    fresh: count('FRESH'),
    stale: count('STALE'),
    missing: count('MISSING'),
    invalid: count('INVALID'),
    liveReadyProviderIds: Object.entries(providerStates).filter(([, state]) => isLiveReadyProviderState(state)).map(([id]) => id).sort(),
    autoChargeRiskProviderIds: Object.entries(providerStates).filter(([, state]) => state.autoChargeRisk).map(([id]) => id).sort(),
    unregisteredReceiptProviderIds: unregistered.sort()
  };
  return {
    ok: true,
    schemaVersion: PROVIDER_ACTIVATION_RECEIPT_SCHEMA_VERSION,
    status: summary.liveReadyProviderIds.length ? 'PROVIDER_STATES_DERIVED__LIVE_READY_PRESENT' : 'PROVIDER_STATES_DERIVED__NO_LIVE_READY_PROVIDER',
    now: nowDate.toISOString(),
    maxReceiptAgeDays,
    providerStates,
    summary,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: ledger()
  };
}

export function summarizeActivationReceipts(receipts = [], { now = new Date() } = {}) {
  const rows = Array.isArray(receipts) ? receipts : [];
  const byAccountState = Object.fromEntries([...ACCOUNT_STATES, 'INVALID'].map(state => [state, 0]));
  const byCredentialRuntimeState = Object.fromEntries([...CREDENTIAL_RUNTIME_STATES, 'INVALID'].map(state => [state, 0]));
  const humanBlockers = [];
  let validReceiptCount = 0;
  let invalidReceiptCount = 0;
  let secretRejectedReceiptCount = 0;
  for (const raw of rows) {
    const validated = validateProviderActivationReceipt(raw, { now });
    if (validated.ok) validReceiptCount += 1;
    else invalidReceiptCount += 1;
    // A receipt carrying a secret is counted and otherwise ignored: nothing
    // from it -- not even its provider id -- reaches the summary.
    if (!validated.ok && validated.reasonCodes.some(code => code.startsWith('secret-'))) {
      secretRejectedReceiptCount += 1;
      byAccountState.INVALID += 1;
      byCredentialRuntimeState.INVALID += 1;
      continue;
    }
    const accountState = String(raw?.accountState ?? '').trim().toUpperCase();
    const credentialRuntimeState = String(raw?.credentialRuntimeState ?? '').trim().toUpperCase();
    byAccountState[ACCOUNT_STATES.includes(accountState) ? accountState : 'INVALID'] += 1;
    byCredentialRuntimeState[CREDENTIAL_RUNTIME_STATES.includes(credentialRuntimeState) ? credentialRuntimeState : 'INVALID'] += 1;
    if (accountState === 'BLOCKED_HUMAN' || credentialRuntimeState === 'BLOCKED_HUMAN') {
      humanBlockers.push({
        providerId: text(raw?.providerId, 100)?.toLowerCase() || null,
        accountState: ACCOUNT_STATES.includes(accountState) ? accountState : 'INVALID',
        credentialRuntimeState: CREDENTIAL_RUNTIME_STATES.includes(credentialRuntimeState) ? credentialRuntimeState : 'INVALID',
        blocker: text(raw?.blocker, 500)
      });
    }
  }
  humanBlockers.sort((a, b) => String(a.providerId).localeCompare(String(b.providerId)));
  return {
    schemaVersion: PROVIDER_ACTIVATION_RECEIPT_SCHEMA_VERSION,
    receiptCount: rows.length,
    validReceiptCount,
    invalidReceiptCount,
    secretRejectedReceiptCount,
    byAccountState,
    byCredentialRuntimeState,
    humanBlockers,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: ledger()
  };
}
