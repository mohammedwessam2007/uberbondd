import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEB_EXTRACTION_PROVIDER_CAPABILITIES,
  compileWebExtractionRequest,
  createUnconfiguredWebExtractionAdapter,
  foldWebExtractionResults,
  hashExtractedContent,
  normalizeWebExtractionResult,
  validateWebExtractionAdapter
} from '../src/web-context-extraction-contract.mjs';

const observedAt = '2026-08-28T15:00:00.000Z';
const receivedAt = '2026-08-28T15:00:01.000Z';
function request(overrides = {}) {
  return {
    operation: 'CRAWL', occurrenceKey: 'crawl:example.com:2026-08-28', targetRef: 'public-url:https://example.com',
    sourcePolicyRef: 'source-policy:public-web:1', robotsDecisionRef: 'robots:example.com:allow',
    termsPurposeRef: 'purpose:market-research:1', publicSourceCheckRef: 'public-source:example.com:1',
    maxPages: 25, maxDepth: 2, maxBytes: 2_000_000, maxSpendCents: 0, ...overrides
  };
}
function result(overrides = {}) {
  return {
    provider: 'crawler-provider', providerEventId: 'evt-1', requestId: 'webx_req_1', status: 'COMPLETED',
    providerReceiptRef: 'provider-receipt:1', contentArtifactRef: 'artifact:web:1',
    contentHash: hashExtractedContent('bounded extracted evidence'), pagesFetched: 5, bytesFetched: 10000, spendCents: 0,
    observedAt, receivedAt, ...overrides
  };
}

test('bounded public extraction request has no execution authority by itself', () => {
  const compiled = compileWebExtractionRequest(request());
  assert.equal(compiled.ok, true);
  assert.equal(compiled.request.executionAuthority, 'NONE');
  assert.equal(compiled.request.extractionTruthClass, 'PUBLIC_SOURCE_EVIDENCE_ONLY');
  assert.equal(compiled.externalEffectLedger.providerCalls, 0);
});

test('source policy, robots, terms/purpose and public-source proof are mandatory', () => {
  for (const field of ['sourcePolicyRef', 'robotsDecisionRef', 'termsPurposeRef', 'publicSourceCheckRef']) {
    const compiled = compileWebExtractionRequest(request({ [field]: null }));
    assert.equal(compiled.ok, false, field);
  }
});

test('crawl ceilings fail closed rather than silently expand', () => {
  for (const overrides of [{ maxPages: 1001 }, { maxDepth: 11 }, { maxBytes: 100_000_001 }, { maxSpendCents: 1_000_001 }]) {
    assert.equal(compileWebExtractionRequest(request(overrides)).ok, false);
  }
});

test('positive provider spend requires explicit budget authority reference', () => {
  const blocked = compileWebExtractionRequest(request({ maxSpendCents: 50 }));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.includes('budget-authority-ref-required-for-paid-extraction'));
  assert.equal(compileWebExtractionRequest(request({ maxSpendCents: 50, budgetAuthorityRef: 'budget:research:1' })).ok, true);
});

test('credentialed/private extraction, CAPTCHA bypass and personal-data inference are prohibited', () => {
  for (const overrides of [
    { credentialedAccess: true }, { privateSource: true }, { captchaBypass: true }, { personalDataInference: true },
    { intent: 'CAPTCHA_BYPASS' }, { intent: 'PRIVATE_ACCOUNT_ACCESS' }
  ]) {
    const compiled = compileWebExtractionRequest(request(overrides));
    assert.equal(compiled.ok, false, JSON.stringify(overrides));
  }
});

test('raw web content and credentials cannot enter durable extraction requests', () => {
  const compiled = compileWebExtractionRequest(request({ rawHtml: '<html>secret</html>', authToken: 'credential-shaped-field' }));
  assert.equal(compiled.ok, false);
  assert.ok(compiled.reasonCodes.includes('raw-web-content-or-secret-prohibited'));
});

test('completed/partial evidence requires artifact reference and SHA-256 content hash', () => {
  assert.equal(normalizeWebExtractionResult(result()).ok, true);
  for (const field of ['contentArtifactRef', 'contentHash']) {
    const normalized = normalizeWebExtractionResult(result({ [field]: null }));
    assert.equal(normalized.ok, false, field);
  }
});

test('extracted content is evidence only and cannot manufacture buyer/payment/revenue truth', () => {
  const normalized = normalizeWebExtractionResult(result());
  assert.equal(normalized.ok, true);
  assert.equal(normalized.result.commercialTruthAuthority, 'NONE');
  assert.equal(normalized.result.evidenceClassification, 'WEB_EXTRACTION_EVIDENCE_NOT_BUYER_PAYMENT_OR_REVENUE_TRUTH');
});

test('raw extracted content is prohibited from durable result envelope', () => {
  const normalized = normalizeWebExtractionResult(result({ rawContent: 'entire website text' }));
  assert.equal(normalized.ok, false);
  assert.ok(normalized.reasonCodes.includes('raw-web-content-or-secret-prohibited'));
});

test('provider event replay is idempotent and conflicting identity fails uncertain', () => {
  const exact = result();
  const replay = foldWebExtractionResults([exact, exact]);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicateCount, 1);
  const conflict = foldWebExtractionResults([exact, { ...exact, status: 'REJECTED', contentArtifactRef: null, contentHash: null }]);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 'UNCERTAIN_EXTERNAL_STATE');
});

test('contradictory terminal provider outcomes fail uncertain', () => {
  const completed = result({ providerEventId: 'complete' });
  const rejected = result({ providerEventId: 'reject', status: 'REJECTED', contentArtifactRef: null, contentHash: null });
  const folded = foldWebExtractionResults([completed, rejected]);
  assert.equal(folded.ok, false);
  assert.equal(folded.status, 'UNCERTAIN_EXTERNAL_STATE');
});

test('cursor-bearing partial outcome blocks blind retry until reconciled', () => {
  const partial = result({ status: 'PARTIAL', nextCursorRef: 'cursor:2' });
  const folded = foldWebExtractionResults([partial]);
  assert.equal(folded.ok, true);
  assert.equal(folded.nextCursorRef, 'cursor:2');
  assert.equal(folded.retryDisposition, 'BLOCK_RETRY_UNTIL_RECONCILED');
});

test('future-dated provider result fails closed', () => {
  const normalized = normalizeWebExtractionResult(result({ observedAt: '2026-08-29T00:00:00.000Z' }));
  assert.equal(normalized.ok, false);
  assert.ok(normalized.reasonCodes.includes('future-dated-extraction-result'));
});

test('unconfigured extraction adapter is structurally complete and performs no I/O', async () => {
  const adapter = createUnconfiguredWebExtractionAdapter('crawlee');
  assert.equal(validateWebExtractionAdapter(adapter).ok, true);
  assert.equal(WEB_EXTRACTION_PROVIDER_CAPABILITIES.every(capability => typeof adapter[capability] === 'function'), true);
  const response = await adapter.crawl({ requestId: 'webx_req_1' });
  assert.equal(response.ok, false);
  assert.equal(response.status, 'WEB_EXTRACTION_PROVIDER_NOT_CONFIGURED');
  assert.equal(response.externalEffectLedger.providerCalls, 0);
});
