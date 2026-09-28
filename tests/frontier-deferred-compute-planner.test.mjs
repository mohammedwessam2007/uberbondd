import test from 'node:test';
import assert from 'node:assert/strict';
import { planFrontierDeferredCompute } from '../src/frontier-deferred-compute-planner.mjs';

const pricingByMode = {
  INTERACTIVE: {
    inputUsdPerMillion: 4,
    outputUsdPerMillion: 20,
    cacheReadUsdPerMillion: 0.2,
    sourceRef: 'official://interactive',
    verifiedAt: '2026-09-29T00:00:00Z'
  },
  ANTHROPIC_BATCH: {
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cacheReadUsdPerMillion: 0.1,
    sourceRef: 'official://batch',
    verifiedAt: '2026-09-29T00:00:00Z'
  },
  OPENAI_FLEX: {
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 25,
    cacheReadUsdPerMillion: 0.5,
    sourceRef: 'official://flex',
    verifiedAt: '2026-09-29T00:00:00Z'
  },
  OPENAI_BATCH: {
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 25,
    cacheReadUsdPerMillion: 0.5,
    sourceRef: 'official://batch-openai',
    verifiedAt: '2026-09-29T00:00:00Z'
  }
};

function job(overrides = {}) {
  return {
    jobId: 'j1',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    revision: 'opus-5-5-2026-09-22',
    reasoningSettingRef: 'anthropic:effort=max',
    promptPrefixDigest: 'a'.repeat(64),
    estimatedInputTokens: 100000,
    estimatedCachedInputTokens: 90000,
    maxOutputTokens: 2000,
    latestAcceptableDelayMinutes: 1440,
    dataClass: 'SOURCE_CODE',
    ...overrides
  };
}

test('same Opus 5.5 max identity may move to Anthropic Batch without a model downgrade', () => {
  const out = planFrontierDeferredCompute({
    jobs: [job()],
    capabilities: { anthropicBatch: true },
    pricingByMode
  });
  assert.equal(out.ok, true);
  assert.equal(out.plans[0].mode, 'ANTHROPIC_BATCH');
  assert.equal(out.plans[0].cognitiveIdentity.model, 'claude-opus-5-5');
  assert.equal(out.plans[0].cognitiveIdentity.reasoningSettingRef, 'anthropic:effort=max');
  assert.match(out.plans[0].sameModelQualityInvariant, /IDENTICAL/);
  assert.equal(out.executionAuthorized, false);
});

test('OpenAI delayed job prefers Batch over Flex when both are available', () => {
  const out = planFrontierDeferredCompute({
    jobs: [job({
      provider: 'openai',
      model: 'gpt-6-astra',
      revision: 'astra-2026-09',
      reasoningSettingRef: 'openai:reasoning=max',
      latestAcceptableDelayMinutes: 1440
    })],
    capabilities: { openaiBatch: true, openaiFlex: true },
    pricingByMode
  });
  assert.equal(out.ok, true);
  assert.equal(out.plans[0].mode, 'OPENAI_BATCH');
  assert.equal(out.plans[0].cognitiveIdentity.model, 'gpt-6-astra');
});

test('OpenAI short-deferred job may use Flex while preserving Astra max', () => {
  const out = planFrontierDeferredCompute({
    jobs: [job({
      provider: 'openai',
      model: 'gpt-6-astra',
      revision: 'astra-2026-09',
      reasoningSettingRef: 'openai:reasoning=max',
      latestAcceptableDelayMinutes: 30
    })],
    capabilities: { openaiBatch: true, openaiFlex: true },
    pricingByMode
  });
  assert.equal(out.ok, true);
  assert.equal(out.plans[0].mode, 'OPENAI_FLEX');
  assert.equal(out.plans[0].cognitiveIdentity.reasoningSettingRef, 'openai:reasoning=max');
});

test('without deferred capability the exact model stays interactive rather than downgrading', () => {
  const out = planFrontierDeferredCompute({
    jobs: [job()],
    capabilities: {},
    pricingByMode
  });
  assert.equal(out.ok, true);
  assert.equal(out.plans[0].mode, 'INTERACTIVE');
  assert.equal(out.plans[0].cognitiveIdentity.model, 'claude-opus-5-5');
});

test('planner refuses deferred economics without verified mode-specific pricing', () => {
  const out = planFrontierDeferredCompute({
    jobs: [job()],
    capabilities: { anthropicBatch: true },
    pricingByMode: { ...pricingByMode, ANTHROPIC_BATCH: { inputUsdPerMillion: 2, outputUsdPerMillion: 10 } }
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('anthropic_batch-verified-pricing-required'));
});

test('unsafe data class is refused before a deferred plan exists', () => {
  const out = planFrontierDeferredCompute({
    jobs: [job({ dataClass: 'PRIVATE_SECRET' })],
    capabilities: { anthropicBatch: true },
    pricingByMode
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(code => code.includes('safe-data-class-required')));
});
