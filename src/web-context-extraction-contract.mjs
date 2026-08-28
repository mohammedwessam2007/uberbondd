import crypto from 'node:crypto';

export const WEB_CONTEXT_EXTRACTION_POLICY_VERSION = 'web-context-extraction-contract-1.0.0';
export const WEB_EXTRACTION_OPERATIONS = Object.freeze(['SEARCH', 'CRAWL', 'EXTRACT']);
export const WEB_EXTRACTION_PROVIDER_CAPABILITIES = Object.freeze([
  'identity', 'authenticationMethod', 'termsAndAllowedPurposes', 'dryRunSupported', 'liveSupported',
  'search', 'crawl', 'extract', 'status', 'resume', 'receipts', 'cancel'
]);
const PROHIBITED_INTENTS = new Set(['CAPTCHA_BYPASS', 'AUTH_BYPASS', 'PRIVATE_ACCOUNT_ACCESS', 'PERSONAL_DATA_INFERENCE']);
const SENSITIVE_KEYS = /(?:password|secret|token|authorization|cookie|credential|api[_-]?key|session|privatekey|raw(?:html|content|payload|body)|personalemail|privateemail|login|username)/i;
const SAFE_REFERENCE_KEYS = new Set([
  'sourcePolicyRef', 'robotsDecisionRef', 'termsPurposeRef', 'publicSourceCheckRef',
  'budgetAuthorityRef', 'providerReceiptRef', 'contentArtifactRef', 'cursorRef', 'nextCursorRef'
]);
const ZERO_EFFECTS = Object.freeze({ providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 });

function clone(value) { return structuredClone(value); }
function text(value, max = 240) { const s = String(value ?? '').trim(); return s && s.length <= max ? s : null; }
function slug(value, max = 120) { const s = text(value, max); if (!s) return null; return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || null; }
function iso(value) { const s = text(value, 80); if (!s) return null; const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function invalid(reasonCodes, extra = {}) { return { ok: false, policyVersion: WEB_CONTEXT_EXTRACTION_POLICY_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS), ...extra }; }
function sensitiveKeys(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(String(key)) && !SAFE_REFERENCE_KEYS.has(String(key))) found.push(String(key));
    if (child && typeof child === 'object') found.push(...sensitiveKeys(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 30);
}
function boundedInteger(value, min, max) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

