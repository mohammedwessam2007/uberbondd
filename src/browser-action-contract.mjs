import crypto from 'node:crypto';

export const BROWSER_ACTION_POLICY_VERSION = 'browser-action-contract-1.0.0';

export const BROWSER_ACTION_STEP_TYPES = Object.freeze([
  'NAVIGATE',
  'READ_TEXT',
  'READ_ATTRIBUTE',
  'SCREENSHOT',
  'CLICK',
  'TYPE_REFERENCE',
  'SUBMIT'
]);

export const BROWSER_ACTION_PROVIDER_CAPABILITIES = Object.freeze([
  'identity',
  'authenticationMethod',
  'termsAndAllowedPurposes',
  'dryRunSupported',
  'liveSupported',
  'inspect',
  'executeReadOnly',
  'executeMutation',
  'reconcileMutation',
  'receipts',
  'cancel'
]);

const MUTATING_STEPS = new Set(['CLICK', 'TYPE_REFERENCE', 'SUBMIT']);
const FORBIDDEN_BROWSER_PURPOSES = new Set([
  'PURCHASE',
  'PAYMENT',
  'KYC',
  'DNS_CHANGE',
  'CREDENTIAL_CHANGE',
  'LEGAL_ACCEPTANCE',
  'ACCOUNT_CREATION'
]);
const SENSITIVE_KEYS = /(?:password|passwd|secret|token|authorization|cookie|credential|api[_-]?key|raw(?:value|body|payload)|card(?:number)?|cvv|cvc)/i;
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function clone(value) {
  return structuredClone(value);
}

function text(value, max = 240) {
  const result = String(value ?? '').trim();
  if (!result || result.length > max) return null;
  return result;
}

function slug(value, max = 120) {
  const source = text(value, max);
  if (!source) return null;
  const result = source.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return result || null;
}

function iso(value) {
  const source = text(value, 80);
  if (!source) return null;
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: BROWSER_ACTION_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS),
    ...extra
  };
}

