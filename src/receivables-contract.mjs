import crypto from 'node:crypto';

export const RECEIVABLES_POLICY_VERSION = 'receivables-contract-1.0.0';

export const RECEIVABLE_OPERATIONS = Object.freeze([
  'PREPARE_QUOTE',
  'CREATE_QUOTE',
  'CREATE_INVOICE',
  'ISSUE_INVOICE',
  'SEND_REMINDER',
  'VOID_INVOICE'
]);
export const RECEIVABLE_EVENT_TYPES = Object.freeze([
  'QUOTE_CREATED',
  'INVOICE_CREATED',
  'INVOICE_ISSUED',
  'REMINDER_SENT',
  'INVOICE_VOIDED',
  'PAYMENT_LINKED',
  'PROVIDER_REJECTED'
]);
export const RECEIVABLE_PROVIDER_CAPABILITIES = Object.freeze([
  'identity', 'authenticationMethod', 'termsAndAllowedPurposes', 'dryRunSupported', 'liveSupported',
  'createQuote', 'createInvoice', 'issueInvoice', 'sendReminder', 'voidInvoice', 'getReceivable',
  'receipts', 'cancel'
]);

const EXTERNAL_MUTATIONS = new Set(['CREATE_QUOTE', 'CREATE_INVOICE', 'ISSUE_INVOICE', 'SEND_REMINDER', 'VOID_INVOICE']);
const SENSITIVE_KEYS = /(?:email|phone|customername|fullname|address|message|body|notes?|description|card|bank|accountnumber|routing|iban|password|secret|token|authorization|cookie|credential|api[_-]?key|raw(?:payload|body|value))/i;
const ZERO_EFFECTS = Object.freeze({ providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 });

function clone(value) { return structuredClone(value); }
function text(value, max = 240) { const v = String(value ?? '').trim(); return v && v.length <= max ? v : null; }
function slug(value, max = 120) { const v = text(value, max); if (!v) return null; return v.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || null; }
function iso(value) { const v = text(value, 80); if (!v) return null; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function invalid(reasonCodes, extra = {}) { return { ok: false, policyVersion: RECEIVABLES_POLICY_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS), ...extra }; }
function sensitiveKeys(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(String(key))) found.push(String(key));
    if (child && typeof child === 'object') found.push(...sensitiveKeys(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 20);
}
function safeCents(value) { return Number.isSafeInteger(value) && value >= 0 ? value : null; }
function currency(value) { const v = String(value ?? '').trim().toUpperCase(); return /^[A-Z]{3}$/.test(v) ? v : null; }