export function compileWebExtractionRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['web-extraction-request-object-required']);
  const operation = String(input.operation ?? '').trim().toUpperCase();
  const occurrenceKey = text(input.occurrenceKey, 300);
  const targetRef = text(input.targetRef, 240);
  const sourcePolicyRef = text(input.sourcePolicyRef, 240);
  const robotsDecisionRef = text(input.robotsDecisionRef, 240);
  const termsPurposeRef = text(input.termsPurposeRef, 240);
  const publicSourceCheckRef = text(input.publicSourceCheckRef, 240);
  const cursorRef = input.cursorRef == null ? null : text(input.cursorRef, 240);
  const maxPages = boundedInteger(input.maxPages ?? 5, 1, 1000);
  const maxDepth = boundedInteger(input.maxDepth ?? 2, 0, 10);
  const maxBytes = boundedInteger(input.maxBytes ?? 1_000_000, 1_000, 100_000_000);
  const maxSpendCents = boundedInteger(input.maxSpendCents ?? 0, 0, 1_000_000);
  const budgetAuthorityRef = input.budgetAuthorityRef == null ? null : text(input.budgetAuthorityRef, 240);
  const intent = String(input.intent ?? 'PUBLIC_EVIDENCE_RESEARCH').trim().toUpperCase();
  const reasonCodes = [];
  if (!WEB_EXTRACTION_OPERATIONS.includes(operation)) reasonCodes.push('invalid-web-extraction-operation');
  if (!occurrenceKey) reasonCodes.push('occurrence-key-required-or-too-long');
  if (!targetRef) reasonCodes.push('target-ref-required');
  if (!sourcePolicyRef) reasonCodes.push('source-policy-ref-required');
  if (!robotsDecisionRef) reasonCodes.push('robots-decision-ref-required');
  if (!termsPurposeRef) reasonCodes.push('terms-purpose-ref-required');
  if (!publicSourceCheckRef) reasonCodes.push('public-source-check-ref-required');
  if (maxPages == null) reasonCodes.push('invalid-max-pages');
  if (maxDepth == null) reasonCodes.push('invalid-max-depth');
  if (maxBytes == null) reasonCodes.push('invalid-max-bytes');
  if (maxSpendCents == null) reasonCodes.push('invalid-max-spend-cents');
  if (maxSpendCents > 0 && !budgetAuthorityRef) reasonCodes.push('budget-authority-ref-required-for-paid-extraction');
  if (PROHIBITED_INTENTS.has(intent)) reasonCodes.push('prohibited-web-extraction-intent');
  if (input.credentialedAccess === true) reasonCodes.push('credentialed-web-access-prohibited');
  if (input.captchaBypass === true) reasonCodes.push('captcha-bypass-prohibited');
  if (input.privateSource === true) reasonCodes.push('private-source-extraction-prohibited');
  if (input.personalDataInference === true) reasonCodes.push('personal-data-inference-prohibited');
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-web-content-or-secret-prohibited');
  const request = {
    schemaVersion: 'web-context-extraction-request-1.0.0', operation, occurrenceKey, targetRef,
    sourcePolicyRef, robotsDecisionRef, termsPurposeRef, publicSourceCheckRef, cursorRef,
    maxPages, maxDepth, maxBytes, maxSpendCents, budgetAuthorityRef, intent,
    executionAuthority: 'NONE',
    extractionTruthClass: 'PUBLIC_SOURCE_EVIDENCE_ONLY',
    durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_CONTENT_OR_CREDENTIALS'
  };
  request.requestId = WEB_EXTRACTION_OPERATIONS.includes(operation) && occurrenceKey && targetRef
    ? `webx_req_${digest(request).slice(0, 32)}` : null;
  if (reasonCodes.length) return invalid(reasonCodes, { request, prohibitedKeys: prohibited });
  return { ok: true, policyVersion: WEB_CONTEXT_EXTRACTION_POLICY_VERSION, status: 'WEB_EXTRACTION_REQUEST_PREPARED', request, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function normalizeWebExtractionResult(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['web-extraction-result-object-required']);
  const provider = slug(input.provider, 80);
  const providerEventId = text(input.providerEventId, 200);
  const requestId = text(input.requestId, 200);
  const providerReceiptRef = text(input.providerReceiptRef, 240);
  const contentArtifactRef = text(input.contentArtifactRef, 240);
  const contentHash = text(input.contentHash, 64)?.toLowerCase() || null;
  const nextCursorRef = input.nextCursorRef == null ? null : text(input.nextCursorRef, 240);
  const pagesFetched = boundedInteger(input.pagesFetched, 0, 1000);
  const bytesFetched = boundedInteger(input.bytesFetched, 0, 100_000_000);
  const spendCents = boundedInteger(input.spendCents ?? 0, 0, 1_000_000);
  const observedAt = iso(input.observedAt);
  const receivedAt = iso(input.receivedAt);
  const status = String(input.status ?? '').trim().toUpperCase();
  const reasonCodes = [];
  if (!provider) reasonCodes.push('provider-required');
  if (!providerEventId) reasonCodes.push('provider-event-id-required-or-too-long');
  if (!requestId) reasonCodes.push('request-id-required');
  if (!providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-extraction-truth');
  if (!['COMPLETED', 'PARTIAL', 'REJECTED', 'UNCERTAIN'].includes(status)) reasonCodes.push('invalid-extraction-result-status');
  if (['COMPLETED', 'PARTIAL'].includes(status) && !contentArtifactRef) reasonCodes.push('content-artifact-ref-required-for-extracted-evidence');
  if (['COMPLETED', 'PARTIAL'].includes(status) && !/^[a-f0-9]{64}$/.test(contentHash || '')) reasonCodes.push('sha256-content-hash-required-for-extracted-evidence');
  if (pagesFetched == null) reasonCodes.push('invalid-pages-fetched');
  if (bytesFetched == null) reasonCodes.push('invalid-bytes-fetched');
  if (spendCents == null) reasonCodes.push('invalid-spend-cents');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) reasonCodes.push('future-dated-extraction-result');
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-web-content-or-secret-prohibited');
  const result = {
    schemaVersion: 'web-context-extraction-result-1.0.0', provider, providerEventId,
    eventId: provider && providerEventId ? `webx_evt_${digest([provider, providerEventId]).slice(0, 32)}` : null,
    requestId, status, providerReceiptRef, contentArtifactRef, contentHash, nextCursorRef,
    pagesFetched, bytesFetched, spendCents, observedAt, receivedAt,
    evidenceClassification: 'WEB_EXTRACTION_EVIDENCE_NOT_BUYER_PAYMENT_OR_REVENUE_TRUTH',
    commercialTruthAuthority: 'NONE',
    durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_CONTENT_OR_CREDENTIALS'
  };
  if (reasonCodes.length) return invalid(reasonCodes, { result, prohibitedKeys: prohibited });
  return { ok: true, policyVersion: WEB_CONTEXT_EXTRACTION_POLICY_VERSION, result, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function foldWebExtractionResults(results = []) {
  if (!Array.isArray(results)) return invalid(['web-extraction-results-array-required']);
  const kept = []; const byId = new Map(); const errors = []; const duplicates = []; const conflicts = [];
  results.forEach((input, index) => {
    const normalized = normalizeWebExtractionResult(input);
    if (!normalized.ok) { errors.push({ index, reasonCodes: normalized.reasonCodes }); return; }
    const result = normalized.result; const prior = byId.get(result.eventId);
    if (!prior) { byId.set(result.eventId, result); kept.push(result); }
    else if (JSON.stringify(prior) === JSON.stringify(result)) duplicates.push({ eventId: result.eventId, index });
    else conflicts.push({ eventId: result.eventId, index });
  });
  if (errors.length || conflicts.length) return invalid([...(errors.length ? ['invalid-web-extraction-result'] : []), ...(conflicts.length ? ['conflicting-provider-event-identity'] : [])], { status: 'UNCERTAIN_EXTERNAL_STATE', errors, duplicates, conflicts });
  if (!kept.length) return invalid(['web-extraction-result-required']);
  const requests = [...new Set(kept.map(result => result.requestId))];
  if (requests.length !== 1) return invalid(['mixed-web-extraction-request-results']);
  const terminal = kept.filter(result => ['COMPLETED', 'REJECTED', 'UNCERTAIN'].includes(result.status));
  if (terminal.length > 1 && new Set(terminal.map(result => result.status)).size > 1) return invalid(['contradictory-extraction-terminal-truth'], { status: 'UNCERTAIN_EXTERNAL_STATE', requestId: requests[0] });
  const ordered = [...kept].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt) || a.eventId.localeCompare(b.eventId));
  const latest = ordered.at(-1);
  return {
    ok: true, policyVersion: WEB_CONTEXT_EXTRACTION_POLICY_VERSION, status: 'WEB_EXTRACTION_LIFECYCLE_FOLDED', requestId: requests[0],
    state: latest.status, eventIds: ordered.map(result => result.eventId), duplicateCount: duplicates.length,
    nextCursorRef: latest.nextCursorRef, evidenceClassification: latest.evidenceClassification,
    retryDisposition: latest.status === 'COMPLETED' ? 'ALREADY_COMPLETED' : latest.status === 'REJECTED' ? 'SAFE_TO_REEVALUATE' : 'BLOCK_RETRY_UNTIL_RECONCILED',
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function hashExtractedContent(content) {
  return sha256(content);
}

function unconfigured(provider, capability) { return { ok: false, policyVersion: WEB_CONTEXT_EXTRACTION_POLICY_VERSION, status: 'WEB_EXTRACTION_PROVIDER_NOT_CONFIGURED', provider, capability, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) }; }
export function createUnconfiguredWebExtractionAdapter(providerName = 'unknown') {
  const provider = slug(providerName, 80) || 'unknown'; const adapter = { providerName: provider, configured: false };
  for (const capability of WEB_EXTRACTION_PROVIDER_CAPABILITIES) adapter[capability] = async () => unconfigured(provider, capability);
  adapter.dryRunSupported = async () => ({ ok: true, policyVersion: WEB_CONTEXT_EXTRACTION_POLICY_VERSION, status: 'DRY_RUN_ONLY', provider, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) });
  return adapter;
}
export function validateWebExtractionAdapter(adapter) {
  const missing = WEB_EXTRACTION_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function');
  return { ok: missing.length === 0, policyVersion: WEB_CONTEXT_EXTRACTION_POLICY_VERSION, missing };
}