function normalizeHost(value) {
  const host = String(value ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

function normalizeUrl(value) {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (!normalizeHost(url.hostname)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function containsSensitiveKey(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(String(key))) found.push(String(key));
    if (child && typeof child === 'object') found.push(...containsSensitiveKey(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 20);
}

function normalizeStep(step, index, permittedHosts) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    return { ok: false, reasonCodes: [`step-${index}-object-required`] };
  }
  const type = String(step.type ?? '').trim().toUpperCase();
  const reasonCodes = [];
  if (!BROWSER_ACTION_STEP_TYPES.includes(type)) reasonCodes.push(`step-${index}-invalid-type`);

  const sensitiveKeys = containsSensitiveKey(step);
  if (sensitiveKeys.length) reasonCodes.push(`step-${index}-raw-sensitive-field-prohibited`);

  const selector = step.selector == null ? null : text(step.selector, 500);
  if (step.selector != null && !selector) reasonCodes.push(`step-${index}-selector-too-long-or-empty`);

  let url = null;
  if (type === 'NAVIGATE') {
    url = normalizeUrl(step.url);
    if (!url) reasonCodes.push(`step-${index}-valid-https-url-required`);
    else if (!permittedHosts.has(url.hostname.toLowerCase())) reasonCodes.push(`step-${index}-host-not-permitted`);
  } else if (step.url != null) {
    reasonCodes.push(`step-${index}-url-only-allowed-for-navigate`);
  }

  const valueRef = step.valueRef == null ? null : text(step.valueRef, 240);
  if (type === 'TYPE_REFERENCE' && !valueRef) reasonCodes.push(`step-${index}-value-ref-required`);
  if (type !== 'TYPE_REFERENCE' && step.valueRef != null) reasonCodes.push(`step-${index}-value-ref-not-allowed`);

  const attribute = step.attribute == null ? null : text(step.attribute, 100);
  if (type === 'READ_ATTRIBUTE' && !attribute) reasonCodes.push(`step-${index}-attribute-required`);
  if (type !== 'READ_ATTRIBUTE' && step.attribute != null) reasonCodes.push(`step-${index}-attribute-not-allowed`);

  const purpose = String(step.purpose ?? '').trim().toUpperCase();
  if (MUTATING_STEPS.has(type) && !purpose) reasonCodes.push(`step-${index}-purpose-required-for-mutation`);
  if (purpose && FORBIDDEN_BROWSER_PURPOSES.has(purpose)) reasonCodes.push(`step-${index}-purpose-requires-specialized-gate`);

  if (reasonCodes.length) return { ok: false, reasonCodes, sensitiveKeys };
  return {
    ok: true,
    step: {
      index,
      type,
      selector,
      url: url?.toString() ?? null,
      valueRef,
      attribute,
      purpose: purpose || null,
      mutation: MUTATING_STEPS.has(type)
    }
  };
}

export function compileBrowserActionPlan({
  goalRef,
  occurrenceKey,
  targetUrl,
  permittedHosts = [],
  termsPolicyRef,
  steps = [],
  authorityReceiptRef = null,
  idempotencyKey = null
} = {}) {
  const reasonCodes = [];
  const goal = text(goalRef, 240);
  const occurrence = text(occurrenceKey, 300);
  const rootUrl = normalizeUrl(targetUrl);
  const terms = text(termsPolicyRef, 240);
  const authority = authorityReceiptRef == null ? null : text(authorityReceiptRef, 240);
  const idempotency = idempotencyKey == null ? null : text(idempotencyKey, 300);

  if (!goal) reasonCodes.push('goal-ref-required-or-too-long');
  if (!occurrence) reasonCodes.push('occurrence-key-required-or-too-long');
  if (!rootUrl) reasonCodes.push('valid-https-target-url-required');
  if (!terms) reasonCodes.push('terms-policy-ref-required');
  if (!Array.isArray(steps) || steps.length === 0) reasonCodes.push('steps-required');
  if (Array.isArray(steps) && steps.length > 40) reasonCodes.push('too-many-browser-steps');

  const hostSet = new Set();
  if (rootUrl) hostSet.add(rootUrl.hostname.toLowerCase());
  if (!Array.isArray(permittedHosts)) reasonCodes.push('permitted-hosts-array-required');
  else {
    for (const hostValue of permittedHosts) {
      const host = normalizeHost(hostValue);
      if (!host) reasonCodes.push('invalid-permitted-host');
      else hostSet.add(host);
    }
  }

  const normalizedSteps = [];
  if (Array.isArray(steps)) {
    steps.forEach((step, index) => {
      const normalized = normalizeStep(step, index, hostSet);
      if (!normalized.ok) reasonCodes.push(...normalized.reasonCodes);
      else normalizedSteps.push(normalized.step);
    });
  }

  const hasMutation = normalizedSteps.some(step => step.mutation);
  if (hasMutation && !authority) reasonCodes.push('authority-receipt-ref-required-for-browser-mutation');
  if (hasMutation && !idempotency) reasonCodes.push('idempotency-key-required-for-browser-mutation');
  if (!hasMutation && authorityReceiptRef != null && !authority) reasonCodes.push('authority-receipt-ref-too-long-or-empty');
  if (!hasMutation && idempotencyKey != null && !idempotency) reasonCodes.push('idempotency-key-too-long-or-empty');

  const sensitiveKeys = containsSensitiveKey({ goalRef, occurrenceKey, targetUrl, permittedHosts, termsPolicyRef, steps, authorityReceiptRef, idempotencyKey });
  // The public API names `authorityReceiptRef` rather than `authorization...` on purpose,
  // so canonical credential-key scanners do not mistake a receipt reference for a secret.
  const userSensitiveKeys = sensitiveKeys.filter(key => key !== 'authorityReceiptRef');
  if (userSensitiveKeys.length) reasonCodes.push('raw-sensitive-field-prohibited');

  const plan = {
    schemaVersion: 'browser-action-plan-1.0.0',
    goalRef: goal,
    occurrenceKey: occurrence,
    targetUrl: rootUrl?.toString() ?? null,
    permittedHosts: [...hostSet].sort(),
    termsPolicyRef: terms,
    effectClass: hasMutation ? 'EXTERNAL_MUTATION' : 'READ_ONLY',
    authorityReceiptRef: authority,
    idempotencyKey: idempotency,
    steps: normalizedSteps,
    durablePayloadClass: 'REFERENCE_ONLY_NO_CREDENTIALS_NO_RAW_VALUES'
  };
  plan.planId = goal && occurrence && rootUrl
    ? `browser_plan_${digest(plan).slice(0, 32)}`
    : null;

  if (reasonCodes.length) return invalid(reasonCodes, { plan, prohibitedKeys: userSensitiveKeys });
  return {
    ok: true,
    policyVersion: BROWSER_ACTION_POLICY_VERSION,
    status: hasMutation ? 'MUTATION_PLAN_PREPARED' : 'READ_ONLY_PLAN_PREPARED',
    plan,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function recordBrowserActionOutcome({
  plan,
  status,
  browserReceiptRef = null,
  outcomeRef = null,
  observedAt,
  receivedAt
} = {}) {
  if (!plan || typeof plan !== 'object' || !plan.planId) return invalid(['valid-browser-plan-required']);
  const normalizedStatus = String(status ?? '').trim().toUpperCase();
  const allowed = new Set(['READ_ONLY_COMPLETE', 'MUTATION_CONFIRMED', 'MUTATION_REJECTED', 'UNCERTAIN_EXTERNAL_STATE']);
  const reasonCodes = [];
  if (!allowed.has(normalizedStatus)) reasonCodes.push('invalid-browser-outcome-status');
  const observed = iso(observedAt);
  const received = iso(receivedAt);
  if (!observed) reasonCodes.push('observed-at-required');
  if (!received) reasonCodes.push('received-at-required');
  if (observed && received && new Date(observed).getTime() > new Date(received).getTime() + 300_000) {
    reasonCodes.push('future-dated-browser-outcome');
  }
  const receiptRef = browserReceiptRef == null ? null : text(browserReceiptRef, 240);
  const normalizedOutcomeRef = outcomeRef == null ? null : text(outcomeRef, 240);
  if (plan.effectClass === 'READ_ONLY' && normalizedStatus !== 'READ_ONLY_COMPLETE') reasonCodes.push('read-only-plan-cannot-claim-mutation-outcome');
  if (plan.effectClass === 'EXTERNAL_MUTATION' && normalizedStatus === 'READ_ONLY_COMPLETE') reasonCodes.push('mutation-plan-requires-mutation-outcome');
  if (plan.effectClass === 'EXTERNAL_MUTATION' && ['MUTATION_CONFIRMED', 'MUTATION_REJECTED'].includes(normalizedStatus) && !receiptRef) {
    reasonCodes.push('browser-receipt-ref-required-for-mutation-truth');
  }
  if (normalizedStatus === 'MUTATION_CONFIRMED' && !normalizedOutcomeRef) reasonCodes.push('outcome-ref-required-for-confirmed-mutation');
  if (reasonCodes.length) return invalid(reasonCodes);
  return {
    ok: true,
    policyVersion: BROWSER_ACTION_POLICY_VERSION,
    status: normalizedStatus,
    planId: plan.planId,
    occurrenceKey: plan.occurrenceKey,
    idempotencyKey: plan.idempotencyKey,
    browserReceiptRef: receiptRef,
    outcomeRef: normalizedOutcomeRef,
    observedAt: observed,
    receivedAt: received,
    retryDisposition: normalizedStatus === 'UNCERTAIN_EXTERNAL_STATE'
      ? 'BLOCK_RETRY_UNTIL_RECONCILED'
      : normalizedStatus === 'MUTATION_CONFIRMED'
        ? 'ALREADY_COMPLETED'
        : 'SAFE_TO_REEVALUATE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function planBrowserRetry({ plan, priorOutcome } = {}) {
  if (!plan || !plan.planId) return invalid(['valid-browser-plan-required']);
  if (!priorOutcome || priorOutcome.ok !== true || priorOutcome.planId !== plan.planId) {
    return invalid(['matching-prior-browser-outcome-required']);
  }
  if (priorOutcome.status === 'UNCERTAIN_EXTERNAL_STATE') {
    return {
      ok: true,
      policyVersion: BROWSER_ACTION_POLICY_VERSION,
      status: 'RETRY_BLOCKED_UNCERTAIN_EXTERNAL_STATE',
      executable: false,
      reasonCodes: ['browser-mutation-outcome-must-be-reconciled-before-retry'],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EFFECTS)
    };
  }
  if (priorOutcome.status === 'MUTATION_CONFIRMED') {
    return {
      ok: true,
      policyVersion: BROWSER_ACTION_POLICY_VERSION,
      status: 'ALREADY_COMPLETED',
      executable: false,
      reasonCodes: ['idempotent-browser-mutation-already-confirmed'],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EFFECTS)
    };
  }
  return {
    ok: true,
    policyVersion: BROWSER_ACTION_POLICY_VERSION,
    status: 'RETRY_REEVALUATION_ALLOWED',
    executable: false,
    reasonCodes: ['fresh-consequence-evaluation-required-before-execution'],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function unconfiguredResult(providerName, capability) {
  return {
    ok: false,
    policyVersion: BROWSER_ACTION_POLICY_VERSION,
    status: 'BROWSER_ADAPTER_NOT_CONFIGURED',
    provider: providerName,
    capability,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function createUnconfiguredBrowserActionAdapter(providerName = 'unknown') {
  const name = slug(providerName, 80) || 'unknown';
  const adapter = { providerName: name, configured: false };
  for (const capability of BROWSER_ACTION_PROVIDER_CAPABILITIES) {
    adapter[capability] = async () => unconfiguredResult(name, capability);
  }
  adapter.dryRunSupported = async () => ({
    ok: true,
    policyVersion: BROWSER_ACTION_POLICY_VERSION,
    status: 'DRY_RUN_ONLY',
    provider: name,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  });
  return adapter;
}

export function validateBrowserActionAdapter(adapter) {
  const missing = BROWSER_ACTION_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function');
  return { ok: missing.length === 0, policyVersion: BROWSER_ACTION_POLICY_VERSION, missing };
}