export function compileReceivableCommand(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['receivable-command-object-required']);
  const operation = String(input.operation ?? '').trim().toUpperCase();
  const occurrenceKey = text(input.occurrenceKey, 300);
  const customerRef = text(input.customerRef, 200);
  const commercialTermsRef = text(input.commercialTermsRef, 240);
  const amountCents = safeCents(input.amountCents);
  const normalizedCurrency = currency(input.currency);
  const priorReceivableRef = input.priorReceivableRef == null ? null : text(input.priorReceivableRef, 200);
  const dueAt = input.dueAt == null ? null : iso(input.dueAt);
  const authorityReceiptRef = input.authorityReceiptRef == null ? null : text(input.authorityReceiptRef, 240);
  const idempotencyKey = input.idempotencyKey == null ? null : text(input.idempotencyKey, 300);
  const communicationPolicyRef = input.communicationPolicyRef == null ? null : text(input.communicationPolicyRef, 240);
  const suppressionCheckRef = input.suppressionCheckRef == null ? null : text(input.suppressionCheckRef, 240);
  const lineItemRefs = Array.isArray(input.lineItemRefs)
    ? [...new Set(input.lineItemRefs.map(item => text(item, 200)).filter(Boolean))].slice(0, 50)
    : [];
  const reasonCodes = [];
  if (!RECEIVABLE_OPERATIONS.includes(operation)) reasonCodes.push('invalid-receivable-operation');
  if (!occurrenceKey) reasonCodes.push('occurrence-key-required-or-too-long');
  if (!customerRef) reasonCodes.push('customer-ref-required-or-too-long');
  if (!commercialTermsRef) reasonCodes.push('commercial-terms-ref-required');
  if (amountCents == null) reasonCodes.push('valid-nonnegative-amount-cents-required');
  if (!normalizedCurrency) reasonCodes.push('iso-currency-required');
  if (lineItemRefs.length === 0) reasonCodes.push('line-item-ref-required');
  if (['ISSUE_INVOICE', 'SEND_REMINDER', 'VOID_INVOICE'].includes(operation) && !priorReceivableRef) reasonCodes.push('prior-receivable-ref-required');
  if (['CREATE_INVOICE', 'ISSUE_INVOICE'].includes(operation) && !dueAt) reasonCodes.push('due-at-required-for-invoice');
  if (EXTERNAL_MUTATIONS.has(operation) && !authorityReceiptRef) reasonCodes.push('authority-receipt-ref-required-for-receivable-effect');
  if (EXTERNAL_MUTATIONS.has(operation) && !idempotencyKey) reasonCodes.push('idempotency-key-required-for-receivable-effect');
  if (operation === 'SEND_REMINDER' && !communicationPolicyRef) reasonCodes.push('communication-policy-ref-required-for-reminder');
  if (operation === 'SEND_REMINDER' && !suppressionCheckRef) reasonCodes.push('suppression-check-ref-required-for-reminder');
  const prohibited = sensitiveKeys(input).filter(key => key !== 'authorityReceiptRef');
  if (prohibited.length) reasonCodes.push('raw-receivable-pii-or-secret-prohibited');
  const command = {
    schemaVersion: 'receivable-command-1.0.0', operation, occurrenceKey, customerRef, commercialTermsRef,
    amountCents, currency: normalizedCurrency, lineItemRefs, priorReceivableRef, dueAt, authorityReceiptRef,
    idempotencyKey, communicationPolicyRef, suppressionCheckRef,
    effectClass: EXTERNAL_MUTATIONS.has(operation) ? 'EXTERNAL_MUTATION' : 'LOCAL_PREPARATION',
    durablePayloadClass: 'REFERENCE_ONLY_NO_CUSTOMER_PII_NO_PAYMENT_CREDENTIALS'
  };
  command.commandId = RECEIVABLE_OPERATIONS.includes(operation) && occurrenceKey && customerRef && commercialTermsRef && normalizedCurrency
    ? `recv_cmd_${digest(command).slice(0, 32)}` : null;
  if (reasonCodes.length) return invalid(reasonCodes, { command, prohibitedKeys: prohibited });
  return { ok: true, policyVersion: RECEIVABLES_POLICY_VERSION, status: operation === 'PREPARE_QUOTE' ? 'LOCAL_QUOTE_PREPARED' : 'RECEIVABLE_COMMAND_PREPARED', command, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function normalizeReceivableProviderEvent(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['receivable-event-object-required']);
  const provider = slug(input.provider, 80);
  const providerEventId = text(input.providerEventId, 200);
  const commandId = text(input.commandId, 200);
  const eventType = String(input.eventType ?? '').trim().toUpperCase();
  const receivableRef = input.receivableRef == null ? null : text(input.receivableRef, 200);
  const providerReceiptRef = text(input.providerReceiptRef, 240);
  const communicationReceiptRef = input.communicationReceiptRef == null ? null : text(input.communicationReceiptRef, 240);
  const canonicalPaymentReceiptRef = input.canonicalPaymentReceiptRef == null ? null : text(input.canonicalPaymentReceiptRef, 240);
  const observedAt = iso(input.observedAt);
  const receivedAt = iso(input.receivedAt);
  const reasonCodes = [];
  if (!provider) reasonCodes.push('provider-required');
  if (!providerEventId) reasonCodes.push('provider-event-id-required-or-too-long');
  if (!commandId) reasonCodes.push('command-id-required-or-too-long');
  if (!RECEIVABLE_EVENT_TYPES.includes(eventType)) reasonCodes.push('invalid-receivable-event-type');
  if (!providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-receivable-truth');
  if (eventType !== 'PROVIDER_REJECTED' && !receivableRef) reasonCodes.push('receivable-ref-required-for-provider-truth');
  if (eventType === 'REMINDER_SENT' && !communicationReceiptRef) reasonCodes.push('communication-receipt-ref-required-for-reminder-sent-truth');
  if (eventType === 'PAYMENT_LINKED' && !canonicalPaymentReceiptRef) reasonCodes.push('canonical-payment-receipt-ref-required-for-paid-truth');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) reasonCodes.push('future-dated-receivable-event');
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-receivable-pii-or-secret-prohibited');
  const event = {
    schemaVersion: 'receivable-provider-event-1.0.0', provider, providerEventId,
    eventId: provider && providerEventId ? `recv_evt_${digest([provider, providerEventId]).slice(0, 32)}` : null,
    commandId, eventType, receivableRef, providerReceiptRef, communicationReceiptRef, canonicalPaymentReceiptRef,
    observedAt, receivedAt, durablePayloadClass: 'REFERENCE_ONLY_NO_CUSTOMER_PII_NO_PAYMENT_CREDENTIALS'
  };
  if (reasonCodes.length) return invalid(reasonCodes, { event, prohibitedKeys: prohibited });
  return { ok: true, policyVersion: RECEIVABLES_POLICY_VERSION, event, paymentTruthAuthority: eventType === 'PAYMENT_LINKED' ? 'CANONICAL_PAYMENT_RECEIPT_REFERENCE_ONLY' : 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function foldReceivableEvents(events = []) {
  if (!Array.isArray(events)) return invalid(['receivable-events-array-required']);
  const kept = []; const byId = new Map(); const duplicates = []; const conflicts = []; const errors = [];
  events.forEach((input, index) => {
    const normalized = normalizeReceivableProviderEvent(input);
    if (!normalized.ok) { errors.push({ index, reasonCodes: normalized.reasonCodes }); return; }
    const event = normalized.event; const prior = byId.get(event.eventId);
    if (!prior) { byId.set(event.eventId, event); kept.push(event); }
    else if (JSON.stringify(prior) === JSON.stringify(event)) duplicates.push({ eventId: event.eventId, index });
    else conflicts.push({ eventId: event.eventId, index });
  });
  if (errors.length || conflicts.length) return invalid([...(errors.length ? ['invalid-receivable-event'] : []), ...(conflicts.length ? ['conflicting-provider-event-identity'] : [])], { status: 'UNCERTAIN_EXTERNAL_STATE', errors, conflicts, duplicates });
  if (!kept.length) return invalid(['receivable-event-required']);
  const commandIds = [...new Set(kept.map(event => event.commandId))];
  if (commandIds.length !== 1) return invalid(['mixed-receivable-command-events']);
  const eventTypes = new Set(kept.map(event => event.eventType));
  if (eventTypes.has('INVOICE_VOIDED') && eventTypes.has('PAYMENT_LINKED')) return invalid(['contradictory-voided-and-paid-truth'], { status: 'UNCERTAIN_EXTERNAL_STATE', commandId: commandIds[0] });
  const ordered = [...kept].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt) || a.eventId.localeCompare(b.eventId));
  const latest = ordered.at(-1);
  let state = 'PROVIDER_OBSERVED';
  if (eventTypes.has('PAYMENT_LINKED')) state = 'PAYMENT_LINKED_TO_CANONICAL_RECEIPT';
  else if (eventTypes.has('INVOICE_VOIDED')) state = 'VOIDED';
  else if (eventTypes.has('REMINDER_SENT')) state = 'REMINDER_SENT';
  else if (eventTypes.has('INVOICE_ISSUED')) state = 'ISSUED';
  else if (eventTypes.has('INVOICE_CREATED')) state = 'INVOICE_CREATED';
  else if (eventTypes.has('QUOTE_CREATED')) state = 'QUOTE_CREATED';
  else if (eventTypes.has('PROVIDER_REJECTED')) state = 'PROVIDER_REJECTED';
  return { ok: true, policyVersion: RECEIVABLES_POLICY_VERSION, status: 'RECEIVABLE_LIFECYCLE_FOLDED', commandId: commandIds[0], state, receivableRef: latest.receivableRef, provider: latest.provider, eventIds: ordered.map(event => event.eventId), duplicateCount: duplicates.length, retryDisposition: ['PAYMENT_LINKED_TO_CANONICAL_RECEIPT', 'VOIDED'].includes(state) ? 'ALREADY_TERMINAL' : state === 'PROVIDER_REJECTED' ? 'SAFE_TO_REEVALUATE' : 'BLOCK_RETRY_UNTIL_RECONCILED', businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function planReceivableRetry({ command, lifecycle } = {}) {
  if (!command?.commandId) return invalid(['valid-receivable-command-required']);
  if (!lifecycle || lifecycle.ok !== true || lifecycle.commandId !== command.commandId) return invalid(['matching-receivable-lifecycle-required']);
  if (lifecycle.retryDisposition === 'ALREADY_TERMINAL') return { ok: true, policyVersion: RECEIVABLES_POLICY_VERSION, status: 'ALREADY_TERMINAL', executable: false, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
  if (lifecycle.retryDisposition === 'BLOCK_RETRY_UNTIL_RECONCILED') return { ok: true, policyVersion: RECEIVABLES_POLICY_VERSION, status: 'RETRY_BLOCKED_UNCERTAIN_EXTERNAL_STATE', executable: false, reasonCodes: ['provider-receivable-state-must-be-reconciled-before-retry'], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
  return { ok: true, policyVersion: RECEIVABLES_POLICY_VERSION, status: 'RETRY_REEVALUATION_ALLOWED', executable: false, reasonCodes: ['fresh-authority-and-commercial-terms-evaluation-required'], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

function unconfiguredResult(provider, capability) { return { ok: false, policyVersion: RECEIVABLES_POLICY_VERSION, status: 'RECEIVABLE_PROVIDER_NOT_CONFIGURED', provider, capability, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) }; }
export function createUnconfiguredReceivableProviderAdapter(providerName = 'unknown') {
  const provider = slug(providerName, 80) || 'unknown'; const adapter = { providerName: provider, configured: false };
  for (const capability of RECEIVABLE_PROVIDER_CAPABILITIES) adapter[capability] = async () => unconfiguredResult(provider, capability);
  adapter.dryRunSupported = async () => ({ ok: true, policyVersion: RECEIVABLES_POLICY_VERSION, status: 'DRY_RUN_ONLY', provider, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) });
  return adapter;
}
export function validateReceivableProviderAdapter(adapter) { const missing = RECEIVABLE_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function'); return { ok: missing.length === 0, policyVersion: RECEIVABLES_POLICY_VERSION, missing }; }
