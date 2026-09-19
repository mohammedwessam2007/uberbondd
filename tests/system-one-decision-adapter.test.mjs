import assert from 'node:assert/strict';
import test from 'node:test';
import {
  choice,
  compileSystemOneRequest,
  createSystemOneDecisionAdapter,
  inspectSystemOneReadiness,
  noul,
  score
} from '../src/system-one-decision-adapter.mjs';

const pricing = {
  inputUsdPerMillion: 0.042,
  outputUsdPerMillion: 0,
  sourceRef: 'https://typesafe.ai/blog/introducing-system-one-models-and-jev',
  verifiedAt: '2026-09-19T00:00:00.000Z'
};

test('compiles TypeSafe-compatible Noul, Choice and Score questions without granting authority', () => {
  const result = compileSystemOneRequest({
    state: { ticket: 'charged twice' },
    questions: {
      urgent: noul('Is this urgent?'),
      intent: choice('Main intent?', { refund: null, support: null }),
      frustration: score('Frustration?', ['calm', 'angry'])
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.model, 'jev-latest');
  assert.equal(result.questionCount, 3);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});

test('readiness is fail-closed on credential, pricing and explicit enablement', () => {
  const none = inspectSystemOneReadiness({});
  assert.equal(none.ok, false);
  assert.deepEqual(new Set(none.blockers), new Set(['credential-absent', 'pricing-evidence-absent', 'explicitly-disabled']));
  const ready = inspectSystemOneReadiness({ apiKey: 'secret-value', pricing, enabled: true });
  assert.equal(ready.ok, true);
  assert.equal(ready.credentialPresent, true);
  assert.equal('apiKey' in ready, false);
});

test('adapter refuses a real provider call without per-call authorization', async () => {
  let calls = 0;
  const adapter = createSystemOneDecisionAdapter({
    apiKey: 'secret-value', pricing, enabled: true,
    fetchImpl: async () => { calls++; throw new Error('should not run'); }
  });
  const result = await adapter.evaluate({ state: { x: 1 }, questions: { relevant: noul('Relevant?') } });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SYSTEM_ONE_PROVIDER_CALL_NOT_AUTHORIZED');
  assert.equal(calls, 0);
});

test('direct TypeSafe transport uses documented endpoint and normalizes typed answers', async () => {
  let request = null;
  const adapter = createSystemOneDecisionAdapter({
    apiKey: 'secret-value', pricing, enabled: true,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        model: 'jev-1.13',
        answers: {
          urgent: { type: 'noul', noul: 0.9 },
          intent: { type: 'choice', choice: 'refund', confidence: 0.8, probabilities: { refund: 0.8, support: 0.2 } },
          frustration: { type: 'score', score: 1.5, confidence: 0.7, probabilities: { '0': 0.1, '1': 0.3, '2': 0.6 }, legend: { '0': 'calm', '1': 'concerned', '2': 'angry' } }
        },
        usage: { input_tokens: 1000, output_tokens: 0 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const result = await adapter.evaluate({
    state: { ticket: 'refund me now' },
    questions: {
      urgent: noul('Urgent?'),
      intent: choice('Intent?', { refund: null, support: null }),
      frustration: score('Frustration?', ['calm', 'concerned', 'angry'])
    },
    providerCallAuthorized: true
  });
  assert.equal(result.ok, true);
  assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(request.init.method, 'POST');
  assert.match(request.init.headers.Authorization, /^Bearer /);
  assert.equal(request.init.headers.Authorization.includes('secret-value'), true);
  assert.equal(JSON.parse(request.init.body).model, 'jev-latest');
  assert.equal(result.answers.urgent.probability, 0.9);
  assert.equal(result.answers.intent.choice, 'refund');
  assert.equal(result.answers.frustration.score, 1.5);
  assert.equal(result.usage.inputTokens, 1000);
  assert.equal(result.usage.costUsd, 0.000042);
  assert.equal(result.externalEffectLedger.providerCalls, 1);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(JSON.stringify(result).includes('secret-value'), false);
});

test('malformed provider answers are refused rather than guessed', async () => {
  const adapter = createSystemOneDecisionAdapter({
    apiKey: 'secret-value', pricing, enabled: true,
    fetchImpl: async () => new Response(JSON.stringify({
      model: 'jev-1.13',
      answers: { decision: { type: 'choice', choice: 'invented', confidence: 0.99, probabilities: { yes: 0.5, no: 0.5 } } },
      usage: { input_tokens: 1, output_tokens: 0 }
    }), { status: 200 })
  });
  const result = await adapter.evaluate({
    state: 'x',
    questions: { decision: choice('Choose', { yes: null, no: null }) },
    providerCallAuthorized: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SYSTEM_ONE_PROVIDER_RESPONSE_REFUSED');
  assert.ok(result.reasonCodes.includes('invalid-answer:decision'));
});
